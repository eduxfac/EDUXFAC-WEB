import express from 'express';import{randomBytes,createHash}from'node:crypto';import bcrypt from 'bcryptjs';
import{pool}from'./db.js';import{requireServiceScope}from'./service-auth.js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,hash=v=>createHash('sha256').update(v).digest('hex');
const status=x=>x.code==='RECOVERY_RATE_LIMIT'?429:x.code==='RECOVERY_INPUT'?400:404;
function ttl(){const n=Number(process.env.WEB_ADMIN_RECOVERY_TTL_SECONDS??900);if(!Number.isInteger(n)||n<60||n>1800)throw Error('RECOVERY_CONFIG_INVALID');return n;}
function send(res,x){res.set('Cache-Control','no-store');return res.status(x.ok?200:status(x)).json(x.ok?x:{code:x.code,error:'No se pudo autorizar la recuperación.'});}
const route=fn=>async(req,res)=>{try{await fn(req,res);}catch{res.status(503).json({code:'RECOVERY_UNAVAILABLE',error:'Recuperación no disponible.'});}};
export const adminRecoveryApi=express.Router();
const scope=requireServiceScope('administradores:recuperacion');
adminRecoveryApi.get('/empresas/:company/administradores-recuperables',scope,route(async(req,res)=>{if(!uuid.test(req.params.company))return res.status(400).json({code:'RECOVERY_INPUT'});send(res,(await pool.query('select public.awr_list($1::uuid) result',[req.params.company])).rows[0].result);}));
function input(req,keys){return uuid.test(req.params.company)&&uuid.test(req.params.user)&&req.body&&Object.keys(req.body).every(k=>keys.includes(k))&&req.body.confirmar===true&&/^[A-Za-z0-9._-]{3,40}$/.test(req.body.administrador||'');}
adminRecoveryApi.post('/empresas/:company/administradores/:user/recuperacion',scope,route(async(req,res)=>{if(!input(req,['administrador','confirmar']))return res.status(400).json({code:'RECOVERY_INPUT'});const token=randomBytes(32).toString('hex'),x=(await pool.query('select public.awr_create($1::uuid,$2::uuid,$3,$4,$5) result',[req.params.company,req.params.user,hash(token),'PANEL:'+req.body.administrador,ttl()])).rows[0].result;send(res,x.ok?{...x,token}:x);}));
adminRecoveryApi.post('/empresas/:company/administradores/:user/recuperacion/:id/revocar',scope,route(async(req,res)=>{if(!input(req,['administrador','confirmar'])||!uuid.test(req.params.id))return res.status(400).json({code:'RECOVERY_INPUT'});send(res,(await pool.query('select public.awr_revoke($1::uuid,$2::uuid,$3::uuid,$4) result',[req.params.company,req.params.user,req.params.id,'PANEL:'+req.body.administrador])).rows[0].result);}));
export function installRecoveryCompletion(app){
 const buckets=new Map();let active=0;
 app.post('/api/auth/recovery/complete',async(req,res)=>{
 res.set('Cache-Control','no-store');const invalid=()=>res.status(400).json({code:'RECOVERY_INVALID',error:'Autorización inválida o no disponible.'});
 const now=Date.now();for(const[k,v]of buckets)if(v.until<=now)buckets.delete(k);const key=req.socket.remoteAddress||'unknown',b=buckets.get(key)||{n:0,until:now+900000};
 if(buckets.size>=4096&&!buckets.has(key)||b.n>=30||active>=8)return res.status(429).json({code:'RECOVERY_RATE_LIMIT',error:'Espera antes de volver a intentar.'});b.n++;buckets.set(key,b);
 const body=req.body||{};if(Object.keys(body).some(k=>!['token','password','confirmation'].includes(k))||typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return invalid();
 if(typeof body.password!=='string'||body.password!==body.confirmation||body.password.length<12||Buffer.byteLength(body.password,'utf8')>72)return res.status(400).json({code:'RECOVERY_PASSWORD_POLICY',error:'Confirma una contraseña de al menos 12 caracteres y hasta 72 bytes.'});
 active++;try{const encoded=await bcrypt.hash(body.password,12),x=(await pool.query('select public.awr_complete($1,$2) result',[hash(body.token),encoded])).rows[0].result;if(!x.ok)return invalid();res.json(x);}catch{res.status(503).json({code:'RECOVERY_UNAVAILABLE',error:'Recuperación no disponible.'});}finally{active--;delete body.token;delete body.password;delete body.confirmation;}
 });
}
