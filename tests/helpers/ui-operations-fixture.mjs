import {createOperationsFixture} from './operations-fixture.js';
import {panelRoot} from './state-fixture.js';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createExpirationWorker} from '../../server/scripts/expiration-worker.js';
if(process.env.NODE_ENV!=='test')throw Error('Solo fixture ficticio.');
const x=await createOperationsFixture();let blockedC=null,blockedD=null;
const client={...x.f.panel,operacion:async(id,command)=>{if(id===blockedC)throw Object.assign(Error('Corte ficticio'),{status:503,code:'ERROR_API'});return x.f.panel.operacion(id,command);},renovar:async(id,body)=>{if(id===blockedD)throw Error('Corte ficticio de renovación');return x.f.panel.renovar(id,body);}};
const {createPanel}=await import(pathToFileURL(path.join(panelRoot,'server/app.mjs')));
const server=createPanel({database:':memory:',prepareWebOperationTestSchema:true,webApiClient:client,workerEnvironment:{}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let cookie;
async function req(url,body,{allowError=false}={}){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(body?{Origin:base,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok&&!allowError)throw Error(JSON.stringify(d));if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return d;}
await req('/api/setup',{username:'owner_test',password:'FAKE_PANEL_F6_UI_PASSWORD_123'});await req('/api/login',{username:'owner_test',password:'FAKE_PANEL_F6_UI_PASSWORD_123'});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let seq=0;const firms=[];
for(const [name,plan,days] of [['A','BASICO',5],['B','PROFESIONAL',-1],['C','EMPRESA',20],['D','BASICO',15]]){
 seq++;const c=await req('/api/web/clientes',{nombre:'Cliente '+name+' · FICTICIO',tipo_documento:'SIN_DOCUMENTO'});
 const {empresa:d}=await req('/api/web/empresas',{cliente_id:c.id,razon_social:'Empresa '+name+' · FICTICIA',ruc:'208'+String(seq).padStart(8,'0'),empresa_codigo:'UI-F6-'+name,sucursal_nombre:'PRINCIPAL',administrador_nombre:'Admin ficticio',administrador_usuario:'admin_ui_f6',plan_codigo:plan,fecha_inicio_suscripcion:today});
 await req('/api/web/empresas/'+d.id+'/completar',{password_temporal:'FAKE_F6_UI_TEMP_PASSWORD_123'});await req('/api/web/empresas/'+d.id+'/activar',{});
 const web=(await req('/api/web/suscripciones/'+d.id)).empresa.empresa_web_id;
 await x.f.query('update empresa_acceso set fecha_inicio=$2,fecha_vencimiento=$3 where empresa_id=$1',[web,new Date(Date.now()-20*86400000).toISOString(),new Date(Date.now()+days*86400000).toISOString()]);
 await req('/api/web/suscripciones/'+d.id+'/consultar',{});
 if(name==='D'){await req('/api/web/estados/empresas/'+d.id+'/suspender',{motivo:'Suspensión administrativa ficticia'});blockedD=web;await req('/api/web/suscripciones/'+d.id+'/renovar',{command_id:crypto.randomUUID(),meses:1,fecha_autorizada:today,motivo:'Renovación pendiente por corte ficticio'},{allowError:true});}
 if(name==='C')blockedC=web;
 firms.push({name,id:d.id,web});
}
const worker=createExpirationWorker({environment:{EXPIRATION_WORKER_ENABLED:'true',EXPIRATION_WORKER_INTERVAL_MS:'60000',DATABASE_URL:'FAKE_UI_MEMORY_ONLY',EDUXFAC_SUBSCRIPTION_WORKER_ALLOW_MUTATION:'yes'},logger:()=>{}});await worker.runOnce();
await req('/api/web/operacion/health',{});
for(const f of firms)await req('/api/web/operacion/empresas/'+f.id+'/conciliar',{motivo:'Conciliación visual inicial ficticia'});
console.log('UI_FASE6_URL='+base);console.log('Datos ficticios: owner_test / FAKE_PANEL_F6_UI_PASSWORD_123');
process.stdin.setEncoding('utf8');process.stdin.on('data',async data=>{
 const command=data.trim();if(command==='recover'){blockedC=null;blockedD=null;console.log('Conectividad ficticia restablecida para C y D.');}
 if(command==='stop'){await new Promise(r=>server.close(r));await x.close();console.log('Fixture Fase 6 detenido; bases ficticias cerradas.');process.exit(0);}
});
