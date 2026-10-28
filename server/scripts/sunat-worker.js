import {pool,runWithServiceContext} from '../src/db.js';
import {processCpeJob} from '../src/sunat-api.js';
if(process.env.CPE_WORKER_ENABLED!=='true')throw Error('CPE_WORKER_DISABLED');
if(!process.env.CPE_API_URL)throw Error('CPE_CONFIGURATION_REQUIRED');
let stopping=false;process.once('SIGTERM',()=>stopping=true);process.once('SIGINT',()=>stopping=true);
try{await runWithServiceContext(async()=>{do{
 const jobs=(await pool.query("SELECT id,empresa_id FROM sunat_outbox WHERE estado IN ('PENDIENTE','PREPARADO','FIRMADO','NO_RECIBIDO') AND intentos<5 AND updated_at < now() - interval '1 minute' ORDER BY created_at LIMIT 20")).rows;
 for(const job of jobs){if(stopping)break;try{await processCpeJob(job.empresa_id,job.id);}catch{console.error('CPE_JOB_NOT_CONFIRMED',job.id);}}
 if(process.argv.includes('--once'))break;for(let i=0;i<60&&!stopping;i++)await new Promise(r=>setTimeout(r,1000));
 }while(!stopping);});}finally{await pool.end();}
