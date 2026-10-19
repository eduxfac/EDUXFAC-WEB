import {runWithServiceContext} from './db.js';
import jwt from 'jsonwebtoken';
export function serviceConfiguration(environment=process.env) {
 const secret=environment.PANEL_WEB_SERVICE_SECRET,issuer=environment.PANEL_WEB_SERVICE_ISSUER,audience=environment.PANEL_WEB_SERVICE_AUDIENCE;
 if(!secret||secret.length<32||!issuer||!audience||secret===environment.SESSION_SECRET||secret===environment.JWT_SECRET)return null;
 if(environment.NODE_ENV!=='test'&&/EJEMPLO|EXAMPLE|FAKE|FALSO|NO_USAR|CHANGE_ME/i.test(secret))return null;
 return {secret,issuer,audience};
}
export function requireService(req,res,next) {
 const config=serviceConfiguration();
 if(!config)return res.status(503).json({error:'Integración PANEL → WEB no configurada.',code:'SERVICIO_DESHABILITADO'});
 const header=req.headers.authorization||'';
 if(!header.startsWith('Bearer '))return res.status(401).json({error:'Token de servicio requerido.',code:'SERVICIO_NO_AUTORIZADO'});
 try {
  const claims=jwt.verify(header.slice(7),config.secret,{algorithms:['HS256'],issuer:config.issuer,audience:config.audience,maxAge:'5m',clockTolerance:0});
  if(typeof claims!=='object'||claims.type!=='panel_service'||claims.sub!=='panel-eduxfac'||!Number.isInteger(claims.iat)||!Number.isInteger(claims.exp)||claims.exp<=claims.iat||claims.exp-claims.iat>300||typeof claims.jti!=='string'||!claims.jti||!Array.isArray(claims.scopes)||!claims.scopes.every(s=>typeof s==='string'))throw Error('Claims inválidos');
  req.service=claims;return runWithServiceContext(next);
 }catch{return res.status(401).json({error:'Token de servicio inválido.',code:'SERVICIO_NO_AUTORIZADO'});}
}
export const requireServiceScope=scope=>(req,res,next)=>req.service?.scopes.includes(scope)?next():res.status(403).json({error:'Permiso de servicio insuficiente.',code:'SERVICIO_SIN_PERMISO'});
