import test from 'node:test';
import assert from 'node:assert/strict';
import {inventorySummary} from '../server/src/inventory-count.js';
import {createFixture,ids} from './helpers/initial-inventory-template-fixture.js';
test('Projected inventory uses positive stock and current branch unit price',async t=>{
 const f=await createFixture();t.after(()=>f.close());const db={query:f.query};
 await f.query('update lotes set cantidad_disponible=1000,costo_unitario=1 where producto_id=$1 and sucursal_id=$2',[ids.productoA,ids.sucursalA]);
 await f.query("insert into precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta) values($1,null,'UNIDAD',1,99),($1,$2,'CAJA',12,120),($1,$2,'UNIDAD',1,3)",[ids.productoA,ids.sucursalA]);
 let s=await inventorySummary(db,ids.empresaA,ids.sucursalA);assert.equal(Number(s.valor),1000);assert.equal(Number(s.valor_venta_proyectado),3000);
 await f.query('update lotes set cantidad_disponible=-5 where producto_id=$1 and sucursal_id=$2',[ids.productoA,ids.sucursalA]);
 s=await inventorySummary(db,ids.empresaA,ids.sucursalA);assert.equal(Number(s.valor_venta_proyectado),0);
 await f.query('update lotes set cantidad_disponible=10 where producto_id=$1 and sucursal_id=$2',[ids.productoA,ids.sucursalA]);
 await f.query('delete from precios_producto where producto_id=$1',[ids.productoA]);
 s=await inventorySummary(db,ids.empresaA,ids.sucursalA);assert.equal(Number(s.valor_venta_proyectado),0);
 s=await inventorySummary(db,ids.empresaB,ids.sucursalA);assert.equal(Number(s.total),0);assert.equal(Number(s.valor_venta_proyectado),0);
});