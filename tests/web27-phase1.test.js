import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {createFixture,ids,PASSWORD} from './helpers/initial-inventory-template-fixture.js';
import {redactFinancial,financialAccess,sanitizeFinancialExport} from '../server/src/financial-access.js';
test('F17/F23/F37/F54: autorización HTTP y SQL aislada',async t=>{
 const f=await createFixture();t.after(()=>f.close());
 const cashier=randomUUID(),role=(await f.query("select id from roles where nombre='Cajero / Vendedor'")).rows[0].id;
 await f.query('insert into usuarios(id,empresa_id,nombre,usuario,password_hash) values($1,$2,$3,$4,$5)',[cashier,ids.empresaA,'Cajero ficticio','cashier27',await bcrypt.hash(PASSWORD,4)]);
 await f.query('insert into usuario_sucursal(usuario_id,sucursal_id,rol_id) values($1,$2,$3)',[cashier,ids.sucursalA,role]);
 for(const m of ['sales','cash','reports','inventory','productsAdmin','suppliers'])await f.query('insert into usuario_permisos(usuario_id,modulo,puede_ver,puede_crear,puede_editar) values($1,$2,true,true,true)',[cashier,m]);
 const token=(await f.request('/api/auth/login',{method:'POST',body:{empresa_codigo:'EMPRESA-A',usuario:'cashier27',password:PASSWORD}})).data.token;assert.ok(token);
 const own=(route,options={})=>f.request(route,{token,...options}),admin=(route,options={})=>f.request(route,{token:f.tokenA,...options});
 const box=(await admin('/api/cash/open',{method:'POST',body:{sucursal_id:ids.sucursalA,monto_apertura:10}})).data;
 await t.test('cajero no cierra caja de otro y no toca su saldo',async()=>{const r=await own('/api/cash/close',{method:'POST',body:{sesion_caja_id:box.id,efectivo_contado:10}});assert.equal(r.status,403,JSON.stringify(r));assert.equal((await f.query('select estado from sesiones_caja where id=$1',[box.id])).rows[0].estado,'ABIERTA');});
 await t.test('permiso granular de crear permite código y proveedor para cajero autorizado',async()=>{assert.equal((await own('/api/admin/products/next-code')).status,200);assert.equal((await own('/api/admin/suppliers',{method:'POST',body:{razon_social:'Proveedor ficticio 27'}})).status,201);});
 await t.test('no filtra costos en productos/inventario y bloquea exportador genérico',async()=>{const r=await own('/api/products?sucursal_id='+ids.sucursalA);assert.equal(r.status,200);assert.ok(!/costo|utilidad|margen|costo_snapshot/.test(JSON.stringify(r.data)));assert.equal((await own('/api/export/xlsx',{method:'POST',body:{headers:['Costo'],rows:[[1]]}})).status,403);});
 await t.test('sucursal y empresa ajenas siguen bloqueadas',async()=>{assert.equal((await own('/api/products?sucursal_id='+ids.sucursalA2)).status,403);assert.equal((await own('/api/products?sucursal_id='+ids.sucursalB)).status,403);});
 await t.test('administrador autorizado cierra caja ajena con trazabilidad',async()=>{const c=(await own('/api/cash/open',{method:'POST',body:{sucursal_id:ids.sucursalA,monto_apertura:0}})).data;const r=await admin('/api/cash/close',{method:'POST',body:{sesion_caja_id:c.id,efectivo_contado:0}});assert.equal(r.status,200,JSON.stringify(r));const a=(await f.query("select detalle from auditoria where entidad_id=$1 and accion='CERRAR_CAJA'",[c.id])).rows[0].detalle;assert.equal(a.cerrado_por,ids.usuarioA);assert.equal(a.cierre_ajeno,true);});
});
test('reducción financiera es recursiva y respeta campos fiscales',()=>{assert.deepEqual(redactFinancial({total:10,igv:1.53,items:[{costo_snapshot:5,utilidad:2,precio_unitario:10}]}),{total:10,igv:1.53,items:[{precio_unitario:10}]});});
test('rol financiero de otra sucursal no concede permiso en la consultada',async()=>{const calls=[];const a=await financialAccess({query:async(sql,args)=>{calls.push(args);return {rows:[{rol:'Cajero / Vendedor'}]};}},{sub:'user',empresa_id:'tenant'},'branch');assert.equal(a.cost,false);assert.equal(a.profit,false);assert.equal(calls[0][2],'branch');});

test('F54 conserva fechas PostgreSQL serializables',()=>{const date=new Date('2026-11-15T15:00:00Z');const result=redactFinancial({created_at:date,costo:5});assert.equal(JSON.stringify(result),JSON.stringify({created_at:date}));});

test('F54 exportador conserva columnas operativas y retira costo/margen según perfil',()=>{const body={headers:['Producto','Costo','Total','Utilidad'],rows:[['P',2,5,3]],kpis:[{label:'Utilidad',value:3},{label:'Ventas',value:5}]};const restricted=sanitizeFinancialExport(body,{cost:false,profit:false});assert.deepEqual(restricted.headers,['Producto','Total']);assert.deepEqual(restricted.rows,[['P',5]]);assert.deepEqual(restricted.kpis,[{label:'Ventas',value:5}]);const warehouse=sanitizeFinancialExport(body,{cost:true,profit:false});assert.deepEqual(warehouse.headers,['Producto','Costo','Total']);assert.deepEqual(warehouse.rows,[['P',2,5]]);});
