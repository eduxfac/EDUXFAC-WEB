import {createPlanFixture} from './plan-fixture.js';
import {panelRoot} from './state-fixture.js';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function createSubscriptionFixture(){
 const {f,m}=await createPlanFixture();await f.db.exec(readFileSync(new URL('../../database/migrations/005_suscripciones_vigencia.sql',import.meta.url),'utf8'));
 const subscriptionsModule=await import(pathToFileURL(path.join(panelRoot,'server/web-subscriptions.mjs')));subscriptionsModule.applyWebSubscriptionMigrations(m.db);
 const subscriptions=subscriptionsModule.createWebSubscriptionsService({db:m.db,transaction:m.transaction,webApiClient:f.panel});
 const {createWebPlansService}=await import(pathToFileURL(path.join(panelRoot,'server/web-plans.mjs')));
 const {createWebOnboardingService}=await import(pathToFileURL(path.join(panelRoot,'server/web-onboarding-service.mjs')));
 const {createWebCompanyStatesService}=await import(pathToFileURL(path.join(panelRoot,'server/web-company-states.mjs')));
 const plans=createWebPlansService({db:m.db,transaction:m.transaction,webApiClient:f.panel,subscriptionService:subscriptions});
 const onboarding=createWebOnboardingService({db:m.db,transaction:m.transaction,audit:m.audit,webApiClient:f.panel,commercialService:plans,subscriptionService:subscriptions});
 const states=createWebCompanyStatesService({db:m.db,transaction:m.transaction,webApiClient:f.panel,subscriptionService:subscriptions});
 let seq=0;
 async function create(plan='BASICO',{activate=true,start=today(),name}={}){
  seq++;const client=(await onboarding.handle('POST','/api/web/clientes',{nombre:name||'Cliente F5 '+seq,tipo_documento:'SIN_DOCUMENTO'})).data;
  const draft=await onboarding.handle('POST','/api/web/empresas',{cliente_id:client.id,razon_social:name||'Empresa F5 '+seq,ruc:'207'+String(seq).padStart(8,'0'),empresa_codigo:'F5-'+seq,sucursal_nombre:'PRINCIPAL',administrador_nombre:'Administrador ficticio',administrador_usuario:'admin_f5',plan_codigo:plan,fecha_inicio_suscripcion:start});
  if(draft.status!==201)throw Error('Borrador '+JSON.stringify(draft));
  const id=draft.data.empresa.id,complete=await onboarding.handle('POST','/api/web/empresas/'+id+'/completar',{password_temporal:'FAKE_F5_TEMP_PASSWORD_123'});
  if(complete.status!==200)throw Error('Completar '+JSON.stringify(complete));
  if(activate){const r=await onboarding.handle('POST','/api/web/empresas/'+id+'/activar',{});if(r.status!==200)throw Error('Activar '+JSON.stringify(r));}
  return {id,web:m.db.prepare('SELECT empresa_web_id FROM web_empresas WHERE id=?').get(id).empresa_web_id,code:'F5-'+seq,...subscriptions.view(id)};
 }
 const call=(id,action,body={})=>subscriptions.handle('POST','/api/web/suscripciones/'+id+'/'+action,body,{},'owner_test');
 const renew=(id,months=1,date=today(),command=randomUUID())=>call(id,'renovar',{command_id:command,motivo:'Renovación ficticia autorizada',meses:months,fecha_autorizada:date});
 const login=c=>f.request('/api/auth/login',{method:'POST',body:{usuario:'admin_f5',password:'FAKE_F5_TEMP_PASSWORD_123',empresa_codigo:c.code}});
 return {f,m,subscriptions,plans,onboarding,states,create,call,renew,login,module:subscriptionsModule,
  makeSubscriptions:client=>subscriptionsModule.createWebSubscriptionsService({db:m.db,transaction:m.transaction,webApiClient:client})};
}
