import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {createFixture,ids} from './helpers/initial-inventory-template-fixture.js';

const OLD_PASSWORD='FAKE_OLD_USER_PASSWORD_123';
const NEW_PASSWORD='FAKE_NEW_USER_PASSWORD_456';

test('editar usuario cambia la contraseña solo cuando se envía una nueva',async t=>{
 const f=await createFixture();t.after(()=>f.close());
 const role=(await f.query("select id from roles where nombre='Cajero / Vendedor'")).rows[0].id;
 const created=await f.request('/api/admin/users',{method:'POST',token:f.tokenA,body:{nombre:'VENDEDOR PRUEBA',usuario:'vendedor_prueba',email:'vendedor@example.test',password:OLD_PASSWORD,asignaciones:[{sucursal_id:ids.sucursalA,rol_id:role}]}});
 assert.equal(created.status,201,JSON.stringify(created.data));
 const userId=created.data.id;
 const before=(await f.query('select nombre,usuario,email,password_hash,activo,empresa_id from usuarios where id=$1',[userId])).rows[0];

 const unchanged=await f.request('/api/admin/users/'+userId,{method:'PUT',token:f.tokenA,body:{nombre:before.nombre,usuario:before.usuario,email:before.email,password:null,activo:before.activo,asignaciones:[{sucursal_id:ids.sucursalA,rol_id:role}]}});
 assert.equal(unchanged.status,200,JSON.stringify(unchanged.data));
 const afterEmpty=(await f.query('select nombre,usuario,email,password_hash,activo,empresa_id from usuarios where id=$1',[userId])).rows[0];
 assert.equal(afterEmpty.password_hash,before.password_hash);
 assert.deepEqual({...afterEmpty,password_hash:undefined},{...before,password_hash:undefined});

 const changed=await f.request('/api/admin/users/'+userId,{method:'PUT',token:f.tokenA,body:{nombre:before.nombre,usuario:before.usuario,email:before.email,password:NEW_PASSWORD,activo:before.activo,asignaciones:[{sucursal_id:ids.sucursalA,rol_id:role}]}});
 assert.equal(changed.status,200,JSON.stringify(changed.data));
 const after=(await f.query('select nombre,usuario,email,password_hash,activo,empresa_id from usuarios where id=$1',[userId])).rows[0];
 assert.notEqual(after.password_hash,NEW_PASSWORD);
 assert.notEqual(after.password_hash,before.password_hash);
 assert.equal(await bcrypt.compare(NEW_PASSWORD,after.password_hash),true);
 assert.deepEqual({...after,password_hash:undefined},{...before,password_hash:undefined});
 assert.equal((await f.request('/api/auth/login',{method:'POST',body:{empresa_codigo:'EMPRESA-A',usuario:before.usuario,password:OLD_PASSWORD}})).status,401);
 assert.equal((await f.request('/api/auth/login',{method:'POST',body:{empresa_codigo:'EMPRESA-A',usuario:before.usuario,password:NEW_PASSWORD}})).status,200);
});
