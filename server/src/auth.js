import jwt from 'jsonwebtoken';
import {pool,runWithUserContext} from './db.js';
import {UUID_PATTERN,getCompanyAccess,assertCompanyAccess,accessError,sendAccessError} from './company-access.js';
const secret=()=>{
 const value=process.env.SESSION_SECRET||process.env.JWT_SECRET||'dev-only-change-me';
 if(process.env.NODE_ENV==='production'&&(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32))throw Error('SESSION_SECRET seguro es obligatorio en producción.');
 return value;
};
export function signUser(user){
 if(!UUID_PATTERN.test(String(user.id))||!UUID_PATTERN.test(String(user.empresa_id))||!/^\d+$/.test(String(user.auth_version))||BigInt(user.auth_version)<1n)throw Error('Usuario sin autorización vigente.');
 const restricted=user.debe_cambiar_password===true;
 return jwt.sign({empresa_id:user.empresa_id,nombre:user.nombre,auth_version:String(user.auth_version),type:restricted?'web_password_change':'web_user'},secret(),{subject:user.id,audience:'eduxfac-web',algorithm:'HS256',expiresIn:restricted?'15m':'12h'});
}
async function session(req,res,next,{passwordChange=false}={}){
 if(req.authenticated&&!passwordChange)return next();
 const header=req.headers.authorization||'';
 if(!header.startsWith('Bearer '))return res.status(401).json({error:'Sesión requerida.',code:'SESION_REQUERIDA'});
 let claims;
 try{
  claims=jwt.verify(header.slice(7),secret(),{algorithms:['HS256'],audience:'eduxfac-web'});
  if(typeof claims!=='object'||claims.type!==(passwordChange?'web_password_change':'web_user')||!UUID_PATTERN.test(String(claims.sub))||!UUID_PATTERN.test(String(claims.empresa_id))||!/^\d+$/.test(String(claims.auth_version)))throw Error('Claims inválidos');
 }catch{return res.status(401).json({error:'Sesión inválida o vencida.',code:'SESION_INVALIDA'});}
 try{
  // to_jsonb permite conservar las pruebas y el esquema Fase 1 sin añadir columnas allí.
  const active=await pool.query("select u.id,u.nombre,coalesce((to_jsonb(u)->>'debe_cambiar_password')::boolean,false) debe_cambiar_password from usuarios u where u.id=$1 and u.empresa_id=$2 and u.activo=true",[claims.sub,claims.empresa_id]);
  if(!active.rows.length)throw accessError(401,'USUARIO_INACTIVO','Usuario desactivado o sesión inválida.');
  if(passwordChange!==active.rows[0].debe_cambiar_password)throw accessError(passwordChange?401:403,'CAMBIO_PASSWORD_REQUERIDO',passwordChange?'El token de cambio ya no es válido.':'Debes cambiar tu contraseña temporal.');
  assertCompanyAccess(await getCompanyAccess(pool,claims.empresa_id),{authVersion:claims.auth_version});
  req.user={sub:active.rows[0].id,empresa_id:claims.empresa_id,nombre:active.rows[0].nombre,auth_version:claims.auth_version};req.authenticated=true;
  return runWithUserContext(req.user,next);
 }catch(error){return sendAccessError(res,error);}
}
export const requireAuth=(req,res,next)=>session(req,res,next);
export const requirePasswordChange=(req,res,next)=>session(req,res,next,{passwordChange:true});
