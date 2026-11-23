import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {createFixture,ids,PASSWORD} from './helpers/native-web-cost-fixture.js';

test('Checks delegan operaciones sin cambiar el rol y revocan con la misma sesion',async t=>{
 const f=await createFixture();t.after(()=>f.close());
 const user=randomUUID(),role=(await f.query("INSERT INTO roles(nombre) VALUES('Operador delegado') RETURNING id")).rows[0].id;
 await f.query('INSERT INTO usuarios(id,empresa_id,nombre,usuario,password_hash) VALUES($1,$2,$3,$4,$5)',[user,ids.empresaA,'Usuario delegado','delegated-test',await bcrypt.hash(PASSWORD,4)]);
 await f.query('INSERT INTO usuario_sucursal(usuario_id,sucursal_id,rol_id) VALUES($1,$2,$3)',[user,ids.sucursalA,role]);
 for(const module of ['productsAdmin','customers','suppliers','inventory','purchases','replenishment','transfers','usersAdmin','settings'])await f.query('INSERT INTO usuario_permisos(usuario_id,modulo,puede_ver,puede_crear,puede_editar,puede_eliminar) VALUES($1,$2,true,true,true,true)',[user,module]);
 const login=await f.request('/api/auth/login',{method:'POST',body:{empresa_codigo:'EMPRESA-A',usuario:'delegated-test',password:PASSWORD}});assert.equal(login.status,200);
 const token=login.data.token,request=(path,options={})=>f.request(path,{token,...options});
 let product,category,supplier;
 const body={sucursal_id:ids.sucursalA,codigo_interno:'DELEGATED-1',nombre:'Producto delegado',unidad_medida:'UNIDAD',stock_minimo:0,stock_maximo:0,precio:5,tipo_afectacion_igv:'10'};
 await t.test('consulta propios permisos sin depender de ver un modulo',async()=>{const r=await request('/api/auth/permissions');assert.equal(r.status,200);assert.equal(r.data.permissions.productsAdmin.crear,true);});
 await t.test('crear categoria y producto con el check activo',async()=>{
  const c=await request('/api/catalogs/categorias',{method:'POST',body:{nombre:'Categoria delegada'}});assert.equal(c.status,201,JSON.stringify(c));category=c.data.id;
  const r=await request('/api/admin/products',{method:'POST',body:{...body,categoria_id:category}});assert.equal(r.status,201,JSON.stringify(r));product=r.data.id;
 });
 await t.test('editar producto no exige Administrador o Almacen',async()=>{const r=await request('/api/admin/products/'+product,{method:'PUT',body:{...body,nombre:'Producto delegado editado',categoria_id:category}});assert.equal(r.status,200,JSON.stringify(r));});
 await t.test('crear y editar proveedores y clientes con permiso',async()=>{
  const s=await request('/api/admin/suppliers',{method:'POST',body:{razon_social:'Proveedor delegado'}});assert.equal(s.status,201,JSON.stringify(s));supplier=s.data.id;
  assert.equal((await request('/api/admin/suppliers/'+supplier,{method:'PUT',body:{razon_social:'Proveedor editado'}})).status,200);
  const c=await request('/api/admin/clients',{method:'POST',body:{tipo_doc:'DNI',nro_doc:'87654321',nombres:'Cliente delegado'}});assert.equal(c.status,201,JSON.stringify(c));
  assert.equal((await request('/api/admin/clients/'+c.data.id,{method:'PUT',body:{tipo_doc:'DNI',nro_doc:'87654321',nombres:'Cliente editado'}})).status,200);
 });
 await t.test('compras autorizadas muestran su informacion operativa',async()=>{const r=await request('/api/purchases/history?sucursal_id='+ids.sucursalA+'&from=2026-01-01&to=2026-12-31');assert.equal(r.status,200,JSON.stringify(r));});
 await t.test('importacion valida permiso antes de procesar archivo',async()=>{const r=await request('/api/import/inventory/preview',{method:'POST',body:{sucursal_id:ids.sucursalA,file_base64:'invalid'}});assert.equal(r.status,400,JSON.stringify(r));});
 await t.test('no puede escalar roles ni administrar permisos',async()=>{assert.equal((await request('/api/admin/roles')).status,403);assert.equal((await request('/api/admin/users/'+user+'/permissions',{method:'PUT',body:{permissions:{}}})).status,403);});
 await t.test('no accede a sucursales o empresas ajenas',async()=>{const r=await request('/api/admin/products',{method:'POST',body:{...body,codigo_interno:'FOREIGN',sucursal_id:ids.sucursalB}});assert.equal(r.status,403,JSON.stringify(r));});
 await t.test('revocar crear bloquea inmediatamente incluso con JWT vigente',async()=>{
  await f.query("UPDATE usuario_permisos SET puede_crear=false WHERE usuario_id=$1 AND modulo='productsAdmin'",[user]);
  assert.equal((await request('/api/catalogs/laboratorios',{method:'POST',body:{nombre:'Bloqueado'}})).status,403);
  assert.equal((await request('/api/admin/products',{method:'POST',body:{...body,codigo_interno:'DENIED'}})).status,403);
  assert.equal((await request('/api/auth/permissions')).data.permissions.productsAdmin.crear,false);
 });
 await t.test('revocar editar bloquea incluso al rol previamente autorizado',async()=>{await f.query("UPDATE usuario_permisos SET puede_editar=false WHERE usuario_id=$1 AND modulo='productsAdmin'",[user]);assert.equal((await request('/api/admin/products/'+product,{method:'PUT',body})).status,403);});
});
