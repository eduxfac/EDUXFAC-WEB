import express from 'express';
import {createHash} from 'node:crypto';
import {pool,tx} from './db.js';
import {UUID_PATTERN,accessError,sendAccessError} from './company-access.js';
import {requireServiceScope} from './service-auth.js';
import {commercialUsage,conditionsValid} from './commercial-conditions.js';
import {commercialSubscriptionAction} from './subscription-service.js';
const router=express.Router();
const scope=s=>requireServiceScope('empresas:'+s);
router.get('/empresas/:id/uso',scope('uso'),async(req,res)=>{
 try{if(!UUID_PATTERN.test(req.params.id))throw accessError(400,'EMPRESA_INVALIDA','Empresa inválida.');const c=await commercialUsage(pool,req.params.id);if(!c.ready)throw accessError(503,'ESQUEMA_PLANES_PENDIENTE','Falta aplicar la migración Fase 4.');const events=await pool.query(`select command_id,accion,administrador,motivo,anterior,nuevo,resultado,error,created_at from eventos_comerciales where empresa_id=$1 and accion like 'CUOTA_%' order by created_at desc,id limit 20`,[req.params.id]);res.json({...c,eventos_cuota:events.rows});}catch(error){sendAccessError(res,error);}
});
for(const [route,action]of [['plan','ASIGNAR_PLAN'],['limites','AJUSTAR_LIMITES']]){
 router.put('/empresas/:id/'+route,scope(route),async(req,res)=>{
  let audit;
  try{
   const b=req.body||{},allowed=['command_id','motivo','administrador','version_condiciones','limite_sucursales','limite_usuarios','multisucursal',...(route==='plan'?['plan_codigo']:[])];
   if(Object.keys(b).some(k=>!allowed.includes(k))||!UUID_PATTERN.test(req.params.id)||!UUID_PATTERN.test(String(b.command_id))||typeof b.motivo!=='string'||!b.motivo.trim()||b.motivo.length>500||typeof b.administrador!=='string'||! /^[A-Za-z0-9._-]{3,40}$/.test(b.administrador)||! /^\d+$/.test(String(b.version_condiciones))||BigInt(b.version_condiciones)<1n||BigInt(b.version_condiciones)>9223372036854775807n)throw accessError(400,'CONDICIONES_INVALIDAS','Comando, motivo, administrador y versión de condiciones son obligatorios.');
   const command=b.command_id.toLowerCase(),id=req.params.id.toLowerCase(),reason=b.motivo.trim();
   const payload={...(route==='plan'?{plan_codigo:b.plan_codigo}:{}),limite_sucursales:b.limite_sucursales,limite_usuarios:b.limite_usuarios,multisucursal:b.multisucursal,version_condiciones:String(b.version_condiciones)};
   if(!conditionsValid({...payload,plan_codigo:route==='plan'?b.plan_codigo:'BASICO'})||payload.limite_usuarios>2147483647||payload.limite_sucursales!==null&&payload.limite_sucursales>2147483647)throw accessError(400,'CONDICIONES_INVALIDAS','Límites positivos; multisucursal exige límite de sucursales NULL.');
   const hash=createHash('sha256').update(JSON.stringify([id,action,payload,reason,b.administrador,req.service.sub])).digest('hex');
   const result=await tx(async db=>{
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[command]);
    const prior=(await db.query('select request_hash,resultado from acciones_admin where command_id=$1',[command])).rows[0];
    if(prior){if(prior.request_hash!==hash)throw accessError(409,'COMANDO_REUTILIZADO','command_id ya corresponde a otro contenido.');return {...prior.resultado,replayed:true};}
    await db.query('select id from empresas where id=$1 for update',[id]);
    const before=await commercialUsage(db,id,{lock:true});if(!before.ready)throw accessError(503,'ESQUEMA_PLANES_PENDIENTE','Falta aplicar la migración Fase 4.');
    audit={command,id,reason,before,payload,administrator:b.administrador};
    if(route==='limites'&&!before.plan_codigo)throw accessError(409,'PLAN_PENDIENTE','Asigna un plan antes de aplicar una excepción.');
    if(BigInt(payload.version_condiciones)!==BigInt(before.version_condiciones)+1n)throw accessError(409,'VERSION_CONDICIONES_CONFLICTO','Las condiciones cambiaron; consulta el uso antes de otra orden.');
    if(before.usuarios_activos>payload.limite_usuarios||payload.limite_sucursales!==null&&before.sucursales_activas>payload.limite_sucursales)
     throw Object.assign(accessError(409,'USO_SUPERA_PLAN','No se puede aplicar este plan porque la empresa supera actualmente sus límites.'),{usage:{sucursales_actuales:before.sucursales_activas,limite_sucursales:payload.limite_sucursales,usuarios_actuales:before.usuarios_activos,limite_usuarios:payload.limite_usuarios}});
    await db.query('update empresa_acceso set plan_codigo=$2,limite_sucursales=$3,limite_usuarios=$4,multisucursal=$5,condiciones_version=$6,condiciones_updated_at=now() where empresa_id=$1',[id,route==='plan'?payload.plan_codigo:before.plan_codigo,payload.limite_sucursales,payload.limite_usuarios,payload.multisucursal,payload.version_condiciones]);
    await commercialSubscriptionAction(db,id,action==='ASIGNAR_PLAN'?'CAMBIO_PLAN':'CAMBIO_LIMITES',command,b.administrador,reason);
    const after=await commercialUsage(db,id),final={command_id:command,...after,replayed:false};
    await db.query("insert into acciones_admin(command_id,empresa_id,accion,motivo,estado_anterior,estado_nuevo,resultado,request_hash,actor_servicio) select $1,$2,$3,$4,estado,estado,$5::jsonb,$6,$7 from empresa_acceso where empresa_id=$2",[command,id,action,reason,JSON.stringify(final),hash,req.service.sub+':'+b.administrador]);
    await db.query("insert into eventos_comerciales(command_id,empresa_id,accion,administrador,motivo,anterior,nuevo,resultado) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'APLICADO')",[command,id,action,b.administrador,reason,JSON.stringify(before),JSON.stringify(after)]);
    return final;
   });res.json(result);
  }catch(error){
   if(audit)try{await pool.query("insert into eventos_comerciales(command_id,empresa_id,accion,administrador,motivo,anterior,nuevo,resultado,error) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'ERROR',$8)",[audit.command,audit.id,action,audit.administrator,audit.reason,JSON.stringify(audit.before),JSON.stringify(audit.payload),error.status&&/^[A-Z0-9_]{1,80}$/.test(error.code||'')?error.code:'ERROR_INTERNO']);}catch{}
   if(error.usage)return res.status(error.status).json({error:error.message,code:error.code,uso:error.usage});
   sendAccessError(res,error);
  }
 });
}
export {router as commercialApi};
