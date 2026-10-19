import {createStateFixture,panelRoot} from './state-fixture.js';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
if(process.env.NODE_ENV!=='test')throw Error('Solo entorno aislado explícito.');
const f=await createStateFixture();await f.db.exec(readFileSync(new URL('../../database/migrations/004_planes_limites.sql',import.meta.url),'utf8'));
const {createPanel}=await import(pathToFileURL(path.join(panelRoot,'server/app.mjs')));
const panel=createPanel({database:':memory:',prepareWebPlanTestSchema:true,webApiClient:f.panel});await new Promise(r=>panel.listen(0,'127.0.0.1',r));
const panelURL='http://127.0.0.1:'+panel.address().port;let cookie;
async function post(route,body){
 const r=await fetch(panelURL+route,{method:'POST',headers:{Origin:panelURL,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 if(route==='/api/login')cookie=r.headers.get('set-cookie').split(';')[0];
 const d=await r.json();if(!r.ok)throw Error(route+': '+r.status);return d;
}
await post('/api/setup',{username:'owner_test',password:'FAKE_PANEL_UI_PASSWORD_123'});await post('/api/login',{username:'owner_test',password:'FAKE_PANEL_UI_PASSWORD_123'});
const role=(await f.query("select id from roles where nombre='Administrador'")).rows[0].id;
let n=0;const companies=[];
for(const [code,users]of [['BASICO',3],['PROFESIONAL',4],['EMPRESA',5]]){
 const c=await post('/api/web/clientes',{nombre:'Cliente QA '+code,tipo_documento:'SIN_DOCUMENTO'});
 let d=(await post('/api/web/empresas',{cliente_id:c.id,razon_social:'Empresa QA '+code,nombre_comercial:'Comercial QA '+code,ruc:'2093000000'+(++n),empresa_codigo:'QA-'+code,sucursal_nombre:'PRINCIPAL',administrador_nombre:'Admin QA',administrador_usuario:'admin',plan_codigo:code})).empresa;
 d=(await post('/api/web/empresas/'+d.id+'/completar',{password_temporal:'FAKE_QA_PLAN_PASSWORD_123'})).empresa;await post('/api/web/empresas/'+d.id+'/activar',{});
 const login=await f.request('/api/auth/login',{method:'POST',body:{empresa_codigo:d.empresa_codigo,usuario:'admin',password:'FAKE_QA_PLAN_PASSWORD_123'}});
 const changed=await f.request('/api/auth/password/change',{method:'POST',token:login.data.token,body:{password_temporal:'FAKE_QA_PLAN_PASSWORD_123',password_nuevo:'FAKE_QA_FRESH_PASSWORD_456'}});
 const token=changed.data.token;if(!token)throw Error('Login ficticio no disponible.');
 for(let i=2;i<=users;i++){const r=await f.request('/api/admin/users',{method:'POST',token,body:{nombre:'Usuario QA '+i,usuario:'qa_'+i,password:'FAKE_QA_USER_PASSWORD_123',asignaciones:[{sucursal_id:d.steps.sucursal,rol_id:role}]}});if(r.status!==201)throw Error('Usuario QA no creado.');}
 if(code==='EMPRESA')for(let i=2;i<=3;i++)await f.request('/api/admin/branches',{method:'POST',token,body:{codigo:'QA-'+i,nombre:'Sucursal QA '+i}});
 if(code==='BASICO')await f.request('/api/admin/users',{method:'POST',token,body:{nombre:'Cuota alcanzada',usuario:'qa_rechazado',password:'FAKE_QA_USER_PASSWORD_123',asignaciones:[{sucursal_id:d.steps.sucursal,rol_id:role}]}});
 await post('/api/web/comercial/empresas/'+d.id+'/uso',{});companies.push({id:d.id,codigo:d.empresa_codigo});
}
console.log(JSON.stringify({panelURL,onlyMemoryDatabases:true,companies}));
let closed=false;async function close(){if(closed)return;closed=true;await new Promise(r=>panel.close(r));await f.close();console.log('Fixtures Fase 4 cerradas; ninguna base real fue abierta.');process.exit(0);}
process.stdin.setEncoding('utf8');process.stdin.on('data',s=>{if(s.trim()==='stop')void close();});process.stdin.resume();process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
