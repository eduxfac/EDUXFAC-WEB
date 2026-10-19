import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createFixture,ids,serviceToken,TEST_SERVICE,TEST_SESSION} from './helpers/isolated-web.js';
test('API interna de servicio, transacciones e idempotencia',async t=>{
 const f=await createFixture();t.after(()=>f.close());const prefix='/api/internal/admin/v1';
 const request=(route,options={})=>f.request(prefix+route,{token:serviceToken(),...options});
 await t.test('health y consulta estado funcionan con el cliente preparado del Panel',async()=>{
  assert.equal((await f.panel.health()).ok,true);assert.equal((await f.panel.estado(ids.empresaA)).estado,'ACTIVO');
 });
 await t.test('sin secreto y con ejemplos falsos la integración queda cerrada',async()=>{
  const old=process.env.PANEL_WEB_SERVICE_SECRET;delete process.env.PANEL_WEB_SERVICE_SECRET;
  try{assert.equal((await request('/health')).status,503);}finally{process.env.PANEL_WEB_SERVICE_SECRET=old;}
  process.env.NODE_ENV='production';process.env.PANEL_WEB_SERVICE_SECRET='EJEMPLO_FALSO_NO_USAR_SECRET_PANEL_WEB';
  try{assert.equal((await request('/health')).status,503);}finally{process.env.NODE_ENV='test';process.env.PANEL_WEB_SERVICE_SECRET=old;}
 });
 await t.test('JWT de cliente no accede a ningún endpoint interno',async()=>{
  for(const route of ['/health','/empresas/'+ids.empresaA+'/estado'])assert.equal((await f.request(prefix+route,{token:f.tokenA})).status,401);
  for(const action of ['suspender','reactivar'])assert.equal((await f.request(prefix+'/empresas/'+ids.empresaA+'/'+action,{token:f.tokenA,method:'POST',body:{command_id:randomUUID(),motivo:'PRUEBA'}})).status,401);
 });
 await t.test('rechaza ausencia de token, firma, issuer, audience y tipo incorrectos',async()=>{
  assert.equal((await f.request(prefix+'/health')).status,401);
  const tokens=[jwt.sign({type:'panel_service',scopes:['health:read']},TEST_SESSION,{expiresIn:'1m'}),
   jwt.sign({type:'panel_service',scopes:['health:read']},TEST_SERVICE,{issuer:'otro',audience:'web-admin-test',subject:'panel-eduxfac',jwtid:randomUUID(),expiresIn:'1m'}),
   jwt.sign({type:'panel_service',scopes:['health:read']},TEST_SERVICE,{issuer:'panel-test',audience:'otra',subject:'panel-eduxfac',jwtid:randomUUID(),expiresIn:'1m'}),serviceToken(['health:read'],{type:'web_user'})];
  for(const token of tokens)assert.equal((await f.request(prefix+'/health',{token})).status,401);
 });
 await t.test('rechaza permisos insuficientes y token vencido',async()=>{
  assert.equal((await request('/health',{token:serviceToken([])})).status,403);
  const expired=jwt.sign({type:'panel_service',scopes:['health:read'],iat:Math.floor(Date.now()/1000)-600},TEST_SERVICE,{issuer:'panel-test',audience:'web-admin-test',subject:'panel-eduxfac',jwtid:randomUUID(),expiresIn:120});
  assert.equal((await f.request(prefix+'/health',{token:expired})).status,401);
 });
 await t.test('valida UUID, command_id, motivo y campos no permitidos',async()=>{
  assert.equal((await request('/empresas/invalida/estado')).status,400);
  for(const body of [{motivo:'PRUEBA'},{command_id:randomUUID(),motivo:''},{command_id:randomUUID(),motivo:'PRUEBA',estado:'ACTIVO'}])assert.equal((await request('/empresas/'+ids.empresaA+'/suspender',{method:'POST',body})).status,400);
 });
 await t.test('suspensión es atómica, incrementa versión y conserva datos operativos',async()=>{
  const access=await f.panel.estado(ids.empresaA);const before=(await f.query('select jsonb_agg(p) data from productos p')).rows[0].data;
  const result=await f.panel.suspender(ids.empresaA,{command_id:randomUUID(),motivo:'PRUEBA AISLADA'});assert.equal(result.estado,'SUSPENDIDO');assert.equal(BigInt(result.auth_version),BigInt(access.auth_version)+1n);
  assert.deepEqual((await f.query('select jsonb_agg(p) data from productos p')).rows[0].data,before);
  assert.equal((await f.query('select count(*)::int n from acciones_admin where command_id=$1',[result.command_id])).rows[0].n,1);
 });
 await t.test('command_id se aplica una vez en reintentos y solicitudes simultáneas',async()=>{
  const body={command_id:randomUUID(),motivo:'MISMA ORDEN'};const before=await f.panel.estado(ids.empresaA);
  const results=await Promise.all([f.panel.suspender(ids.empresaA,body),f.panel.suspender(ids.empresaA,body)]);
  assert.equal(results.filter(x=>x.replayed).length,1);assert.equal(BigInt((await f.panel.estado(ids.empresaA)).auth_version),BigInt(before.auth_version)+1n);
  const replay=await f.panel.suspender(ids.empresaA,body);assert.equal(replay.replayed,true);
  assert.equal((await request('/empresas/'+ids.empresaA+'/reactivar',{method:'POST',body})).status,409);
  assert.equal((await request('/empresas/'+ids.empresaB+'/suspender',{method:'POST',body})).status,409);
 });
 await t.test('reactivar incrementa versión y no cambia B',async()=>{
  const beforeB=await f.snapshotB(),beforeA=await f.panel.estado(ids.empresaA);
  const result=await f.panel.reactivar(ids.empresaA,{command_id:randomUUID(),motivo:'PRUEBA AISLADA'});assert.equal(result.estado,'ACTIVO');assert.equal(BigInt(result.auth_version),BigInt(beforeA.auth_version)+1n);assert.deepEqual(await f.snapshotB(),beforeB);
 });
 await t.test('reactivar no activa altas pendientes, canceladas o fuera de vigencia',async()=>{
  for(const state of ['PENDIENTE','CANCELADO','VENCIDO']){
   await f.query('update empresa_acceso set estado=$2,fecha_vencimiento=$3 where empresa_id=$1',[ids.empresaA,state,state==='VENCIDO'?'2000-01-01T00:00:00Z':null]);
   const result=await request('/empresas/'+ids.empresaA+'/reactivar',{method:'POST',body:{command_id:randomUUID(),motivo:'PRUEBA'}});assert.ok(result.status>=400);
   assert.equal((await f.panel.estado(ids.empresaA)).estado,state);
  }
  await f.query("update empresa_acceso set estado='SUSPENDIDO',fecha_vencimiento=null,fecha_inicio='2999-01-01' where empresa_id=$1",[ids.empresaA]);
  assert.equal((await request('/empresas/'+ids.empresaA+'/reactivar',{method:'POST',body:{command_id:randomUUID(),motivo:'PRUEBA'}})).status,403);
  await f.query("update empresa_acceso set estado='ACTIVO',fecha_inicio=null where empresa_id=$1",[ids.empresaA]);
 });
 await t.test('empresa inactiva y usuario inactivo no permiten acceso',async()=>{
  const token=(await f.login('A')).data.token;
  await f.query('update empresas set activo=false where id=$1',[ids.empresaA]);assert.equal((await f.login('A')).status,403);assert.equal((await f.request('/api/bootstrap',{token})).status,403);
  await f.query('update empresas set activo=true where id=$1',[ids.empresaA]);await f.query('update usuarios set activo=false where id=$1',[ids.usuarioA]);assert.equal((await f.request('/api/bootstrap',{token})).status,401);await f.query('update usuarios set activo=true where id=$1',[ids.usuarioA]);
 });
 await t.test('todos los estados bloqueados y la vigencia se comprueban en sesiones abiertas',async()=>{
  const token=(await f.login('A')).data.token;
  for(const estado of ['PENDIENTE','SUSPENDIDO','VENCIDO','CANCELADO']){
   await f.query('update empresa_acceso set estado=$2 where empresa_id=$1',[ids.empresaA,estado]);
   assert.equal((await f.request('/api/bootstrap',{token})).status,403);assert.equal((await f.login('A')).status,403);
  }
  await f.query("update empresa_acceso set estado='ACTIVO',fecha_vencimiento='2000-01-01' where empresa_id=$1",[ids.empresaA]);
  assert.equal((await f.request('/api/bootstrap',{token})).data.code,'EMPRESA_VENCIDO');
  await f.query('update empresa_acceso set fecha_vencimiento=null where empresa_id=$1',[ids.empresaA]);
 });
 await t.test('reactivar exige administrador asignado a una sucursal activa',async()=>{
  await f.query("update empresa_acceso set estado='SUSPENDIDO' where empresa_id=$1",[ids.empresaA]);
  await f.query('delete from usuario_sucursal where usuario_id=$1',[ids.usuarioA]);
  assert.equal((await request('/empresas/'+ids.empresaA+'/reactivar',{method:'POST',body:{command_id:randomUUID(),motivo:'PRUEBA'}})).status,409);
  const role=(await f.query("select id from roles where nombre='Administrador'")).rows[0].id;
  await f.query('insert into usuario_sucursal(usuario_id,sucursal_id,rol_id) values($1,$2,$3)',[ids.usuarioA,ids.sucursalA,role]);
  await f.panel.reactivar(ids.empresaA,{command_id:randomUUID(),motivo:'PRUEBA'});
 });
 await t.test('fallo al auditar revierte estado y auth_version',async()=>{
  const before=await f.panel.estado(ids.empresaA);
  await f.query(`create function test_reject_audit() returns trigger language plpgsql as $$ begin raise exception 'PRUEBA_ROLLBACK'; end $$;
create trigger test_audit_failure before insert on acciones_admin for each row execute function test_reject_audit();`);
  try{assert.equal((await request('/empresas/'+ids.empresaA+'/suspender',{method:'POST',body:{command_id:randomUUID(),motivo:'PRUEBA'}})).status,500);const after=await f.panel.estado(ids.empresaA);assert.equal(after.estado,before.estado);assert.equal(after.auth_version,before.auth_version);}finally{await f.query('drop trigger test_audit_failure on acciones_admin');}
 });
 await t.test('sin migración no hay acceso ni health administrativo listo',async()=>{
  const token=(await f.login('A')).data.token;
  await f.query('alter table empresa_acceso rename to test_acceso_temporal');
  try{assert.equal((await f.request('/api/bootstrap',{token})).status,503);assert.equal((await request('/health')).status,503);assert.equal((await f.login('A')).status,503);}finally{await f.query('alter table test_acceso_temporal rename to empresa_acceso');}
 });
 await t.test('no permite reutilizar SESSION_SECRET para el servicio',async()=>{
  const old=process.env.PANEL_WEB_SERVICE_SECRET;process.env.PANEL_WEB_SERVICE_SECRET=TEST_SESSION;
  try{assert.equal((await request('/health')).status,503);}finally{process.env.PANEL_WEB_SERVICE_SECRET=old;}
 });
 await t.test('migración versionada puede repetirse sin reactivar ni cambiar datos',async()=>{
  await f.db.exec(await readFile(new URL('../database/migrations/001_empresa_acceso.sql',import.meta.url),'utf8'));
  assert.equal((await f.query("select count(*)::int n from web_schema_migrations where version='001_empresa_acceso'")).rows[0].n,1);
 });
});