import {createSubscriptionFixture,today} from './subscription-fixture.js';
import {panelRoot} from './state-fixture.js';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
if(process.env.NODE_ENV!=='test')throw Error('Solo pruebas ficticias.');
const x=await createSubscriptionFixture();
const {createPanel}=await import(pathToFileURL(path.join(panelRoot,'server/app.mjs')));
const server=createPanel({database:':memory:',prepareWebSubscriptionTestSchema:true,webApiClient:x.f.panel});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let cookie;
async function req(url,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(body?{Origin:base,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return d;}
await req('/api/setup',{username:'owner_test',password:'FAKE_PANEL_UI_PASSWORD_123'});
await req('/api/login',{username:'owner_test',password:'FAKE_PANEL_UI_PASSWORD_123'});
let seq=0;
for(const [name,plan,days,suspended]of [['A','BASICO',5,false],['B','PROFESIONAL',-1,false],['C','EMPRESA',20,false],['D','BASICO',15,true]]){
 seq++;const client=await req('/api/web/clientes',{nombre:'Cliente '+name+' · FICTICIO',tipo_documento:'SIN_DOCUMENTO'});
 const {empresa:c}=await req('/api/web/empresas',{cliente_id:client.id,razon_social:'Empresa '+name+' · FICTICIA',ruc:'208'+String(seq).padStart(8,'0'),empresa_codigo:'UI-F5-'+name,sucursal_nombre:'PRINCIPAL',administrador_nombre:'Admin ficticio',administrador_usuario:'admin_ui',plan_codigo:plan,fecha_inicio_suscripcion:today()});
 await req('/api/web/empresas/'+c.id+'/completar',{password_temporal:'FAKE_UI_F5_TEMP_PASSWORD_123'});await req('/api/web/empresas/'+c.id+'/activar',{});
 await x.f.query('update empresa_acceso set fecha_inicio=$2,fecha_vencimiento=$3 where empresa_id=$1',[ (await req('/api/web/suscripciones/'+c.id)).empresa.empresa_web_id,new Date(Date.now()-20*86400000).toISOString(),new Date(Date.now()+days*86400000).toISOString()]);
 if(suspended)await req('/api/web/estados/empresas/'+c.id+'/suspender',{motivo:'Suspensión ficticia de control visual'});
 await req('/api/web/suscripciones/'+c.id+'/consultar',{});
}
console.log('UI_FASE5_URL='+base);console.log('Credenciales ficticias: owner_test / FAKE_PANEL_UI_PASSWORD_123');
process.stdin.setEncoding('utf8');process.stdin.on('data',async text=>{if(text.trim()==='stop'){await new Promise(r=>server.close(r));x.m.db.close();await x.f.close();console.log('Fixture Fase 5 detenida; bases en memoria cerradas.');process.exit(0);}});
