import pg from 'pg';
import 'dotenv/config';
import {readFileSync} from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getCompanyAccess, assertCompanyAccess, accessError } from './company-access.js';
import {recordQuotaFailure} from './commercial-conditions.js';
const {Pool}=pg,context=new AsyncLocalStorage();let testDatabase=null;
const pools=new Map();
export const rlsEnabled=()=>process.env.WEB_RLS_ENABLED==='true'&&!testDatabase;
function getPool(kind,url){
 if(!url)throw Object.assign(Error("Configuración DB requerida."),{code:"DB_CONFIGURATION_REQUIRED"});
 if(!pools.has(kind)){const ssl=process.env.WEB_PG_TLS==="verify-full"?{rejectUnauthorized:true,...(process.env.WEB_PG_CA_FILE?{ca:readFileSync(process.env.WEB_PG_CA_FILE,"utf8")}:{})}:undefined;const p=new Pool({connectionString:url,ssl,max:8,connectionTimeoutMillis:5000,options:"-c statement_timeout=15000 -c lock_timeout=5000"});p.on("error",()=>console.error("WEB_DB_POOL_ERROR"));pools.set(kind,p);}return pools.get(kind);
}
function database(){
 if(testDatabase)return testDatabase;
 const current=context.getStore(),kind=rlsEnabled()?(current?.service?'service':current?.empresa_id?'tenant':'auth'):'legacy';
 const url=kind==='service'?process.env.WEB_SERVICE_DATABASE_URL:kind==='auth'?process.env.WEB_AUTH_DATABASE_URL:process.env.DATABASE_URL;
 return getPool(kind,url);
}
export function installTestDatabase(adapter){if(process.env.NODE_ENV!=='test'||!adapter?.isolatedTestDatabase)throw Error('Solo se permite un adaptador aislado en NODE_ENV=test.');testDatabase=adapter;}
export const runWithUserContext=(user,fn)=>context.run(user,fn);
export const runWithServiceContext=fn=>context.run({service:true},fn);
async function setTenant(client){
 if(!rlsEnabled())return;
 const user=context.getStore();
 if(user?.empresa_id){if(!/^[a-f0-9-]{36}$/i.test(user.empresa_id))throw accessError(403,'EMPRESA_INVALIDA','Empresa inválida.');await client.query("SELECT set_config('app.empresa_id',$1,true),set_config('app.usuario_id',$2,true)",[user.empresa_id,user.sub||'']);
 const auth=getPool('auth',process.env.WEB_AUTH_DATABASE_URL);
 const assigned=(await auth.query('SELECT s.id FROM usuario_sucursal us JOIN sucursales s ON s.id=us.sucursal_id JOIN usuarios u ON u.id=us.usuario_id WHERE us.usuario_id=$1 AND s.empresa_id=$2 AND u.empresa_id=$2 AND u.activo=true AND (s.activo=true OR $3::boolean)',[user.sub,user.empresa_id,user.readOnlyBranchAccess===true])).rows;
 await client.query("SELECT set_config('app.sucursal_ids',$1,true)",[assigned.map(r=>r.id).join(',')]);}
}
async function guard(client){
 const user=context.getStore();if(!user||user.service)return;
 assertCompanyAccess(await getCompanyAccess(client,user.empresa_id,{lock:true}),{authVersion:user.auth_version});
 const active=await client.query('select id from usuarios where id=$1 and empresa_id=$2 and activo=true',[user.sub,user.empresa_id]);
 if(!active.rows.length)throw accessError(401,'USUARIO_INACTIVO','Usuario desactivado o sesión inválida.');
}
async function recordFailure(client,error){if(!rlsEnabled())return recordQuotaFailure(client,error,context.getStore()?.sub);try{await client.query('BEGIN');await setTenant(client);await recordQuotaFailure(client,error,context.getStore()?.sub);await client.query('COMMIT');}catch{await client.query('ROLLBACK').catch(()=>{});}}
export const pool={
 async query(sql,params){
  if(!context.getStore()||context.getStore().service)return database().query(sql,params);
  const client=await database().connect();
  try{await client.query('BEGIN');await setTenant(client);await guard(client);const result=await client.query(sql,params);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK').catch(()=>{});await recordFailure(client,error);throw error;}finally{client.release();}
 },
 async connect(){const client=await database().connect();if(!rlsEnabled())return client;return {async query(sql,params){const result=await client.query(sql,params);if(typeof sql==='string'&&/^\s*BEGIN\b/i.test(sql))await setTenant(client);return result;},release:()=>client.release()};},
 async end(){if(testDatabase)return testDatabase.end();await Promise.all([...pools.values()].map(p=>p.end()));pools.clear();}
};
export async function tx(fn){const client=await database().connect();try{await client.query('BEGIN');await setTenant(client);await guard(client);const result=await fn(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK').catch(()=>{});await recordFailure(client,error);throw error;}finally{client.release();}}

export async function verifyGlobalRoleProfiles(){if(!rlsEnabled())throw Error('RLS_GLOBAL_NOT_ENABLED');const checked={};for(const[k,url]of [['tenant',process.env.DATABASE_URL],['auth',process.env.WEB_AUTH_DATABASE_URL],['service',process.env.WEB_SERVICE_DATABASE_URL]]){const db=getPool(k,url),r=(await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') environment_marker,current_user name,current_database() db,(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) privileged,EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) owns_object,has_table_privilege(current_user,'public.lotes','UPDATE') writes_stock,has_column_privilege(current_user,'public.empresa_acceso','estado','UPDATE') changes_access,has_table_privilege(current_user,'public.clientes_admin','INSERT') creates_contract")).rows[0];let marker;try{marker=JSON.parse(r.environment_marker);}catch{}if(marker?.eduxfac_data_mode!==process.env.EDUXFAC_DATA_MODE)throw Error('DATABASE_DATA_MODE_MISMATCH');if(r.privileged||r.owns_object)throw Error('RLS_RUNTIME_ROLE_UNSAFE');checked[k]=r;}
if(new Set(Object.values(checked).map(r=>r.name)).size!==3||new Set(Object.values(checked).map(r=>r.db)).size!==1||!checked.tenant.writes_stock||checked.tenant.changes_access||checked.tenant.creates_contract||checked.service.writes_stock||!checked.service.changes_access||!checked.service.creates_contract||checked.auth.writes_stock||checked.auth.changes_access||checked.auth.creates_contract)throw Error('RLS_ROLE_PROFILE_MISMATCH');return checked;}
