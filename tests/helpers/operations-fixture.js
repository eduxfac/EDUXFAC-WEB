import {createSubscriptionFixture} from './subscription-fixture.js';
import {panelRoot} from './state-fixture.js';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
export async function createOperationsFixture(){
 const x=await createSubscriptionFixture();await x.f.db.exec(readFileSync(new URL('../../database/migrations/006_operacion_workers.sql',import.meta.url),'utf8'));
 const queue=await import(pathToFileURL(path.join(panelRoot,'server/integration-queue.mjs'))),module=await import(pathToFileURL(path.join(panelRoot,'server/integration-operations.mjs')));
 queue.applyIntegrationMigrations(x.m.db);
 let now=Date.now();
 const createOps=(client=x.f.panel,options={})=>module.createIntegrationOperations({db:x.m.db,transaction:x.m.transaction,webApiClient:client,stateService:options.states||x.states,commercialService:options.plans||x.plans,subscriptionService:options.subscriptions||x.subscriptions,environment:{MAX_INTEGRATION_RETRIES:'5',...options.env},clock:()=>now,...options.timers});
 const operations=createOps();
 const rebuild=async client=>{
  const {createWebCompanyStatesService}=await import(pathToFileURL(path.join(panelRoot,'server/web-company-states.mjs')));
  const {createWebPlansService}=await import(pathToFileURL(path.join(panelRoot,'server/web-plans.mjs')));
  const subscriptions=x.makeSubscriptions(client),states=createWebCompanyStatesService({db:x.m.db,transaction:x.m.transaction,webApiClient:client,subscriptionService:subscriptions}),plans=createWebPlansService({db:x.m.db,transaction:x.m.transaction,webApiClient:client,subscriptionService:subscriptions});
  return {subscriptions,states,plans,operations:createOps(client,{states,plans,subscriptions})};
 };
 return {...x,operations,queue,createOps,rebuild,advance:ms=>now+=ms,now:()=>now,close:async()=>{await operations.stop();x.m.db.close();await x.f.close();}};
}
