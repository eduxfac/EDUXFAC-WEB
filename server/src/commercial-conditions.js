import {randomUUID} from 'node:crypto';
import {accessError} from './company-access.js';
export async function commercialUsage(db,id,{lock=false}={}){
 const q=await db.query("select to_jsonb(a)||case when to_jsonb(a)?'condiciones_version' then jsonb_build_object('condiciones_version',to_jsonb(a)->>'condiciones_version') else '{}'::jsonb end condiciones from empresa_acceso a where empresa_id=$1"+(lock?' for update':''),[id]);
 if(!q.rows[0])throw accessError(404,'EMPRESA_NO_EXISTE','Empresa sin acceso configurado.');
 const a=q.rows[0].condiciones;
 // Compatibilidad con los esquemas anteriores: ninguna opción del cliente controla esto.
 if(a.condiciones_version===undefined)return {ready:false,empresa_id:id};
 const counts=await db.query('select (select count(*)::int from sucursales where empresa_id=$1 and activo) sucursales_activas,(select count(*)::int from usuarios where empresa_id=$1 and activo) usuarios_activos',[id]);
 return {ready:true,empresa_id:id,plan_codigo:a.plan_codigo,limite_sucursales:a.limite_sucursales,limite_usuarios:a.limite_usuarios,multisucursal:a.multisucursal,version_condiciones:String(a.condiciones_version),fecha_actualizacion:a.condiciones_updated_at,...counts.rows[0]};
}
export function conditionsValid(c){
 return ['BASICO','PROFESIONAL','EMPRESA'].includes(c.plan_codigo)&&/^\d+$/.test(String(c.version_condiciones))&&BigInt(c.version_condiciones)>0n
 &&Number.isSafeInteger(c.limite_usuarios)&&c.limite_usuarios>0&&typeof c.multisucursal==='boolean'
 &&(c.multisucursal?c.limite_sucursales===null:Number.isSafeInteger(c.limite_sucursales)&&c.limite_sucursales>0);
}
export async function assertCommercialReady(db,id){
 const c=await commercialUsage(db,id,{lock:true});if(!c.ready)return;
 if(!conditionsValid(c))throw accessError(409,'CONDICIONES_COMERCIALES_PENDIENTES','Asigna condiciones comerciales válidas antes de activar o reactivar.');
 if(c.usuarios_activos>c.limite_usuarios||c.limite_sucursales!==null&&c.sucursales_activas>c.limite_sucursales)throw accessError(409,'USO_SUPERA_LIMITES','La empresa supera sus condiciones comerciales; revisa los límites antes de reactivar.');
}
export async function recordQuotaFailure(db,error,actor='servicio-web'){
 if(error.code!=='P4001')return;
 try{
  const info=JSON.parse(error.detail);
  if(!/^[a-f0-9-]{36}$/i.test(String(info.empresa_id))||!['USUARIOS','SUCURSALES'].includes(info.tipo))return;
  await db.query("insert into eventos_comerciales(command_id,empresa_id,accion,administrador,motivo,anterior,nuevo,resultado,error) values($1,$2,$3,$4,'Intento de alta o reactivación rechazado por cuota',$5::jsonb,$6::jsonb,'ERROR','CUOTA_ALCANZADA')",[randomUUID(),info.empresa_id,'CUOTA_'+info.tipo,actor,JSON.stringify({usados:info.usados,limite:info.limite}),JSON.stringify({solicitado:info.usados+1})]);
 }catch{/* El rechazo de cuota nunca se convierte en una alta permitida si falla el registro. */}
}
