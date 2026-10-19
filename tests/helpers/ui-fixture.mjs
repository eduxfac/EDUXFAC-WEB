import {createFixture} from './isolated-web.js';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
if(process.env.NODE_ENV!=='test')throw Error('Esta fixture solo se inicia con NODE_ENV=test.');
const f=await createFixture();
await f.db.exec(await readFile(new URL('../../database/migrations/002_alta_clientes_empresas.sql',import.meta.url),'utf8'));
const webRoot=fileURLToPath(new URL('../../',import.meta.url));
const {createPanel}=await import(pathToFileURL(path.resolve(webRoot,'../../../PANEL EDUXFAC/01_TRABAJO_ACTUAL/PANEL_EDUXFAC_ACTUAL/server/app.mjs')));
const panel=createPanel({database:':memory:',prepareWebTestSchema:true,webApiClient:f.panel});await new Promise(resolve=>panel.listen(0,'127.0.0.1',resolve));
const panelURL='http://127.0.0.1:'+panel.address().port;
await fetch(panelURL+'/api/setup',{method:'POST',headers:{Origin:panelURL,'Content-Type':'application/json'},body:JSON.stringify({username:'owner_test',password:'FAKE_PANEL_UI_PASSWORD_123'})});
console.log(JSON.stringify({panelURL,webURL:(()=>{return undefined;})(),onlyMemoryDatabases:true}));
let closed=false;async function close(){if(closed)return;closed=true;await new Promise(resolve=>panel.close(resolve));await f.close();console.log('Fixtures cerradas; ninguna base persistente fue abierta.');process.exit(0);}
process.stdin.setEncoding('utf8');process.stdin.on('data',input=>{if(input.trim()==='stop')void close();});process.stdin.resume();process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
