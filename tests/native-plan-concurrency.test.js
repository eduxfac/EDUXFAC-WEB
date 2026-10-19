import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createNativePlanFixture} from './helpers/native-plan-fixture.js';
test('Fase 4 concurrencia PostgreSQL nativo: conexiones independientes en cluster aislado D:',async t=>{
 process.env.NODE_ENV='test';const f=await createNativePlanFixture();t.after(()=>f.close());
 const command=async(code,branches,users,multi=false)=>{
  const u=await f.panel.uso(f.company);
  return f.panel.asignarPlan(f.company,{command_id:randomUUID(),motivo:'Prueba nativa',administrador:'owner_test',plan_codigo:code,limite_sucursales:branches,limite_usuarios:users,multisucursal:multi,version_condiciones:(BigInt(u.version_condiciones)+1n).toString()});
 };
 await command('BASICO',1,3);
 await f.query("insert into usuarios(empresa_id,nombre,usuario,password_hash) values($1,'Segundo','segundo','FAKE_UNUSED_HASH')",[f.company]);
 await t.test('dos solicitudes HTTP simultáneas con un cupo crean un solo usuario',async()=>{
  const results=await Promise.all(['tercero_a','tercero_b'].map(usuario=>f.request('/api/admin/users',{token:f.token,method:'POST',body:{nombre:usuario,usuario,password:'FAKE_NATIVE_PASSWORD_123',asignaciones:[{sucursal_id:f.branch,rol_id:f.role}]}})));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);assert.ok(results.some(r=>r.data.error==='Has alcanzado el límite de usuarios permitido por tu plan.'));
  assert.equal((await f.panel.uso(f.company)).usuarios_activos,3);
  assert.ok((await f.query("select count(*)::int n from eventos_comerciales where accion='CUOTA_USUARIOS'")).rows[0].n>=1);
 });
 await t.test('dos solicitudes HTTP simultáneas con un cupo crean una sola sucursal',async()=>{
  const u=await f.panel.uso(f.company);await f.panel.ajustarLimites(f.company,{command_id:randomUUID(),motivo:'Dos sucursales prueba',administrador:'owner_test',limite_sucursales:2,limite_usuarios:3,multisucursal:false,version_condiciones:(BigInt(u.version_condiciones)+1n).toString()});
  const results=await Promise.all(['SEGUNDA_A','SEGUNDA_B'].map(codigo=>f.request('/api/admin/branches',{token:f.token,method:'POST',body:{codigo,nombre:codigo}})));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,400]);assert.ok(results.some(r=>r.data.error==='Has alcanzado el límite de sucursales permitido por tu plan.'));
  assert.equal((await f.panel.uso(f.company)).sucursales_activas,2);
 });
 await t.test('REPEATABLE READ no admite dos altas con snapshot anterior',async()=>{
  const usage=await f.panel.uso(f.company);await f.panel.ajustarLimites(f.company,{command_id:randomUUID(),motivo:'Un cupo más para concurrencia',administrador:'owner_test',limite_sucursales:2,limite_usuarios:4,multisucursal:false,version_condiciones:(BigInt(usage.version_condiciones)+1n).toString()});
  const a=await f.connect(),b=await f.connect();
  try{
   await a.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
   await a.query('select count(*) from usuarios');await b.query('select count(*) from usuarios');
   await a.query("insert into usuarios(empresa_id,nombre,usuario,password_hash) values($1,'RR A','rr_a','FAKE_UNUSED_HASH')",[f.company]);
   const waiting=b.query("insert into usuarios(empresa_id,nombre,usuario,password_hash) values($1,'RR B','rr_b','FAKE_UNUSED_HASH')",[f.company]).then(()=>({ok:true}),e=>({code:e.code}));
   await a.query('COMMIT');const r=await waiting;assert.equal(r.code,'40001');await b.query('ROLLBACK');assert.equal((await f.panel.uso(f.company)).usuarios_activos,4);
  }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();}
 });
});
