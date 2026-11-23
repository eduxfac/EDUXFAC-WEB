import test from 'node:test';import assert from 'node:assert/strict';
import {createFixture,ids} from './helpers/initial-inventory-template-fixture.js';
test('Light sale detail preserves amounts and permissions without printing payload',async t=>{
 const f=await createFixture();t.after(()=>f.close());
 await f.query('update empresas set logo_data=$1 where id=$2',['data:image/png;base64,'+'A'.repeat(2100000),ids.empresaA]);
 const sale=(await f.query('insert into ventas(empresa_id,sucursal_id,usuario_id,subtotal,total) values($1,$2,$3,10,10) returning id',[ids.empresaA,ids.sucursalA,ids.usuarioA])).rows[0].id;
 await f.query('insert into venta_detalles(venta_id,producto_id,cantidad,precio_unitario,costo_snapshot,total) values($1,$2,2,5,1,10)',[sale,ids.productoA]);
 await f.query("insert into venta_pagos(venta_id,metodo,monto) values($1,'Efectivo',10)",[sale]);
 const light=await f.request('/api/sales/'+sale+'/receipt?view=detail',{token:f.tokenA});assert.equal(light.status,200,JSON.stringify(light.data));
 const full=await f.request('/api/sales/'+sale+'/receipt',{token:f.tokenA});assert.equal(full.status,200);
 const printable=await f.request('/api/sales/'+sale+'/receipt?view=print',{token:f.tokenA});assert.equal(printable.status,200);assert.equal(printable.data.venta.logo_data,null);assert.ok(printable.data.venta.logo_revision);assert.deepEqual(printable.data.items,full.data.items);assert.equal(printable.data.venta.documentos_config!=null,true);assert.ok(JSON.stringify(printable.data).length<JSON.stringify(full.data).length*.01);
 const logo=await fetch(f.base+'/api/sales/'+sale+'/receipt?view=logo',{headers:{Authorization:'Bearer '+f.tokenA}});assert.equal(logo.status,200);assert.equal(logo.headers.get('content-type'),'image/png');assert.ok((await logo.arrayBuffer()).byteLength>1000000);
 assert.equal((await f.request('/api/sales/'+sale+'/receipt?view=logo')).status,401);assert.ok([403,404].includes((await f.request('/api/sales/'+sale+'/receipt?view=logo',{token:f.tokenB})).status));
 assert.equal('logo_data' in light.data.venta,false);assert.equal('documentos_config' in light.data.venta,false);assert.ok(full.data.venta.logo_data.length>2000000);
 assert.deepEqual(light.data.items,full.data.items);assert.deepEqual(light.data.pagos,full.data.pagos);assert.equal(light.data.venta.total,full.data.venta.total);assert.equal(Number(light.data.items[0].cantidad_devolvible),2);
 assert.ok(JSON.stringify(light.data).length<JSON.stringify(full.data).length*.01);
 assert.equal((await f.request('/api/sales/'+sale+'/receipt?view=detail')).status,401);
 assert.ok([403,404].includes((await f.request('/api/sales/'+sale+'/receipt?view=detail',{token:f.tokenB})).status));
});