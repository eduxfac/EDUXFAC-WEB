
import {app,initializeDatabase} from './src/app.js';
import {pool,runWithServiceContext} from './src/db.js';
import {createExpirationWorker} from './scripts/expiration-worker.js';
import {createSunatScheduler} from './src/sunat-schedule.js';
import {processCpeJob} from './src/sunat-api.js';
const sunatWorker=createSunatScheduler({pool,processJob:processCpeJob,serviceContext:runWithServiceContext});
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('WEB_PORT_INVALID');
await initializeDatabase({migrate:false});
if(process.env.CPE_API_URL&&process.env.CPE_SCHEDULER_ENABLED!=='false')sunatWorker.start();
const worker=createExpirationWorker();runWithServiceContext(()=>worker.start());
const server=app.listen(port,'127.0.0.1',()=>console.log('EDUXFAC_WEB_LISTO'));
server.on('error',async error=>{console.error(error.code==='EADDRINUSE'?'WEB_PORT_BUSY':'WEB_LISTEN_ERROR');await worker.stop();await sunatWorker.stop();await pool.end();process.exitCode=1;});
let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await worker.stop();await sunatWorker.stop();server.close(async()=>{await pool.end();process.exit(0);});};process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
