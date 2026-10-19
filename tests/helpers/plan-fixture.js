import {createStateFixture,createMemoryPanel,panelRoot} from './state-fixture.js';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
export async function createPlanFixture(){
 const f=await createStateFixture();await f.db.exec(readFileSync(new URL('../../database/migrations/004_planes_limites.sql',import.meta.url),'utf8'));
 const m=await createMemoryPanel(f);
 const {applyWebPlanMigrations,createWebPlansService}=await import(pathToFileURL(path.join(panelRoot,'server/web-plans.mjs')));
 const {createWebOnboardingService}=await import(pathToFileURL(path.join(panelRoot,'server/web-onboarding-service.mjs')));
 applyWebPlanMigrations(m.db);const plans=createWebPlansService({db:m.db,transaction:m.transaction,webApiClient:f.panel});
 const onboarding=createWebOnboardingService({db:m.db,transaction:m.transaction,audit:m.audit,webApiClient:f.panel,commercialService:plans});
 return {f,m,plans,onboarding,applyWebPlanMigrations,createPlans:client=>createWebPlansService({db:m.db,transaction:m.transaction,webApiClient:client})};
}
