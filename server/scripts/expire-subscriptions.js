import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {pool} from '../src/db.js';
import {expireDueSubscriptions} from '../src/subscription-service.js';
import {createExpirationWorker} from './expiration-worker.js';
// Por defecto consulta seca. Workers configurados y mutaciones requieren autorización explícita.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const configured=process.argv.includes('--configured');
 if(configured){
  const worker=createExpirationWorker();if(worker.start()){
   const stop=async()=>{await worker.stop();await pool.end();};process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
  }else{console.log({worker:'DESACTIVADO'});await pool.end();}
 }else{
  if(!process.env.DATABASE_URL)throw Error('Declara explícitamente la base objetivo.');
  const apply=process.argv.includes('--apply');
  if(apply&&process.env.EDUXFAC_SUBSCRIPTION_WORKER_ALLOW_MUTATION!=='yes')throw Error('Se requiere autorización explícita del worker.');
  const run=async()=>{if(apply)console.log(await expireDueSubscriptions());else console.log({dry_run:true,pendientes:(await pool.query("select count(*)::int n from empresa_acceso where estado_suscripcion='ACTIVA' and fecha_vencimiento<=now()")).rows[0].n});};
  try{
   await run();
   if(process.argv.includes('--watch')){
    const env={...process.env,EXPIRATION_WORKER_ENABLED:'true'};
    // --watch sin --apply nunca modifica la base.
    if(!apply){const interval=Number(process.env.EXPIRATION_WORKER_INTERVAL_MS||60000);if(!Number.isSafeInteger(interval)||interval<60000)throw Error('Intervalo mínimo 60000 ms.');let running=false;const timer=setInterval(async()=>{if(running)return;running=true;try{await run();}catch{console.error('ERROR_WORKER');}finally{running=false;}},interval);const stop=()=>{clearInterval(timer);void pool.end();};process.once('SIGINT',stop);process.once('SIGTERM',stop);}
    else{const worker=createExpirationWorker({environment:env});worker.start();const stop=async()=>{await worker.stop();await pool.end();};process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());}
   }else await pool.end();
  }catch{console.error('ERROR_WORKER: revisa configuración, conexión y migraciones.');await pool.end();process.exitCode=1;}
 }
}
