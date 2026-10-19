import express from 'express';
import bcrypt from 'bcryptjs';
import {createHash,createHmac} from 'node:crypto';
import {pool,tx} from './db.js';
import {requireServiceScope} from './service-auth.js';
import {UUID_PATTERN,accessError,getCompanyAccess,assertCompanyAccess,sendAccessError} from './company-access.js';
import {assertStateTransition} from './company-state-policy.js';
import {assertCommercialReady} from './commercial-conditions.js';
import {assertSubscriptionReady,companySubscriptionAction} from './subscription-service.js';
const router=express.Router();
router.param('id',(req,res,next,id)=>{if(!UUID_PATTERN.test(String(id)))return res.status(400).json({error:'Empresa inválida.',code:'ALTA_INVALIDA'});req.params.id=id.toLowerCase();next();});
const text=(value,max)=>{if(value==null)return '';if(typeof value!=='string'||value.trim().length>max)throw fail('Tipo o longitud de campo inválido.');return value.trim();};
const fail=message=>accessError(400,'ALTA_INVALIDA',message);
function fields(body,allowed){if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['command_id','motivo','administrador',...allowed].includes(k)))throw fail('Campos de alta inválidos.');if(!UUID_PATTERN.test(String(body.command_id||''))||!text(body.motivo,500)||body.motivo.length>500)throw fail('command_id UUID y motivo son obligatorios.');}
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
async function command(req,action,company,payload,fn){
 const id=req.body.command_id.toLowerCase(),motivo=req.body.motivo.trim();
 if(req.body.administrador!==undefined && (typeof req.body.administrador!=='string'||! /^[A-Za-z0-9._-]{3,40}$/.test(req.body.administrador)))throw fail('Administrador inválido.');
 const actor=req.service.sub+(req.body.administrador?':'+req.body.administrador:'');
 const hash=createHash('sha256').update(canonical([action,company,payload,motivo,req.service.sub])).digest('hex');
 try{return await tx(async db=>{
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
  const prior=await db.query('select request_hash,resultado from acciones_admin where command_id=$1',[id]);
  if(prior.rows[0]){if(prior.rows[0].request_hash!==hash)throw accessError(409,'COMANDO_REUTILIZADO','command_id corresponde a otro contenido.');return {...prior.rows[0].resultado,replayed:true};}
  const result=await fn(db),final={command_id:id,...result.data,replayed:false};
  await db.query(`insert into acciones_admin(command_id,empresa_id,accion,motivo,estado_anterior,estado_nuevo,resultado,request_hash,actor_servicio)
   values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,[id,result.empresa_id||null,action,motivo,result.before||'PENDIENTE',result.after||'PENDIENTE',JSON.stringify(final),hash,actor]);
  return final;
 });}catch(error){
  if(action==='ACTIVAR'&&company)try{const current=await getCompanyAccess(pool,company);await pool.query(`insert into acciones_admin_intentos(command_id,empresa_id,accion,administrador,motivo,estado_anterior,estado_nuevo,resultado,error) values($1,$2,'ACTIVAR',$3,$4,$5,'ACTIVO','ERROR',$6)`,[id,company,actor,motivo,current.estado,error.status&&/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'ERROR_INTERNO']);}catch{/* Compatibilidad con esquemas Fase 1/2. */}
  throw error;
 }
}
async function pending(db,id){
 if(!UUID_PATTERN.test(String(id)))throw fail('Empresa inválida.');
 const q=await db.query('select id,cliente_admin_id,activo,ruc,empresa_codigo from empresas where id=$1 for update',[id]);
 if(!q.rows[0])throw accessError(404,'EMPRESA_NO_EXISTE','Empresa no encontrada.');
 const access=await getCompanyAccess(db,id);
 if(access.estado!=='PENDIENTE')throw accessError(409,'ALTA_NO_PENDIENTE','Esta empresa ya no está pendiente de alta.');
 return {company:q.rows[0],access};
}
function handler(fn){return async(req,res)=>{try{res.json(await fn(req));}catch(error){if(error.code==='23505')return res.status(409).json({error:'Documento, RUC, código o registro inicial ya utilizado.',code:'ALTA_DUPLICADA'});if(error.code==='42P01'||error.code==='42703')return res.status(503).json({error:'Falta aplicar la migración Fase 2.',code:'ESQUEMA_ALTA_PENDIENTE'});sendAccessError(res,error);}};}
router.post('/clientes',requireServiceScope('clientes:crear'),handler(async req=>{
 const b=req.body;fields(b,['cliente_panel_id','nombre','tipo_documento','numero_documento','telefono','correo','estado']);
 const payload={cliente_panel_id:String(b.cliente_panel_id||'').toLowerCase(),nombre:text(b.nombre,120),tipo_documento:text(b.tipo_documento,16),numero_documento:text(b.numero_documento,11)||null,telefono:text(b.telefono,40)||null,correo:text(b.correo,120)||null,estado:b.estado||'ACTIVO'};
 if(!UUID_PATTERN.test(payload.cliente_panel_id)||!payload.nombre||b.nombre.length>120||!['ACTIVO','INACTIVO'].includes(payload.estado)||!((payload.tipo_documento==='DNI'&&/^\d{8}$/.test(payload.numero_documento))||(payload.tipo_documento==='RUC'&&/^\d{11}$/.test(payload.numero_documento))||(payload.tipo_documento==='SIN_DOCUMENTO'&&payload.numero_documento===null))||payload.correo&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.correo))throw fail('Datos de cliente contratante inválidos.');
 return command(req,'CREAR_CLIENTE',null,payload,async db=>{
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,1))',[payload.cliente_panel_id]);
  const existing=await db.query('select * from clientes_admin where cliente_panel_id=$1',[payload.cliente_panel_id]);
  let client=existing.rows[0];
  if(client){if(Object.keys(payload).some(k=>String(client[k]??'')!==String(payload[k]??'')))throw accessError(409,'CLIENTE_DIFERENTE','La referencia de cliente ya tiene otros datos administrativos.');}
  else client=(await db.query('insert into clientes_admin(cliente_panel_id,nombre,tipo_documento,numero_documento,telefono,correo,estado) values($1,$2,$3,$4,$5,$6,$7) returning id',[payload.cliente_panel_id,payload.nombre,payload.tipo_documento,payload.numero_documento,payload.telefono,payload.correo,payload.estado])).rows[0];
  return {data:{cliente_id:client.id},before:existing.rows.length?'PENDIENTE':'NO_EXISTE'};
 });
}));
router.post('/empresas',requireServiceScope('empresas:crear'),handler(async req=>{
 const b=req.body;fields(b,['cliente_id','razon_social','nombre_comercial','ruc','empresa_codigo']);
 const payload={cliente_id:String(b.cliente_id||'').toLowerCase(),razon_social:text(b.razon_social,160),nombre_comercial:text(b.nombre_comercial,160)||null,ruc:text(b.ruc,11),empresa_codigo:text(b.empresa_codigo,40).toUpperCase()};
 if(!UUID_PATTERN.test(payload.cliente_id)||!payload.razon_social||b.razon_social.length>160||!/^\d{11}$/.test(payload.ruc)||String(b.ruc).trim().length!==11||! /^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(payload.empresa_codigo)||String(b.empresa_codigo).trim().length>40)throw fail('Cliente, razón social, RUC y código únicos son obligatorios.');
 return command(req,'CREAR_EMPRESA',null,payload,async db=>{
  const client=await db.query("select id from clientes_admin where id=$1 and estado='ACTIVO' for share",[payload.cliente_id]);if(!client.rows.length)throw fail('Cliente contratante no disponible.');
  const company=(await db.query('insert into empresas(cliente_admin_id,razon_social,nombre_comercial,ruc,empresa_codigo,activo) values($1,$2,$3,$4,$5,true) returning id',[payload.cliente_id,payload.razon_social,payload.nombre_comercial,payload.ruc,payload.empresa_codigo])).rows[0];
  await db.query("insert into empresa_acceso(empresa_id,estado) values($1,'PENDIENTE')",[company.id]);
  return {empresa_id:company.id,before:'NO_EXISTE',data:{empresa_id:company.id,estado:'PENDIENTE'}};
 });
}));
router.post('/empresas/:id/sucursal-principal',requireServiceScope('empresas:sucursal-principal'),handler(async req=>{
 const b=req.body;fields(b,['nombre']);const payload={nombre:text(b.nombre,120)};if(!payload.nombre||b.nombre.length>120)throw fail('Nombre de sucursal inválido.');
 return command(req,'CREAR_SUCURSAL_PRINCIPAL',req.params.id,payload,async db=>{
  await pending(db,req.params.id);const prior=await db.query('select id,nombre from sucursales where empresa_id=$1 and es_principal=true',[req.params.id]);let branch=prior.rows[0];
  if(branch&&branch.nombre!==payload.nombre)throw accessError(409,'SUCURSAL_DIFERENTE','La sucursal principal ya tiene otro nombre.');
  if(!branch)branch=(await db.query("insert into sucursales(empresa_id,codigo,nombre,es_principal,activo) values($1,'PRINCIPAL',$2,true,true) returning id",[req.params.id,payload.nombre])).rows[0];
  return {empresa_id:req.params.id,data:{empresa_id:req.params.id,sucursal_id:branch.id,estado:'PENDIENTE'}};
 });
}));
router.post('/empresas/:id/administrador-inicial',requireServiceScope('empresas:administrador-inicial'),handler(async req=>{
 const b=req.body;fields(b,['nombre','usuario','password_temporal','sucursal_id']);const payload={nombre:text(b.nombre,120),usuario:text(b.usuario,40),sucursal_id:String(b.sucursal_id||'').toLowerCase()};
 if(!payload.nombre||b.nombre.length>120||! /^[A-Za-z0-9._-]{3,40}$/.test(payload.usuario)||typeof b.password_temporal!=='string'||b.password_temporal.length<12||Buffer.byteLength(b.password_temporal,'utf8')>72||!UUID_PATTERN.test(payload.sucursal_id))throw fail('Administrador y contraseña temporal de 12 a 72 caracteres son obligatorios.');
 // El fingerprint usa HMAC de servicio; jamás registra contraseña ni hash bcrypt en auditoría.
 const auditPayload={...payload,password_fingerprint:createHmac('sha256',process.env.PANEL_WEB_SERVICE_SECRET).update(b.password_temporal).digest('hex')};
 return command(req,'CREAR_ADMIN_INICIAL',req.params.id,auditPayload,async db=>{
  await pending(db,req.params.id);
  const branch=await db.query('select id from sucursales where id=$1 and empresa_id=$2 and es_principal=true and activo=true for share',[payload.sucursal_id,req.params.id]);if(!branch.rows.length)throw fail('Sucursal principal no disponible para esta empresa.');
  const role=await db.query("select id from roles where nombre='Administrador'");if(!role.rows.length)throw accessError(409,'ROL_AUSENTE','Falta el rol Administrador.');
  let user=(await db.query('select id,nombre,usuario,password_hash from usuarios where empresa_id=$1 and es_administrador_inicial=true',[req.params.id])).rows[0];
  if(user){if(user.nombre!==payload.nombre||user.usuario!==payload.usuario||!(await bcrypt.compare(b.password_temporal,user.password_hash)))throw accessError(409,'ADMIN_DIFERENTE','El administrador inicial ya fue creado con otros datos.');}
  else{const hash=await bcrypt.hash(b.password_temporal,12);user=(await db.query('insert into usuarios(empresa_id,nombre,usuario,password_hash,activo,es_administrador_inicial,debe_cambiar_password) values($1,$2,$3,$4,true,true,true) returning id',[req.params.id,payload.nombre,payload.usuario,hash])).rows[0];await db.query('insert into usuario_sucursal(usuario_id,sucursal_id,rol_id) values($1,$2,$3)',[user.id,payload.sucursal_id,role.rows[0].id]);}
  return {empresa_id:req.params.id,data:{empresa_id:req.params.id,usuario_id:user.id,sucursal_id:payload.sucursal_id,estado:'PENDIENTE',debe_cambiar_password:true}};
 });
}));
router.post('/empresas/:id/activar',requireServiceScope('empresas:activar'),handler(async req=>{
 fields(req.body,[]);return command(req,'ACTIVAR',req.params.id,{},async db=>{
  const {company,access}=await pending(db,req.params.id);
  assertStateTransition(access.estado,'ACTIVAR');
  await assertCommercialReady(db,company.id);
  await assertSubscriptionReady(db,company.id,{activation:true});
  const complete=await db.query(`select exists(select 1 from clientes_admin where id=$2 and estado='ACTIVO') cliente,
   exists(select 1 from sucursales s join usuario_sucursal us on us.sucursal_id=s.id join usuarios u on u.id=us.usuario_id and u.empresa_id=s.empresa_id join roles r on r.id=us.rol_id where s.empresa_id=$1 and s.es_principal and s.activo and u.es_administrador_inicial and u.activo and r.nombre='Administrador') inicial`,[company.id,company.cliente_admin_id]);
  if(!complete.rows[0].cliente||!complete.rows[0].inicial||!company.ruc||!company.empresa_codigo)throw accessError(409,'ALTA_INCOMPLETA','Falta cliente, sucursal principal o administrador inicial.');
  const conflict=await db.query('select id from empresas where id<>$1 and (btrim(ruc)=btrim($2) or lower(btrim(empresa_codigo))=lower(btrim($3))) limit 1',[company.id,company.ruc,company.empresa_codigo]);if(conflict.rows.length)throw accessError(409,'ALTA_DUPLICADA','RUC o código no son únicos.');
  assertCompanyAccess({...access,estado:'ACTIVO',estado_suscripcion:access.suscripcion_requerida?'ACTIVA':access.estado_suscripcion});
  await companySubscriptionAction(db,company.id,'ACTIVAR',req.body.command_id,req.body.administrador||req.service.sub,req.body.motivo);
  const final=(await db.query("update empresa_acceso set estado='ACTIVO',auth_version=auth_version+1,updated_at=now() where empresa_id=$1 returning estado,auth_version",[company.id])).rows[0];
  return {empresa_id:company.id,data:{empresa_id:company.id,...final},before:'PENDIENTE',after:'ACTIVO'};
 });
}));
export {router as onboardingApi};
