import {operationsApi} from './operations-api.js';
import express from 'express';
import {onboardingApi} from './onboarding-api.js';
import {createHash} from 'node:crypto';
import {pool,tx} from './db.js';
import {requireService,requireServiceScope} from './service-auth.js';
import {UUID_PATTERN,getCompanyAccess,assertCompanyAccess,accessError,sendAccessError} from './company-access.js';
import {STATE_ACTIONS,assertStateTransition} from './company-state-policy.js';
import {commercialApi} from './commercial-api.js';
import {assertCommercialReady} from './commercial-conditions.js';
import {subscriptionApi} from './subscription-api.js';
import {assertSubscriptionReady,companySubscriptionAction} from './subscription-service.js';
const router=express.Router();
router.use(requireService);
router.get('/health',requireServiceScope('health:read'),async(_req,res)=>{
 try{const ready=await pool.query("select to_regclass('public.empresa_acceso') is not null and to_regclass('public.acciones_admin') is not null as ready");if(!ready.rows[0]?.ready)throw accessError(503,'ESQUEMA_ACCESO_PENDIENTE','Falta aplicar la migración de acceso WEB.');res.json({ok:true,service:'eduxfac-web-admin',version:1});}catch(error){sendAccessError(res,error);}
});
router.get('/empresas/:id/estado',requireServiceScope('empresas:read'),async(req,res)=>{
 try{if(!UUID_PATTERN.test(req.params.id))throw accessError(400,'EMPRESA_INVALIDA','Empresa inválida.');res.json(await getCompanyAccess(pool,req.params.id));}catch(error){sendAccessError(res,error);}
});
for(const action of ['SUSPENDER','REACTIVAR','CANCELAR','VENCER']){
 const route=action.toLowerCase(),target=STATE_ACTIONS[action].target;
 router.post('/empresas/:id/'+route,requireServiceScope('empresas:'+route),async(req,res)=>{
  let audit=null;
  try{
   const body=req.body||{};
   const reason=body.motivo??(action==='VENCER'?'Vencimiento administrativo explícito.':'');
   if(Object.keys(body).some(k=>!['command_id','motivo','administrador'].includes(k))||!UUID_PATTERN.test(req.params.id)||!UUID_PATTERN.test(String(body.command_id||''))||typeof reason!=='string'||!reason.trim()||reason.length>500||body.administrador!==undefined&&(typeof body.administrador!=='string'||! /^[A-Za-z0-9._-]{3,40}$/.test(body.administrador)))throw accessError(400,'COMANDO_INVALIDO','Empresa y command_id UUID, motivo válido y administrador opcional son requeridos.');
   const command=body.command_id.toLowerCase(),empresaId=req.params.id.toLowerCase(),motivo=reason.trim();
   const actor=req.service.sub+(body.administrador?':'+body.administrador:'');
   // Mantiene el fingerprint de Fase 1 cuando no se informa administrador.
   const hash=createHash('sha256').update(JSON.stringify([empresaId,action,motivo,actor])).digest('hex');
   const result=await tx(async db=>{
    if(['CANCELAR','VENCER'].includes(action)){
     const schema=await db.query("select to_regclass('public.acciones_admin_intentos') is not null as ready");
     if(!schema.rows[0].ready)throw accessError(503,'ESQUEMA_ESTADOS_PENDIENTE','Falta aplicar la migración Fase 3.');
    }
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[command]);
    const prior=await db.query('select request_hash,resultado from acciones_admin where command_id=$1',[command]);
    if(prior.rows[0]){if(prior.rows[0].request_hash!==hash)throw accessError(409,'COMANDO_REUTILIZADO','command_id ya corresponde a otra operación.');return {...prior.rows[0].resultado,replayed:true};}
    await db.query('select id from empresas where id=$1 for update',[empresaId]);
    const current=await getCompanyAccess(db,empresaId);
    audit={command,empresaId,motivo,actor,before:current.estado};
    assertStateTransition(current.estado,action);
    if(action==='REACTIVAR'){
     await assertCommercialReady(db,empresaId);
     await assertSubscriptionReady(db,empresaId,{reactivation:true});
     assertCompanyAccess({...current,estado:'ACTIVO',estado_suscripcion:current.suscripcion_requerida?'ACTIVA':current.estado_suscripcion});
     const counts=await db.query(`select (select count(*)::int from sucursales where empresa_id=$1 and activo=true) sucursales,
      (select count(*)::int from usuarios where empresa_id=$1 and activo=true) usuarios,
      (select count(distinct u.id)::int from usuarios u join usuario_sucursal us on us.usuario_id=u.id join sucursales s on s.id=us.sucursal_id and s.empresa_id=u.empresa_id and s.activo=true join roles r on r.id=us.rol_id where u.empresa_id=$1 and u.activo=true and r.nombre='Administrador') administradores`,[empresaId]);
     if(counts.rows[0].sucursales<1||counts.rows[0].usuarios<1||counts.rows[0].administradores<1)throw accessError(409,'ALTA_INCOMPLETA','Se requiere una sucursal activa y un administrador activo con asignación válida.');
    }
    await companySubscriptionAction(db,empresaId,action,command,body.administrador||req.service.sub,motivo);
    const changed=await db.query('update empresa_acceso set estado=$2,auth_version=auth_version+1,updated_at=now() where empresa_id=$1 returning *',[empresaId,target]);
    const final={command_id:command,...changed.rows[0],replayed:false,resultado:'APLICADO',administrador:body.administrador||req.service.sub,error:null};
    await db.query(`insert into acciones_admin(command_id,empresa_id,accion,motivo,estado_anterior,estado_nuevo,resultado,request_hash,actor_servicio)
     values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,[command,empresaId,action,motivo,current.estado,target,JSON.stringify(final),hash,actor]);
    return final;
   });
   res.json(result);
  }catch(error){
   // El cambio y el evento aplicado se revierten juntos. El intento fallido se registra aparte,
   // con código seguro; nunca guarda cuerpos HTTP, tokens ni mensajes de drivers.
   if(audit)try{await pool.query(`insert into acciones_admin_intentos(command_id,empresa_id,accion,administrador,motivo,estado_anterior,estado_nuevo,resultado,error)
    values($1,$2,$3,$4,$5,$6,$7,'ERROR',$8)`,[audit.command,audit.empresaId,action,audit.actor,audit.motivo,audit.before,target,error.status&&/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'ERROR_INTERNO']);}catch{/* Esquema previo Fase 1/2 o auditoría no disponible: conserva el rechazo. */}
   sendAccessError(res,error);
  }
 });
}
router.post('/empresas/:id/sunat-config',requireServiceScope('empresas:sunat'),async(req,res)=>{
 try{const b=req.body;if(!UUID_PATTERN.test(req.params.id)||!UUID_PATTERN.test(String(b.branch_id))||!['beta','produccion'].includes(b.environment)||typeof b.enabled!=='boolean'||!/^F[A-Z0-9]{3}$/.test(b.invoice_series)||!/^B[A-Z0-9]{3}$/.test(b.receipt_series))throw accessError(400,'SUNAT_CONFIG_INVALID','Configuración SUNAT inválida.');
 if(b.note_series&&(!['07F','07B','08F','08B'].every(key=>typeof b.note_series[key]==='string'&&new RegExp('^'+key[2]+'[A-Z0-9]{3}$').test(b.note_series[key]))||Object.keys(b.note_series).length!==4))throw accessError(400,'SERIES_NOTAS_INVALIDAS','Series de notas inválidas.');
 const branch=await pool.query('SELECT id FROM sucursales WHERE id=$1 AND empresa_id=$2 AND activo=true',[b.branch_id,req.params.id]);if(!branch.rowCount)throw accessError(403,'SUCURSAL_INVALIDA','Sucursal ajena a la empresa.');
 await tx(async db=>{
 await db.query(`INSERT INTO sunat_sucursales(empresa_id,sucursal_id,ambiente,habilitado,serie_factura,serie_boleta,fiscal_json,envio_automatico,series_notas) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb) ON CONFLICT(sucursal_id) DO UPDATE SET ambiente=EXCLUDED.ambiente,habilitado=EXCLUDED.habilitado,serie_factura=EXCLUDED.serie_factura,serie_boleta=EXCLUDED.serie_boleta,fiscal_json=EXCLUDED.fiscal_json,envio_automatico=EXCLUDED.envio_automatico,series_notas=EXCLUDED.series_notas,updated_at=now()`,[req.params.id,b.branch_id,b.environment,b.enabled,b.invoice_series,b.receipt_series,JSON.stringify(b.config),b.auto_send===true,JSON.stringify(b.note_series||{'07F':'FC01','07B':'BC01','08F':'FD01','08B':'BD01'})]);
 await db.query('UPDATE sucursales SET direccion=$3 WHERE id=$1 AND empresa_id=$2',[b.branch_id,req.params.id,b.config.direccion]);
 await db.query(`UPDATE empresas e SET razon_social=$3,ruc=$4,nombre_comercial=$5,direccion_fiscal=$6,departamento=$7,provincia=$8,distrito=$9 WHERE e.id=$1 AND EXISTS(SELECT 1 FROM sucursales WHERE id=$2 AND empresa_id=e.id AND es_principal=true)`,[req.params.id,b.branch_id,b.config.razon_social,b.config.ruc,b.config.nombre_comercial||null,b.config.direccion,b.config.departamento,b.config.provincia,b.config.distrito]); });res.json({ok:true});
 }catch(e){sendAccessError(res,e);}
});
router.get('/empresas/:id/sucursales-fiscales',requireServiceScope('empresas:read'),async(req,res)=>{
 try{if(!UUID_PATTERN.test(req.params.id))throw accessError(400,'EMPRESA_INVALIDA','Empresa inválida.');const rows=(await pool.query('SELECT s.id,s.nombre,s.codigo,s.es_principal,to_jsonb(sc) sunat FROM sucursales s LEFT JOIN sunat_sucursales sc ON sc.sucursal_id=s.id AND sc.empresa_id=s.empresa_id WHERE s.empresa_id=$1 AND s.activo=true ORDER BY s.nombre',[req.params.id])).rows;res.json({rows});}catch(e){sendAccessError(res,e);}
});
router.use(operationsApi);
router.use(subscriptionApi);
router.use(commercialApi);
router.use(onboardingApi);
router.use((_req,res)=>res.status(404).json({error:'Operación administrativa no disponible.'}));
export {router as adminServiceApi};
