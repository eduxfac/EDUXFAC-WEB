import express from 'express';
import {createHash} from 'node:crypto';
import {pool,tx} from './db.js';
import {UUID_PATTERN,accessError,sendAccessError} from './company-access.js';
import {requireServiceScope} from './service-auth.js';
import {commercialUsage,assertCommercialReady} from './commercial-conditions.js';
import {authorizedInstant,addMonthlyCycles,renewalPeriod,renewalAuthorizedInstant,RENEWAL_MONTHS} from './subscription-calendar.js';
import {subscriptionSnapshot,subscriptionEvent} from './subscription-service.js';
const router=express.Router();
router.get('/empresas/:id/suscripcion',requireServiceScope('empresas:suscripcion:read'),async(req,res)=>{
 try{if(!UUID_PATTERN.test(req.params.id))throw accessError(400,'EMPRESA_INVALIDA','Empresa inválida.');const s=await subscriptionSnapshot(pool,req.params.id);if(!s.ready)throw accessError(503,'ESQUEMA_SUSCRIPCIONES_PENDIENTE','Falta aplicar Fase 5.');const events=await pool.query('select * from suscripcion_eventos where empresa_id=$1 order by created_at,id',[req.params.id]);res.json({...s,historial:events.rows.map(e=>({...e,fecha_vencimiento_anterior:e.fecha_vencimiento_anterior?new Date(e.fecha_vencimiento_anterior).toISOString():null,fecha_vencimiento_nueva:e.fecha_vencimiento_nueva?new Date(e.fecha_vencimiento_nueva).toISOString():null,intervalo_vencido_inicio:e.intervalo_vencido_inicio?new Date(e.intervalo_vencido_inicio).toISOString():null,intervalo_vencido_fin:e.intervalo_vencido_fin?new Date(e.intervalo_vencido_fin).toISOString():null}))});}catch(e){sendAccessError(res,e);}
});
for(const [method,route,action]of [['put','suscripcion','SUSCRIPCION'],['post','renovar','RENOVAR']]){
 router[method]('/empresas/:id/'+route,requireServiceScope('empresas:'+route),async(req,res)=>{
  try{
   const b=req.body||{},allowed=['command_id','motivo','administrador','suscripcion_id','version_esperada','version_condiciones',...(action==='SUSCRIPCION'?['fecha_inicio']:['fecha_autorizada','meses'])];
   if(Object.keys(b).some(k=>!allowed.includes(k))||!UUID_PATTERN.test(req.params.id)||!UUID_PATTERN.test(String(b.command_id))||!UUID_PATTERN.test(String(b.suscripcion_id))||typeof b.motivo!=='string'||!b.motivo.trim()||b.motivo.length>500||typeof b.administrador!=='string'||! /^[A-Za-z0-9._-]{3,40}$/.test(b.administrador)||!/^\d{1,19}$/.test(String(b.version_esperada))||!/^\d{1,19}$/.test(String(b.version_condiciones)))throw accessError(400,'SUSCRIPCION_INVALIDA','Comando, suscripción, versiones, administrador y motivo son obligatorios.');
   const at=authorizedInstant(action==='SUSCRIPCION'?b.fecha_inicio:b.fecha_autorizada),months=action==='SUSCRIPCION'?1:b.meses;
   if(!RENEWAL_MONTHS.includes(months))throw accessError(400,'MESES_INVALIDOS','Meses permitidos: 1, 2, 3, 6 o 12.');
   const id=req.params.id.toLowerCase(),command=b.command_id.toLowerCase(),reason=b.motivo.trim(),payload={suscripcion_id:b.suscripcion_id.toLowerCase(),version_esperada:String(b.version_esperada),version_condiciones:String(b.version_condiciones),fecha:at,meses:months};
   const hash=createHash('sha256').update(JSON.stringify([id,action,payload,reason,b.administrador,req.service.sub])).digest('hex');
   const result=await tx(async db=>{
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[command]);
    const prior=(await db.query('select request_hash,resultado from acciones_admin where command_id=$1',[command])).rows[0];
    if(prior){if(prior.request_hash!==hash)throw accessError(409,'COMANDO_REUTILIZADO','Comando ya utilizado con otro contenido.');return {...prior.resultado,replayed:true};}
    await db.query('select id from empresas where id=$1 for update',[id]);
    const before=await subscriptionSnapshot(db,id,{lock:true});if(!before.ready)throw accessError(503,'ESQUEMA_SUSCRIPCIONES_PENDIENTE','Falta aplicar Fase 5.');
    if(before.estado_empresa==='CANCELADO'||before.estado==='CANCELADA')throw accessError(409,'EMPRESA_CANCELADA','Cancelación requiere recuperación administrativa explícita.');
    if(before.version_suscripcion!==payload.version_esperada||before.version_condiciones!==payload.version_condiciones)throw accessError(409,'VERSION_SUSCRIPCION_CONFLICTO','Cambió la suscripción o sus condiciones; consulta antes de una nueva orden.');
    await assertCommercialReady(db,id);
    if(action==='SUSCRIPCION'&&before.suscripcion_id)throw accessError(409,'SUSCRIPCION_EXISTENTE','La suscripción ya existe; usa Renovar.');
    if(action==='RENOVAR'&&before.suscripcion_id!==payload.suscripcion_id)throw accessError(409,'SUSCRIPCION_AJENA','La referencia no pertenece a esta empresa.');
    const effectiveAt=action==='RENOVAR'?renewalAuthorizedInstant(before,b.fecha_autorizada):at;
    if(action==='RENOVAR'&&Date.parse(effectiveAt)<Date.parse(before.fecha_inicio))throw accessError(400,'FECHA_RENOVACION_INVALIDA','La renovación no puede preceder al inicio actual.');
    if(action==='RENOVAR'&&Date.parse(before.fecha_vencimiento)<=Date.now()&&Date.parse(effectiveAt)<Date.parse(before.fecha_vencimiento))throw accessError(400,'FECHA_RENOVACION_INVALIDA','Una suscripción vencida requiere una fecha autorizada posterior a su vencimiento.');
    if(action==='RENOVAR'&&Date.parse(effectiveAt)>Date.now())throw accessError(400,'FECHA_RENOVACION_INVALIDA','La fecha de renovación no puede ser futura.');
    const period=action==='SUSCRIPCION'?{fecha_inicio:at,fecha_vencimiento:addMonthlyCycles(at,1)}:renewalPeriod(before,effectiveAt,months);
    if(Date.parse(period.fecha_vencimiento)<=Date.now())throw accessError(400,'VIGENCIA_NO_FUTURA','La nueva fecha de vencimiento debe ser futura.');
    const state=action==='SUSCRIPCION'?'PENDIENTE':'ACTIVA';
    await db.query("update empresa_acceso set suscripcion_id=$2,estado_suscripcion=$3,fecha_inicio=$4,fecha_vencimiento=$5,version_suscripcion=version_suscripcion+1,auth_version=auth_version+1,estado=case when $6='RENOVAR' and estado='VENCIDO' then 'ACTIVO' else estado end,updated_at=now() where empresa_id=$1",[id,payload.suscripcion_id,state,period.fecha_inicio,period.fecha_vencimiento,action]);
    const after=await subscriptionSnapshot(db,id),final={command_id:command,...after,meses_renovados:action==='RENOVAR'?months:0,intervalo_vencido_inicio:period.intervalo_vencido_inicio||null,intervalo_vencido_fin:period.intervalo_vencido_fin||null,replayed:false};
    await subscriptionEvent(db,{before,after,event:action==='SUSCRIPCION'?'ALTA':'RENOVACION',command,administrator:b.administrador,reason,months:action==='RENOVAR'?months:0,gap:period});
    await db.query("insert into acciones_admin(command_id,empresa_id,accion,motivo,estado_anterior,estado_nuevo,resultado,request_hash,actor_servicio) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)",[command,id,action,reason,before.estado_empresa,after.estado_empresa,JSON.stringify(final),hash,req.service.sub+':'+b.administrador]);
    return final;
   });res.json(result);
  }catch(e){if(!e.status&&e.message?.startsWith('Fecha')||!e.status&&e.message?.startsWith('Usa fecha')||!e.status&&e.message?.startsWith('Instante'))return res.status(400).json({error:e.message,code:'FECHA_INVALIDA'});sendAccessError(res,e);}
 });
}
export {router as subscriptionApi};
