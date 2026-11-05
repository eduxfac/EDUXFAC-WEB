import bcrypt from 'bcryptjs';
import {randomInt,randomBytes,randomUUID} from 'node:crypto';
import {diagnoseAccess} from '../../shared/web-user-diagnostics.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail=(status,code)=>Object.assign(Error(code),{status,code});
export function temporaryPassword(){
 const groups=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghijkmnopqrstuvwxyz','23456789','!@#$%*-_'];
 const chars=groups.map(g=>g[randomInt(g.length)]),all=groups.join('');
 while(chars.length<20)chars.push(all[randomInt(all.length)]);
 for(let i=chars.length-1;i>0;i--){const j=randomInt(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}
 return chars.join('');
}
export function createWebUserAdministration({withClient,authorize,sessionVersionEnforced=false}){
 const issue=async(company,user,actor,request,operation,ip)=>{if(typeof authorize!=='function')throw fail(503,'USER_AUTHORIZER_REQUIRED');const ticket=randomBytes(32).toString('hex');await authorize(ticket,company,user,actor,request,operation,ip);return ticket;};
 const company=async(db,id)=>{if(!uuid.test(id||''))throw fail(400,'INVALID_ID');
  const row=(await db.query(`SELECT e.id empresa_id,e.activo empresa_activa,a.estado,a.fecha_inicio,a.fecha_vencimiento,a.auth_version,a.suscripcion_requerida,a.suscripcion_id,a.estado_suscripcion FROM public.empresas e LEFT JOIN public.empresa_acceso a ON a.empresa_id=e.id WHERE e.id=$1`,[id])).rows[0];
  if(!row)throw fail(404,'COMPANY_NOT_FOUND');return row;};
 return {
  async list(companyId,{actor}={}){if(!uuid.test(companyId||'')||!/^[-A-Za-z0-9._]{3,40}$/.test(actor||''))throw fail(400,'INVALID_INPUT');const ticket=await issue(companyId,null,actor,randomUUID(),'LIST',null);return withClient(async db=>{
   await db.query('BEGIN');
   try{
    await db.query('SELECT public.activate_web_user_context($1)',[ticket]);
    const c=await company(db,companyId);
    const users=(await db.query(`SELECT id user_id,usuario,nombre,activo,debe_cambiar_password FROM public.usuarios WHERE empresa_id=$1 ORDER BY usuario`,[companyId])).rows;
    const assignments=(await db.query(`SELECT us.usuario_id,s.id sucursal_id,s.nombre,s.activo,r.nombre rol FROM public.usuario_sucursal us JOIN public.usuarios u ON u.id=us.usuario_id JOIN public.sucursales s ON s.id=us.sucursal_id AND s.empresa_id=u.empresa_id JOIN public.roles r ON r.id=us.rol_id WHERE u.empresa_id=$1 ORDER BY s.nombre`,[companyId])).rows;
    const result={user_management_version:1,empresa_id:companyId,empresa:c,users:users.map(u=>{const sucursales=assignments.filter(a=>a.usuario_id===u.user_id).map(a=>({sucursal_id:a.sucursal_id,nombre:a.nombre,activo:a.activo,rol:a.rol}));const row={...u,sucursales,roles:[...new Set(sucursales.map(a=>a.rol))],empresa_estado:c.estado,suscripcion_estado:c.estado_suscripcion};return {...row,...diagnoseAccess(row,c)};})};await db.query('COMMIT');return result;
   }catch(e){await db.query('ROLLBACK');throw e;}
  });},
  async reset(companyId,userId,{actor,request_id,ip=null}={}){
   if(!sessionVersionEnforced)throw fail(503,'USER_SESSION_VERSION_REQUIRED');
   if(!uuid.test(companyId||'')||!uuid.test(userId||'')||!uuid.test(request_id||'')||!/^[-A-Za-z0-9._]{3,40}$/.test(actor||''))throw fail(400,'INVALID_INPUT');
   const ticket=await issue(companyId,userId,actor,request_id,'RESET',ip);
   return withClient(async db=>{await db.query('BEGIN');
    try{
     await db.query('SELECT public.activate_web_user_context($1)',[ticket]);
     await company(db,companyId);
     let password=temporaryPassword();
     const encoded=await bcrypt.hash(password,12);
     const updated=await db.query('SELECT * FROM public.admin_reset_web_user_password($1,$2,$3,$4,$5)',[companyId,userId,encoded,actor,request_id]);
     if(updated.rows.length!==1)throw fail(409,'RESET_NOT_APPLIED');
     await db.query('COMMIT');
     return {empresa_id:companyId,user_id:userId,usuario:updated.rows[0].usuario,temporary_password:password,debe_cambiar_password:true,session_invalidation:'USER_PASSWORD_VERSION'};
    }catch(e){await db.query('ROLLBACK');if(e.code==='23505')throw fail(409,'RESET_ALREADY_PROCESSED');if(e.code==='P0002')throw fail(404,'USER_NOT_FOUND');if(e.code==='42501')throw fail(403,'OPERATION_NOT_AUTHORIZED');if(e.code==='40001')throw fail(409,'RESET_CONFLICT');throw e;}
   });
  }
 };
}
export function registerWebUserAdministration(app,{service,requireServiceScope,rateLimit}){
 if(typeof rateLimit!=='function')throw Error('RESET_RATE_LIMIT_REQUIRED');
 const bound=(req,reset)=>{const c=req.service?.user_context,b=req.body||{};if(!c||c.empresa_id!==req.params.company||!/^[-A-Za-z0-9._]{3,40}$/.test(c.actor||'')||reset&&(c.user_id!==req.params.user||c.actor!==b.actor||c.request_id!==b.request_id))throw fail(403,'OPERATION_NOT_AUTHORIZED');return c;};
 const respond=fn=>async(req,res)=>{res.set('Cache-Control','no-store');try{res.json(await fn(req));}catch(e){const known=[400,403,404,409,429,503].includes(e.status);res.status(known?e.status:500).json({code:known?e.code:'USER_MANAGEMENT_FAILED',error:'No se pudo completar la operación de usuarios.'});}};
 app.get('/empresas/:company/usuarios',requireServiceScope('usuarios:read'),respond(req=>service.list(req.params.company,{actor:bound(req,false).actor})));
 app.post('/empresas/:company/usuarios/:user/reset-password',requireServiceScope('usuarios:reset'),rateLimit,respond(req=>{bound(req,true);if(Object.keys(req.body||{}).some(k=>!['actor','request_id','ip'].includes(k)))throw fail(400,'INVALID_INPUT');return service.reset(req.params.company,req.params.user,req.body);}));
}
