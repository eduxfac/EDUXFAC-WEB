import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {createFixture,ids} from './helpers/isolated-web.js';
const panelRoot=path.resolve(fileURLToPath(new URL('../',import.meta.url)),'../../../PANEL EDUXFAC/01_TRABAJO_ACTUAL/PANEL_EDUXFAC_ACTUAL');
const {applyLicensingMigrations}=await import(pathToFileURL(path.join(panelRoot,'server/licensing-service.mjs')));
const {createWebOnboardingService,applyWebOnboardingMigrations}=await import(pathToFileURL(path.join(panelRoot,'server/web-onboarding-service.mjs')));
const temporary='FAKE_TEMPORAL_ONLY_TEST_123';const fresh='FAKE_NEW_PASSWORD_ONLY_TEST_456';
function command(extra={}){return {command_id:randomUUID(),motivo:'PRUEBA AISLADA FASE 2',...extra};}
async function prepare(){const f=await createFixture();try{await f.db.exec(await readFile(new URL('../database/migrations/002_alta_clientes_empresas.sql',import.meta.url),'utf8'));return f;}catch(error){await f.close();throw error;}}
function localService(remote){const db=new DatabaseSync(':memory:');db.exec(readFileSync(path.join(panelRoot,'database/schema.sql'),'utf8'));applyLicensingMigrations(db,path.join(panelRoot,'database/migrations'));applyWebOnboardingMigrations(db);
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 const audit=(event,detail)=>db.prepare('insert into history(event,detail) values(?,?)').run(event,detail);
 return {db,service:createWebOnboardingService({db,transaction,audit,webApiClient:remote}),replace:newRemote=>createWebOnboardingService({db,transaction,audit,webApiClient:newRemote})};}
async function draft(service,letter,ruc){const client=await service.handle('POST','/api/web/clientes',{nombre:'Cliente de prueba '+letter,tipo_documento:'DNI',numero_documento:letter==='A'?'12345671':'12345672',telefono:'999000111',correo:'prueba'+letter+'@example.invalid',estado:'ACTIVO'});assert.equal(client.status,201);
 const created=await service.handle('POST','/api/web/empresas',{id:randomUUID(),cliente_id:client.data.id,razon_social:'Empresa prueba '+letter,nombre_comercial:'Botica prueba '+letter,ruc,empresa_codigo:'ALTA-'+letter,sucursal_nombre:'PRINCIPAL '+letter,administrador_nombre:'Administrador '+letter,administrador_usuario:'admin'});assert.equal(created.status,201);return created.data.empresa;}
test('Fase 2: alta real Panel SQLite → API WEB PostgreSQL en memoria',async t=>{
 const f=await prepare();t.after(()=>f.close());const local=localService(f.panel);t.after(()=>local.db.close());let a,b,tokenA,tokenB;
 await t.test('cliente y borrador quedan separados de clientes compradores WEB',async()=>{
  a=await draft(local.service,'A','20333333331');assert.equal(a.estado,'PENDIENTE');assert.equal(a.empresa_web_id,null);assert.equal((await f.query('select count(*)::int n from clientes')).rows[0].n,0);
  const duplicate=await local.service.handle('POST','/api/web/clientes',{nombre:'Duplicado',tipo_documento:'DNI',numero_documento:'12345671',estado:'ACTIVO'});assert.equal(duplicate.status,409);
 });
 await t.test('completa cliente, empresa, sucursal y administrador sin activar',async()=>{
  const result=await local.service.handle('POST','/api/web/empresas/'+a.id+'/completar',{password_temporal:temporary});assert.equal(result.status,200);a=result.data.empresa;assert.equal(a.estado,'PENDIENTE');assert.ok(['cliente','empresa','sucursal','administrador'].every(k=>a.steps[k]));
  assert.equal((await f.request('/api/auth/login',{method:'POST',body:{empresa_codigo:'ALTA-A',usuario:'admin',password:temporary}})).status,403);
  const user=(await f.query('select password_hash,debe_cambiar_password from usuarios where id=$1',[a.steps.administrador])).rows[0];assert.notEqual(user.password_hash,temporary);assert.equal(await bcrypt.compare(temporary,user.password_hash),true);assert.equal(user.debe_cambiar_password,true);
 });
 await t.test('activa solo tras confirmar y el login exige cambio inicial de contraseña',async()=>{
  const active=await local.service.handle('POST','/api/web/empresas/'+a.id+'/activar',{});assert.equal(active.status,200);a=active.data.empresa;assert.equal(a.estado,'ACTIVO');
  const login=await f.request('/api/auth/login',{method:'POST',body:{empresa_codigo:'ALTA-A',usuario:'admin',password:temporary}});assert.equal(login.status,200);assert.equal(login.data.debe_cambiar_password,true);
  const restricted=login.data.token;assert.equal((await f.request('/api/bootstrap',{token:restricted})).status,401);
  const wrong=await f.request('/api/auth/password/change',{token:restricted,method:'POST',body:{password_temporal:'INCORRECTA_DE_PRUEBA',password_nuevo:fresh}});assert.equal(wrong.status,401);
  const changed=await f.request('/api/auth/password/change',{token:restricted,method:'POST',body:{password_temporal:temporary,password_nuevo:fresh}});assert.equal(changed.status,200);tokenA=changed.data.token;
  assert.equal((await f.request('/api/bootstrap',{token:tokenA})).status,200);assert.equal((await f.request('/api/auth/password/change',{token:restricted,method:'POST',body:{password_temporal:temporary,password_nuevo:fresh}})).status,401);
  assert.equal((await f.request('/api/auth/login',{method:'POST',body:{empresa_codigo:'ALTA-A',usuario:'admin',password:temporary}})).status,401);
 });
 await t.test('completa y activa B sin afectar A',async()=>{
  b=await draft(local.service,'B','20444444441');b=(await local.service.handle('POST','/api/web/empresas/'+b.id+'/completar',{password_temporal:temporary})).data.empresa;
  assert.equal((await local.service.handle('POST','/api/web/empresas/'+b.id+'/activar',{})).status,200);
  const login=await f.request('/api/auth/login',{method:'POST',body:{empresa_codigo:'ALTA-B',usuario:'admin',password:temporary}});
  const change=await f.request('/api/auth/password/change',{token:login.data.token,method:'POST',body:{password_temporal:temporary,password_nuevo:fresh}});assert.equal(change.status,200);tokenB=change.data.token;
  assert.equal((await f.request('/api/bootstrap',{token:tokenA})).status,200);
 });
 await t.test('aislamiento A/B tras alta: usuarios, sucursales, productos y operaciones',async()=>{
  const productA=randomUUID(),productB=randomUUID();
  for(const [item,company,branch,name] of [[productA,a.empresa_web_id,a.steps.sucursal,'ALTA PRODUCTO A'],[productB,b.empresa_web_id,b.steps.sucursal,'ALTA PRODUCTO B']]){await f.query('insert into productos(id,empresa_id,codigo_interno,nombre) values($1,$2,$3,$4)',[item,company,'PRODUCTO-ALTA',name]);await f.query("insert into producto_sucursal(producto_id,sucursal_id,origen) values($1,$2,'operacion')",[item,branch]);}
  const own=await f.request('/api/products?sucursal_id='+a.steps.sucursal,{token:tokenA});assert.equal(own.status,200);assert.ok(!own.data.some(x=>x.id===productB));
  assert.equal((await f.request('/api/products?sucursal_id='+b.steps.sucursal,{token:tokenA})).status,403);
  const list=await f.request('/api/admin/users',{token:tokenA});assert.ok(!list.data.some(x=>x.id===b.steps.administrador));
  assert.equal((await f.request('/api/admin/users/'+b.steps.administrador+'/permissions',{token:tokenA})).status,404);
  assert.equal((await f.request('/api/purchase-orders',{token:tokenA,method:'POST',body:{sucursal_id:a.steps.sucursal,items:[{producto_id:productB,cantidad:1,costo_referencia:1}]}})).status,403);
 });
 await t.test('idempotencia de empresa, sucursal, administrador y activación no duplica recursos',async()=>{
  const commands=JSON.parse(local.db.prepare('select commands_json from web_empresas where id=?').get(a.id).commands_json);
  const replay=await f.panel.crearEmpresa(command({command_id:commands.empresa,cliente_id:a.steps.cliente,razon_social:'Empresa prueba A',nombre_comercial:'Botica prueba A',ruc:'20333333331',empresa_codigo:'ALTA-A',motivo:'Alta WEB desde PANEL'}));assert.equal(replay.empresa_id,a.empresa_web_id);assert.equal(replay.replayed,true);
  const branch=await f.panel.crearSucursalPrincipal(a.empresa_web_id,command({command_id:commands.sucursal,nombre:'PRINCIPAL A',motivo:'Alta WEB desde PANEL'}));assert.equal(branch.sucursal_id,a.steps.sucursal);
  const user=await f.panel.crearAdministradorInicial(a.empresa_web_id,command({command_id:commands.administrador,nombre:'Administrador A',usuario:'admin',password_temporal:temporary,sucursal_id:a.steps.sucursal,motivo:'Alta WEB desde PANEL'}));assert.equal(user.usuario_id,a.steps.administrador);assert.equal(Object.hasOwn(user,'password_hash'),false);
  const before=(await f.panel.estado(a.empresa_web_id)).auth_version;const active=await f.panel.activar(a.empresa_web_id,{command_id:commands.activar,motivo:'Activación final de alta WEB'});assert.equal(active.replayed,true);assert.equal((await f.panel.estado(a.empresa_web_id)).auth_version,before);
  assert.equal((await f.query('select count(*)::int n from empresas where ruc=$1',['20333333331'])).rows[0].n,1);
  assert.equal((await f.query('select count(*)::int n from sucursales where empresa_id=$1 and es_principal',[a.empresa_web_id])).rows[0].n,1);
  assert.equal((await f.query('select count(*)::int n from usuarios where empresa_id=$1 and es_administrador_inicial',[a.empresa_web_id])).rows[0].n,1);
 });
 await t.test('JWT normal no puede crear clientes, empresas, sucursal, admin ni activar',async()=>{
  for(const route of ['/clientes','/empresas','/empresas/'+a.empresa_web_id+'/sucursal-principal','/empresas/'+a.empresa_web_id+'/administrador-inicial','/empresas/'+a.empresa_web_id+'/activar'])assert.equal((await f.request('/api/internal/admin/v1'+route,{token:tokenA,method:'POST',body:{command_id:randomUUID(),motivo:'NO AUTORIZADO'}})).status,401);
 });
 await t.test('no hay contraseña temporal en persistencia Panel ni auditoría WEB',async()=>{
  for(const table of ['web_empresas','clients','history'])assert.equal(JSON.stringify(local.db.prepare('select * from '+table).all()).includes(temporary),false);
  const audit=JSON.stringify((await f.query('select * from acciones_admin')).rows);assert.equal(audit.includes(temporary),false);assert.equal(audit.includes('password_hash'),false);
 });
 await t.test('suspender/reactivar mantiene Fase 1 e independencia de B',async()=>{
  await f.panel.suspender(a.empresa_web_id,command());assert.equal((await f.request('/api/bootstrap',{token:tokenA})).status,403);assert.equal((await f.request('/api/bootstrap',{token:tokenB})).status,200);
  await f.panel.reactivar(a.empresa_web_id,command());assert.equal((await f.request('/api/bootstrap',{token:tokenA})).status,401);const relogin=await f.request('/api/auth/login',{method:'POST',body:{empresa_codigo:'ALTA-A',usuario:'admin',password:fresh}});assert.equal(relogin.status,200);assert.equal((await f.request('/api/bootstrap',{token:relogin.data.token})).status,200);
 });
});
test('Fase 2: rechaza alta incompleta, conflicto y referencias ajenas',async t=>{
 const f=await prepare();t.after(()=>f.close());let client,company,branch;
 await t.test('crea cliente administrativo y empresa pendiente',async()=>{client=(await f.panel.crearCliente(command({cliente_panel_id:randomUUID(),nombre:'Cliente incompleto',tipo_documento:'SIN_DOCUMENTO',numero_documento:null,estado:'ACTIVO'}))).cliente_id;company=(await f.panel.crearEmpresa(command({cliente_id:client,razon_social:'Empresa incompleta',ruc:'20555555551',empresa_codigo:'INCOMPLETA'}))).empresa_id;});
 await t.test('activar sin sucursal es rechazado y conserva PENDIENTE',async()=>{await assert.rejects(()=>f.panel.activar(company,command()),e=>e.status===409);assert.equal((await f.panel.estado(company)).estado,'PENDIENTE');});
 await t.test('activar con sucursal pero sin administrador es rechazado',async()=>{branch=(await f.panel.crearSucursalPrincipal(company,command({nombre:'Principal'}))).sucursal_id;await assert.rejects(()=>f.panel.activar(company,command()),e=>e.status===409);});
 await t.test('no acepta administrador en sucursal de otra empresa',async()=>{await assert.rejects(()=>f.panel.crearAdministradorInicial(company,command({nombre:'Admin',usuario:'admin',password_temporal:temporary,sucursal_id:ids.sucursalB})),e=>e.status===400);assert.equal((await f.query('select count(*)::int n from usuarios where empresa_id=$1',[company])).rows[0].n,0);});
 await t.test('otra orden no duplica principal ni administrador inicial',async()=>{
  assert.equal((await f.panel.crearSucursalPrincipal(company,command({nombre:'Principal'}))).sucursal_id,branch);
  const user=await f.panel.crearAdministradorInicial(company,command({nombre:'Admin',usuario:'admin',password_temporal:temporary,sucursal_id:branch}));assert.equal((await f.panel.crearAdministradorInicial(company,command({nombre:'Admin',usuario:'admin',password_temporal:temporary,sucursal_id:branch}))).usuario_id,user.usuario_id);
 });
 await t.test('RUC y código existentes se rechazan sin crear empresa',async()=>{await assert.rejects(()=>f.panel.crearEmpresa(command({cliente_id:client,razon_social:'Duplicado',ruc:'20555555551',empresa_codigo:'OTRO'})),e=>e.status===409);await assert.rejects(()=>f.panel.crearEmpresa(command({cliente_id:client,razon_social:'Duplicado',ruc:'20666666661',empresa_codigo:'INCOMPLETA'})),e=>e.status===409);});
});
test('Fase 2: alta interrumpida y reanudación tras confirmación perdida',async t=>{
 const f=await prepare();t.after(()=>f.close());let fail=true;const calls={};
 const remote=new Proxy(f.panel,{get(target,key){if(typeof target[key]!=='function')return target[key];return async(...args)=>{calls[key]=(calls[key]||0)+1;const result=await target[key](...args);if(key==='crearAdministradorInicial'&&fail){fail=false;throw Error('FALLO DE RED SIMULADO DESPUÉS DEL COMMIT');}return result;};}});
 const local=localService(remote);t.after(()=>local.db.close());let d;
 await t.test('falla después de crear administrador; ambos sistemas siguen pendientes',async()=>{
  d=await draft(local.service,'A','20777777771');const result=await local.service.handle('POST','/api/web/empresas/'+d.id+'/completar',{password_temporal:temporary});assert.equal(result.status,502);d=result.data.empresa;assert.equal(d.estado,'PENDIENTE');assert.equal(d.sync_status,'ERROR_DE_SINCRONIZACION');assert.ok(d.steps.cliente&&d.steps.empresa&&d.steps.sucursal);assert.equal(d.steps.administrador,undefined);assert.equal((await f.panel.estado(d.empresa_web_id)).estado,'PENDIENTE');
 });
 await t.test('nuevo orquestador continúa solo el paso pendiente con el mismo comando',async()=>{
  const resumed=local.replace(remote);const result=await resumed.handle('POST','/api/web/empresas/'+d.id+'/completar',{password_temporal:temporary});assert.equal(result.status,200);d=result.data.empresa;
  assert.equal(calls.crearCliente,1);assert.equal(calls.crearEmpresa,1);assert.equal(calls.crearSucursalPrincipal,1);assert.equal(calls.crearAdministradorInicial,2);
  assert.equal((await f.query('select count(*)::int n from usuarios where empresa_id=$1',[d.empresa_web_id])).rows[0].n,1);assert.equal((await resumed.handle('POST','/api/web/empresas/'+d.id+'/activar',{})).data.empresa.estado,'ACTIVO');
 });
});