import bcrypt from 'bcryptjs';
import {tx} from './db.js';
import {signUser} from './auth.js';
import {accessError,sendAccessError} from './company-access.js';
export async function changeInitialPassword(req,res){
 try{
  const b=req.body||{};
  if(Object.keys(b).some(k=>!['password_temporal','password_nuevo'].includes(k))||typeof b.password_temporal!=='string'||typeof b.password_nuevo!=='string'||b.password_nuevo.length<12||Buffer.byteLength(b.password_nuevo,'utf8')>72||Buffer.byteLength(b.password_temporal,'utf8')>72||b.password_temporal===b.password_nuevo)throw accessError(400,'PASSWORD_INVALIDO','Usa una contraseña nueva de al menos 12 caracteres y hasta 72 bytes.');
  const result=await tx(async db=>{
   const q=await db.query('select id,empresa_id,nombre,usuario,password_hash,debe_cambiar_password from usuarios where id=$1 and empresa_id=$2 and activo=true for update',[req.user.sub,req.user.empresa_id]);const user=q.rows[0];
   if(!user||!user.debe_cambiar_password)throw accessError(401,'CAMBIO_PASSWORD_INVALIDO','Cambio inicial no disponible.');
   if(!(await bcrypt.compare(b.password_temporal,user.password_hash)))throw accessError(401,'CREDENCIAL_INVALIDA','Contraseña temporal incorrecta.');
   await db.query('update usuarios set password_hash=$2,debe_cambiar_password=false,updated_at=now() where id=$1 and empresa_id=$3',[user.id,await bcrypt.hash(b.password_nuevo,12),user.empresa_id]);
   await db.query("insert into auditoria(empresa_id,usuario_id,accion,entidad,entidad_id,detalle) values($1,$2,'CAMBIO_PASSWORD_INICIAL','usuarios',$2,'{}'::jsonb)",[user.empresa_id,user.id]);
   return {token:signUser({...user,debe_cambiar_password:false,auth_version:req.user.auth_version}),user:{id:user.id,empresa_id:user.empresa_id,nombre:user.nombre,usuario:user.usuario},debe_cambiar_password:false};
  });res.json(result);
 }catch(error){sendAccessError(res,error);}
}