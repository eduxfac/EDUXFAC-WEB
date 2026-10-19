import {createFixture,ids} from './isolated-web.js';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const webRoot=fileURLToPath(new URL('../../',import.meta.url));
export const panelRoot=path.resolve(webRoot,'../../../PANEL EDUXFAC/01_TRABAJO_ACTUAL/PANEL_EDUXFAC_ACTUAL');
export async function createStateFixture(){
 const f=await createFixture();
 try{for(const name of ['002_alta_clientes_empresas','003_estados_empresa'])await f.db.exec(readFileSync(path.join(webRoot,'database/migrations',name+'.sql'),'utf8'));return f;}catch(error){await f.close();throw error;}
}
export async function createMemoryPanel(f,{webApiClient=f.panel}={}){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(path.join(panelRoot,'database/schema.sql'),'utf8'));
 const {applyLicensingMigrations}=await import(pathToFileURL(path.join(panelRoot,'server/licensing-service.mjs')));
 const {applyWebOnboardingMigrations,createWebOnboardingService}=await import(pathToFileURL(path.join(panelRoot,'server/web-onboarding-service.mjs')));
 const {applyWebStateMigrations,createWebCompanyStatesService}=await import(pathToFileURL(path.join(panelRoot,'server/web-company-states.mjs')));
 applyLicensingMigrations(db,path.join(panelRoot,'database/migrations'));applyWebOnboardingMigrations(db);applyWebStateMigrations(db);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(error){db.exec('ROLLBACK');throw error;}};
 const audit=(event,detail)=>db.prepare('INSERT INTO history(event,detail) VALUES (?,?)').run(event,detail);
 const states=createWebCompanyStatesService({db,transaction,webApiClient}),onboarding=createWebOnboardingService({db,transaction,audit,webApiClient});
 const client=(await onboarding.handle('POST','/api/web/clientes',{nombre:'Cliente prueba A',tipo_documento:'SIN_DOCUMENTO'})).data;
 const draftId=randomUUID();
 const company=(await onboarding.handle('POST','/api/web/empresas',{id:draftId,cliente_id:client.id,razon_social:'Empresa A',nombre_comercial:'Comercial A',ruc:'20111111111',empresa_codigo:'EMPRESA-A',sucursal_nombre:'PRINCIPAL',administrador_nombre:'Usuario A',administrador_usuario:'admin'})).data.empresa;
 db.prepare("UPDATE web_empresas SET empresa_web_id=?,estado='ACTIVO',sync_status='CONFIRMADO',steps_json=? WHERE id=?").run(ids.empresaA,JSON.stringify({cliente:randomUUID(),empresa:ids.empresaA,sucursal:ids.sucursalA,administrador:ids.usuarioA}),company.id);
 return {db,states,onboarding,companyId:company.id,clientId:client.id,transaction,audit,applyWebStateMigrations,createService:client=>createWebCompanyStatesService({db,transaction,webApiClient:client})};
}
