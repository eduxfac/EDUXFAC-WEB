import {createHash} from 'node:crypto';
import {pool,tx} from './db.js';
import {accessError,getCompanyAccess} from './company-access.js';
export const subscriptionExpiredMessage='Tu suscripción EDUXFAC WEB ha vencido. Comunícate con soporte para renovar.';
export async function subscriptionSnapshot(db,id,{lock=false}={}){
 const q=await db.query("select to_jsonb(a)||jsonb_build_object('auth_version',auth_version::text) data from empresa_acceso a where empresa_id=$1"+(lock?' for update':''),[id]);
 if(!q.rows[0])throw accessError(404,'EMPRESA_NO_EXISTE','Empresa sin acceso.');
 const a=q.rows[0].data;if(a.suscripcion_requerida===undefined)return {ready:false,empresa_id:id};
 // Extract bigint as text without losing precision in JSON decoding.
 const version=(await db.query("select version_suscripcion::text v,condiciones_version::text c from empresa_acceso where empresa_id=$1",[id])).rows[0];
 return {ready:true,empresa_id:id,suscripcion_id:a.suscripcion_id,estado:a.estado_suscripcion,fecha_inicio:a.fecha_inicio?new Date(a.fecha_inicio).toISOString():null,fecha_vencimiento:a.fecha_vencimiento?new Date(a.fecha_vencimiento).toISOString():null,version_suscripcion:version.v,version_condiciones:version.c,plan_codigo:a.plan_codigo,limite_sucursales:a.limite_sucursales,limite_usuarios:a.limite_usuarios,multisucursal:a.multisucursal,estado_empresa:a.estado,auth_version:a.auth_version};
}
export async function assertSubscriptionReady(db,id,{activation=false,reactivation=false}={}){
 const s=await subscriptionSnapshot(db,id,{lock:true});if(!s.ready)return;
 if(!s.suscripcion_id||!['ACTIVA',...(activation?['PENDIENTE']:[]),...(reactivation?['SUSPENDIDA']:[])].includes(s.estado))throw accessError(409,'SUSCRIPCION_NO_VIGENTE','Se requiere una suscripción válida para activar o reactivar.');
 if(Date.parse(s.fecha_inicio)>Date.now())throw accessError(403,'VIGENCIA_PENDIENTE','La vigencia todavía no ha comenzado.');
 if(!s.fecha_vencimiento||Date.parse(s.fecha_vencimiento)<=Date.now())throw accessError(403,'EMPRESA_VENCIDO',subscriptionExpiredMessage);
}
export async function subscriptionEvent(db,{before,after,event,command,administrator,reason,months=0,gap={}}){
 if(!after.suscripcion_id)return;
 await db.query('insert into suscripcion_eventos(empresa_id,suscripcion_id,evento,command_id,administrador,motivo,estado_anterior,estado_nuevo,fecha_vencimiento_anterior,fecha_vencimiento_nueva,meses_renovados,intervalo_vencido_inicio,intervalo_vencido_fin) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict(command_id,evento) do nothing',[after.empresa_id,after.suscripcion_id,event,command,administrator,reason,before?.estado||null,after.estado,before?.fecha_vencimiento||null,after.fecha_vencimiento,months,gap.intervalo_vencido_inicio||null,gap.intervalo_vencido_fin||null]);
}
export async function companySubscriptionAction(db,id,action,command,administrator,reason){
 const before=await subscriptionSnapshot(db,id,{lock:true});if(!before.ready||!before.suscripcion_id)return;
 const states={ACTIVAR:'ACTIVA',SUSPENDER:'SUSPENDIDA',REACTIVAR:'ACTIVA',VENCER:'VENCIDA',CANCELAR:'CANCELADA'},state=states[action];
 await db.query('update empresa_acceso set estado_suscripcion=$2,version_suscripcion=version_suscripcion+1 where empresa_id=$1',[id,state]);
 const after=await subscriptionSnapshot(db,id);
 await subscriptionEvent(db,{before,after,event:action,command,administrator,reason});
}
export async function commercialSubscriptionAction(db,id,action,command,administrator,reason){
 const before=await subscriptionSnapshot(db,id,{lock:true});if(!before.ready||!before.suscripcion_id)return;
 await db.query('update empresa_acceso set version_suscripcion=version_suscripcion+1 where empresa_id=$1',[id]);
 await subscriptionEvent(db,{before,after:await subscriptionSnapshot(db,id),event:action,command,administrator,reason});
}
function expiryCommand(id,date){const hex=createHash('sha256').update('EDUXFAC-EXPIRY|'+id+'|'+new Date(date).toISOString()).digest('hex');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-4'+hex.slice(13,16)+'-8'+hex.slice(17,20)+'-'+hex.slice(20,32);}
export async function expireDueSubscriptions({now=new Date(),limit=100,onEvent=null}={}){
 const at=new Date(now);if(!Number.isFinite(at.getTime())||!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Parámetros de worker inválidos.');
 const candidates=(await pool.query("select empresa_id,suscripcion_id,fecha_vencimiento from empresa_acceso where estado_suscripcion='ACTIVA' and fecha_vencimiento<=$1 order by fecha_vencimiento limit $2",[at.toISOString(),limit])).rows;
 let applied=0;
 for(const c of candidates){const started=Date.now();let event=null;await tx(async db=>{
  const command=expiryCommand(c.suscripcion_id,c.fecha_vencimiento);
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[command]);
  await db.query('select id from empresas where id=$1 for update',[c.empresa_id]);
  const before=await subscriptionSnapshot(db,c.empresa_id,{lock:true});
  if(before.estado!=='ACTIVA'||Date.parse(before.fecha_vencimiento)>at.getTime()||Date.parse(before.fecha_vencimiento)!==new Date(c.fecha_vencimiento).getTime())return;
  await db.query("update empresa_acceso set estado_suscripcion='VENCIDA',estado=case when estado='ACTIVO' then 'VENCIDO' else estado end,version_suscripcion=version_suscripcion+1,auth_version=auth_version+1,updated_at=now() where empresa_id=$1",[c.empresa_id]);
  await subscriptionEvent(db,{before,after:await subscriptionSnapshot(db,c.empresa_id),event:'VENCIMIENTO',command,administrator:'worker-local',reason:'Fin de vigencia comercial.'});applied++;event={command_id:command,empresa_id:c.empresa_id,estado:'APLICADO'};
 });if(event&&typeof onEvent==='function')try{await onEvent({...event,duracion_ms:Date.now()-started});}catch{/* La auditoría transaccional ya se confirmó; logging externo no cambia la vigencia. */}}
 return {revisadas:candidates.length,vencidas:applied};
}
