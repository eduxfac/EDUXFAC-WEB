import {pool,runWithServiceContext} from '../src/db.js';
import {processCpeJob} from '../src/sunat-api.js';
import {createSunatScheduler} from '../src/sunat-schedule.js';
if(process.env.CPE_WORKER_ENABLED!=='true')throw Error('CPE_WORKER_DISABLED');
const worker=createSunatScheduler({pool,processJob:processCpeJob,serviceContext:runWithServiceContext});
if(process.argv.includes('--once')){await worker.tick();await pool.end();}else{worker.start();const keepAlive=setInterval(()=>{},3600000);const stop=async()=>{clearInterval(keepAlive);await worker.stop();await pool.end();};process.once('SIGTERM',stop);process.once('SIGINT',stop);}
