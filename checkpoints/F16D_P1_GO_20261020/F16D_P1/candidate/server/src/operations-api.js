import express from 'express';
import {pool,tx} from './db.js';
import {requireServiceScope} from './service-auth.js';
import {UUID_PATTERN,accessError,sendAccessError,getCompanyAccess} from './company-access.js';
import {commercialUsage} from './commercial-conditions.js';
import {subscriptionSnapshot} from './subscription-service.js';
const router=express.Router();
// Un snapshot coherente bajo el mismo orden de bloqueos que las mutaciones administrativas.
router.get('/empresas/:id/operacion',requireServiceScope('empresas:operacion'),async(req,res)=>{
 try{
  const id=req.params.id,command=req.query.command_id;
  if(!UUID_PATTERN.test(id)||Object.keys(req.query).some(k=>k!=='command_id')||command!==undefined&&!UUID_PATTERN.test(String(command)))throw accessError(400,'CONSULTA_INVALIDA','Empresa o comando inválidos.');
  const result=await tx(async db=>{
   await db.query('select id from empresas where id=$1 for share',[id]);
   await db.query('select empresa_id from empresa_acceso where empresa_id=$1 for share',[id]);
   const access=await getCompanyAccess(db,id),s=await subscriptionSnapshot(db,id),usage=await commercialUsage(db,id);
   const events=s.ready&&s.suscripcion_id?(await db.query("select command_id,evento,estado_anterior,estado_nuevo,fecha_vencimiento_anterior,fecha_vencimiento_nueva,created_at from suscripcion_eventos where empresa_id=$1 and evento='VENCIMIENTO' order by created_at desc limit 10",[id])).rows:[];
   const applied=command?(await db.query('select command_id,empresa_id,accion,created_at from acciones_admin where command_id=$1 and empresa_id=$2',[command,id])).rows[0]||null:null;
   return {empresa_id:id,estado_empresa:access.estado,auth_version:String(access.auth_version),suscripcion:s,condiciones:usage,vencimientos:events.map(e=>({...e,fecha_vencimiento_anterior:e.fecha_vencimiento_anterior?new Date(e.fecha_vencimiento_anterior).toISOString():null,fecha_vencimiento_nueva:e.fecha_vencimiento_nueva?new Date(e.fecha_vencimiento_nueva).toISOString():null})),comando_aplicado:applied};
  });res.json(result);
 }catch(e){sendAccessError(res,e);}
});
export {router as operationsApi};
