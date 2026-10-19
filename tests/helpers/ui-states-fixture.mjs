import {createStateFixture,panelRoot} from './state-fixture.js';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
if(process.env.NODE_ENV!=='test')throw Error('Solo NODE_ENV=test con bases en memoria.');
const f=await createStateFixture();
const {createPanel}=await import(pathToFileURL(path.join(panelRoot,'server/app.mjs')));
let lost=true;
const remote=new Proxy(f.panel,{get(target,key){return key==='suspender'?async(...args)=>{const r=await target.suspender(...args);if(lost&&args[1].motivo==='PRUEBA SIN RESPUESTA'){lost=false;throw Error('FAKE lost response AFTER COMMIT');}return r;}:target[key];}});
const panel=createPanel({database:':memory:',prepareWebStateTestSchema:true,webApiClient:remote});await new Promise(r=>panel.listen(0,'127.0.0.1',r));
const panelURL='http://127.0.0.1:'+panel.address().port;
await fetch(panelURL+'/api/setup',{method:'POST',headers:{Origin:panelURL,'Content-Type':'application/json'},body:JSON.stringify({username:'owner_test',password:'FAKE_PANEL_UI_PASSWORD_123'})});
console.log(JSON.stringify({panelURL,onlyMemoryDatabases:true}));
let closed=false;
async function close(){if(closed)return;closed=true;await new Promise(r=>panel.close(r));await f.close();console.log('Fixtures Fase 3 cerradas. Ninguna base persistente abierta.');process.exit(0);}
process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{if(s.trim()==='stop')void close();});process.stdin.resume();process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
