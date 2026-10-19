import {randomUUID} from 'node:crypto';
import {pool,tx} from '../src/db.js';
import {expireDueSubscriptions} from '../src/subscription-service.js';
export function expirationConfiguration(env=process.env){
 const enabled=env.EXPIRATION_WORKER_ENABLED??'false',interval=Number(env.EXPIRATION_WORKER_INTERVAL_MS??60000);
 if(!['true','false'].includes(enabled)||!Number.isSafeInteger(interval)||interval<60000||interval>86400000)throw Error('Configuración de vencimientos inválida.');
 return {enabled:enabled==='true',interval,authorized:env.EDUXFAC_SUBSCRIPTION_WORKER_ALLOW_MUTATION==='yes'&&!!env.DATABASE_URL};
}
export function safeWorkerLog(event={}){
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 return {command_id:uuid.test(String(event.command_id))?event.command_id:null,empresa_id:uuid.test(String(event.empresa_id))?event.empresa_id:null,accion:'VENCIMIENTO',estado:event.estado==='ERROR'?'ERROR':'APLICADO',duracion_ms:Math.max(0,Math.floor(Number(event.duracion_ms)||0)),resultado:event.estado==='ERROR'?'ERROR':'APLICADO',error:event.estado==='ERROR'?'ERROR_WORKER':null,fecha:new Date().toISOString()};
}
export function createExpirationWorker({environment=process.env,clock=()=>Date.now(),logger=entry=>console.log(JSON.stringify(entry)),schedule=setInterval,unschedule=clearInterval}={}){
 const config=expirationConfiguration(environment),owner=randomUUID();let timer=null,running=null;
 async function execute({manual=false}={}){
  if(!config.enabled||!config.authorized)throw Error('Worker desactivado o sin autorización explícita.');
  const now=clock(),name='suscripciones',acquired=await tx(async db=>{
   await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['EDUXFAC_EXPIRATION_WORKER']);
   await db.query("insert into operacion_workers(nombre) values($1) on conflict do nothing",[name]);
   const r=(await db.query('select * from operacion_workers where nombre=$1 for update',[name])).rows[0];
   if(r.lease_until&&new Date(r.lease_until).getTime()>now)return false;
   if(!manual&&r.last_started&&new Date(r.last_started).getTime()+config.interval>now)return false;
   await db.query("update operacion_workers set owner=$2,lease_until=$3,last_started=$4,resultado='RUNNING' where nombre=$1",[name,owner,new Date(now+120000).toISOString(),new Date(now).toISOString()]);return true;
  });
  if(!acquired)return {estado:'OMITIDO'};
  try{
   const result=await expireDueSubscriptions({now:new Date(now),onEvent:async event=>{
    logger(safeWorkerLog(event));await pool.query('update operacion_workers set lease_until=$3 where nombre=$1 and owner=$2',[name,owner,new Date(clock()+120000).toISOString()]);
   }});
   await pool.query("update operacion_workers set lease_until=null,owner=null,last_finished=$3,resultado='OK' where nombre=$1 and owner=$2",[name,owner,new Date(clock()).toISOString()]);
   return {estado:'OK',...result};
  }catch(e){
   logger(safeWorkerLog({estado:'ERROR'}));
   await pool.query("update operacion_workers set lease_until=null,owner=null,last_finished=$3,resultado='ERROR' where nombre=$1 and owner=$2",[name,owner,new Date(clock()).toISOString()]);throw Error('No se pudo completar el worker de vencimientos.');
  }
 }
 const runOnce=options=>{if(running)return Promise.resolve({estado:'OMITIDO'});running=execute(options).finally(()=>running=null);return running;};
 function start(){if(!config.enabled)return false;if(!config.authorized)throw Error('Worker sin base y autorización explícitas.');if(!timer)timer=schedule(()=>void runOnce().catch(()=>{}),config.interval);return true;}
 async function stop(){if(timer){unschedule(timer);timer=null;}if(running)await running.catch(()=>{});}
 return {config,runOnce,start,stop};
}
