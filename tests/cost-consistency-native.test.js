import {INITIAL_COLUMNS} from '../server/src/initial-inventory.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import ExcelJS from 'exceljs';
import {createFixture,ids} from './helpers/native-web-cost-fixture.js';
import {applyPositiveStockEntry} from '../server/src/inventory-entry.js';

test('Consistencia de costos: PostgreSQL nativo, API y conservación de historia',
 {skip:process.platform!=='linux'||process.env.EDUXFAC_PROFIT_NATIVE!=='yes'},async t=>{
 const f=await createFixture();t.after(()=>f.close());let seq=0;
 const supplier=(await f.request('/api/admin/suppliers',{token:f.tokenA,method:'POST',body:{razon_social:'Proveedor ficticio costos',ruc:'20912345001'}})).data;
 const cash=(await f.request('/api/cash/open',{token:f.tokenA,method:'POST',body:{sucursal_id:ids.sucursalA,monto_apertura:10000}})).data;
 const request=(route,body)=>f.request(route,{token:f.tokenA,method:'POST',body});
 async function product(){
  const p={id:randomUUID(),name:'Costo ficticio '+(++seq)};
  await f.query("INSERT INTO productos(id,empresa_id,codigo_interno,nombre,unidad_medida) VALUES($1,$2,$3,$4,'UNIDAD')",[p.id,ids.empresaA,'COST-'+seq,p.name]);
  await f.query("INSERT INTO producto_sucursal(producto_id,sucursal_id,origen) VALUES($1,$2,'operacion')",[p.id,ids.sucursalA]);
  return p;
 }
 async function buy(p,quantity,cost,batch='REAL-'+seq){
  const r=await request('/api/purchases',{sucursal_id:ids.sucursalA,proveedor_id:supplier.id,tipo_documento:'FACTURA',serie:'F01',numero:'FICTICIO-'+(++seq),fecha:'2026-10-13',tipo_compra:'Mercadería',moneda:'PEN',items:[{producto_id:p.id,cantidad:quantity,costo_unitario:cost,numero_lote:batch}]});
  assert.equal(r.status,201,JSON.stringify(r.data));return r.data;
 }
 async function sell(p,quantity,{factor=1,kind='UNIDAD',price=20}={}){
  const r=await request('/api/sales',{sucursal_id:ids.sucursalA,sesion_caja_id:cash.id,items:[{producto_id:p.id,cantidad:quantity,factor_unidades:factor,tipo_venta:kind,precio_unitario:price}],pagos:[{metodo:'Efectivo',monto:quantity*price}]});
  assert.equal(r.status,201,JSON.stringify(r.data));return r.data;
 }
 async function returned(sale,quantity=null){
  const detail=(await f.query('SELECT id FROM venta_detalles WHERE venta_id=$1 ORDER BY id',[sale.id])).rows[0];
  const r=await request('/api/sales/'+sale.id+'/return',{tipo:quantity===null?'TOTAL':'PARCIAL',motivo:'Ensayo ficticio de costos',metodo_reembolso:'Efectivo',sesion_caja_id:cash.id,...(quantity===null?{}:{items:[{venta_detalle_id:detail.id,cantidad:quantity}]})});
  assert.equal(r.status,201,JSON.stringify(r.data));return r.data;
 }
 async function balance(p){
  const q=(await f.query('SELECT coalesce(sum(cantidad_disponible),0)::numeric stock,coalesce(sum(cantidad_disponible*costo_unitario),0)::numeric value FROM lotes WHERE producto_id=$1 AND sucursal_id=$2',[p.id,ids.sucursalA])).rows[0];
  return {stock:Number(q.stock),value:Number(q.value)};
 }
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,JSON.stringify({a,b}));
 async function unchangedHistory(p){
  return (await f.query('SELECT json_build_object(\'purchases\',(SELECT jsonb_agg(cd ORDER BY cd.id) FROM compra_detalles cd WHERE producto_id=$1),\'sales\',(SELECT jsonb_agg(vd ORDER BY vd.id) FROM venta_detalles vd WHERE producto_id=$1)) data',[p.id])).rows[0].data;
 }
 async function snapshot(p){
  return (await f.query('SELECT costo_snapshot,factor_unidades,cantidad_base FROM venta_detalles WHERE producto_id=$1 ORDER BY id',[p.id])).rows;
 }
 await t.test('venta normal persiste costo y devolución restaura valor',async()=>{
  const p=await product();await buy(p,10,1.57);const s=await sell(p,2);
  near(Number((await snapshot(p))[0].costo_snapshot),1.57);near((await balance(p)).value,8*1.57);
  const old=await unchangedHistory(p);await returned(s);assert.deepEqual(await unchangedHistory(p),old);
  near((await balance(p)).value,15.7);assert.equal((await balance(p)).stock,10);
 });
 for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
  await t.test('caso APRONAX ficticio: anulaciones '+order.join('-'),async()=>{
   const p=await product();await buy(p,120,1.57,'DFDF-FICTICIO');
   await f.query("INSERT INTO precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta) VALUES($1,$2,'CAJA',120,200)",[p.id,ids.sucursalA]);
   const sales=[];for(let i=0;i<3;i++)sales.push(await sell(p,1,{factor:120,kind:'CAJA',price:200}));
   assert.equal((await balance(p)).stock,-240);
   for(const row of await snapshot(p))near(Number(row.costo_snapshot),188.4);
   const old=await unchangedHistory(p);
   for(const index of order)await returned(sales[index]);
   assert.deepEqual(await unchangedHistory(p),old);assert.equal((await balance(p)).stock,120);near((await balance(p)).value,188.4);
   const positive=(await f.query('SELECT * FROM lotes WHERE producto_id=$1 AND cantidad_disponible>0',[p.id])).rows;
   assert.ok(positive.every(l=>Number(l.costo_unitario)>0));
   const nulls=(await f.query('SELECT numero_lote,fecha_vencimiento FROM lotes WHERE producto_id=$1 AND compra_detalle_id IS NULL',[p.id])).rows;
   assert.ok(nulls.every(l=>l.numero_lote===null&&l.fecha_vencimiento===null));
  });
 }
 await t.test('varios lotes y saldo cero conservan valor en distinto orden',async()=>{
  const p=await product();await buy(p,6,2,'MIX-A');await buy(p,6,4,'MIX-B');
  const normal=await sell(p,12),over=await sell(p,12);
  await returned(normal);assert.equal((await balance(p)).stock,0);
  await returned(over);assert.equal((await balance(p)).stock,12);near((await balance(p)).value,36);
 });
 await t.test('margen cero en costo ponderado periódico también bloquea',async()=>{
  const p=await product();await buy(p,1,1,'PERIODIC');await buy(p,2,1.5,'PERIODIC');
  await f.query("INSERT INTO precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta) VALUES($1,$2,'CAJA',3,4)",[p.id,ids.sucursalA]);
  const before=await balance(p);
  const r=await request('/api/sales',{sucursal_id:ids.sucursalA,sesion_caja_id:cash.id,items:[{producto_id:p.id,cantidad:1,factor_unidades:3,tipo_venta:'CAJA',precio_unitario:4}],pagos:[{metodo:'Efectivo',monto:4}]});
  assert.equal(r.status,422,JSON.stringify(r.data));assert.deepEqual(await balance(p),before);
 });
 await t.test('venta sin stock recupera y persiste costo desde compra',async()=>{
  const p=await product();await buy(p,1,2);await sell(p,1);const over=await sell(p,3);
  const rows=(await f.query('SELECT costo_snapshot FROM venta_detalles WHERE venta_id=$1',[over.id])).rows;
  assert.equal(Number(rows[0].costo_snapshot),2);
  const mi=(await f.query("SELECT costo_unitario FROM movimientos_inventario WHERE referencia_tipo='VENTA' AND referencia_id=$1",[over.id])).rows;
  assert.ok(mi.every(x=>Number(x.costo_unitario)===2));
 });
 await t.test('sobreventa parcial conserva costo por cada origen consumido',async()=>{
  const p=await product();await buy(p,2,3);const s=await sell(p,5);
  assert.equal((await balance(p)).stock,-3);assert.ok((await snapshot(p)).every(x=>Number(x.costo_snapshot)===3));
  await returned(s);assert.equal((await balance(p)).stock,2);near((await balance(p)).value,6);
 });
 await t.test('deuda, compensación parcial y compra total conserva cantidades y costo',async()=>{
  const p=await product();await buy(p,1,2);await sell(p,1);const over=await sell(p,10);
  await buy(p,4,2,'PARTIAL-IN');assert.equal((await balance(p)).stock,-6);
  await buy(p,6,2,'TOTAL-IN');assert.equal((await balance(p)).stock,0);
  const debt=(await f.query('SELECT costo_unitario FROM lotes WHERE producto_id=$1 AND numero_lote IS NULL',[p.id])).rows[0];
  assert.equal(Number(debt.costo_unitario),2);await returned(over);
  assert.equal((await balance(p)).stock,10);near((await balance(p)).value,20);
 });
 await t.test('devolución parcial sin lote restaura costo snapshot',async()=>{
  const p=await product();await buy(p,1,2);await sell(p,1);const over=await sell(p,4);
  await returned(over,2);assert.equal((await balance(p)).stock,-2);
  await returned(over);assert.equal((await balance(p)).stock,0);
  const rows=(await f.query('SELECT costo_unitario FROM movimientos_inventario WHERE producto_id=$1 AND tipo=$2',[p.id,'DEVOLUCION_VENTA'])).rows;
  assert.ok(rows.every(x=>Number(x.costo_unitario)===2));
 });
 await t.test('equivalencia fraccionaria no redondea el costo snapshot a cuatro decimales',async()=>{
  const p=await product();await buy(p,5,1.2345);
  await f.query("INSERT INTO precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta) VALUES($1,$2,'BLISTER',1.333,3)",[p.id,ids.sucursalA]);
  const s=await sell(p,1,{kind:'BLISTER',factor:1.333,price:3});
  const row=(await f.query('SELECT costo_snapshot FROM venta_detalles WHERE venta_id=$1',[s.id])).rows[0];
  near(Number(row.costo_snapshot),1.2345*1.333);await returned(s);near((await balance(p)).value,5*1.2345);
 });
 await t.test('caja sobrevendida y devolución parcial proporcional',async()=>{
  const p=await product();await buy(p,6,1.57);
  await f.query("INSERT INTO precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta) VALUES($1,$2,'CAJA',12,25)",[p.id,ids.sucursalA]);
  const s=await sell(p,1,{kind:'CAJA',factor:12,price:25});
  await returned(s,0.25);await returned(s);assert.equal((await balance(p)).stock,6);near((await balance(p)).value,9.42);
 });
 await t.test('mismo lote, compras con costo distinto: promedio del saldo e historia intacta',async()=>{
  const p=await product();await buy(p,10,1,'SAME');const old=await unchangedHistory(p);await buy(p,10,3,'SAME');
  assert.equal((await balance(p)).stock,20);near((await balance(p)).value,40);
  const first=(await f.query('SELECT costo_unitario FROM compra_detalles WHERE producto_id=$1 ORDER BY costo_unitario',[p.id])).rows[0];
  assert.equal(Number(first.costo_unitario),1);
  const s=await sell(p,1);near(Number((await snapshot(p))[0].costo_snapshot),2);await returned(s);near((await balance(p)).value,40);
 });
 await t.test('ajuste sin costo no inventa costo ni permite venta con costo desconocido',async()=>{
  const p=await product();const r=await request('/api/inventory/set-stock',{sucursal_id:ids.sucursalA,producto_id:p.id,stock_objetivo:5,motivo:'Ajuste ficticio sin origen'});
  // Endpoint name is resolved below if route differs; failures cannot be hidden.
  assert.equal(r.status,201,JSON.stringify(r.data));
  const bad=await request('/api/sales',{sucursal_id:ids.sucursalA,sesion_caja_id:cash.id,items:[{producto_id:p.id,cantidad:1,precio_unitario:20}],pagos:[{metodo:'Efectivo',monto:20}]});
  assert.equal(bad.status,422);assert.equal(bad.data.code,'VENTA_COSTO_NO_VERIFICABLE');
 });
 await t.test('importación inicial sin costo se rechaza sin crear stock ni producto',async()=>{
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Inventario inicial');ws.addRow(INITIAL_COLUMNS.map(x=>x[1]));const row={codigo_interno:'NO-COST',nombre:'Ficticio importado costo ausente',unidad_medida:'UNIDAD',stock:5,stock_minimo:0,precio:20,costo:''};ws.addRow(INITIAL_COLUMNS.map(x=>row[x[0]]??null));
  const file_base64=Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');const preview=await request('/api/import/inventory/preview',{sucursal_id:ids.sucursalA,file_base64});assert.equal(preview.status,200);assert.equal(preview.data.errores,1);
  const r=await request('/api/import/inventory/commit',{sucursal_id:ids.sucursalA,file_base64,preview_sha256:preview.data.sha256});assert.equal(r.status,400);assert.equal((await f.query("SELECT id FROM productos WHERE codigo_interno='NO-COST' AND empresa_id=$1",[ids.empresaA])).rows.length,0);
 });
 await t.test('entradas concurrentes independientes conservan costo ponderado',async()=>{
  const p=await product();await buy(p,1,1,'CONCURRENT');await sell(p,1);
  const lot=(await f.query('SELECT id FROM lotes WHERE producto_id=$1',[p.id])).rows[0];
  const port=Number((await f.query('SHOW port')).rows[0].port);
  const pool=new pg.Pool({host:'127.0.0.1',port,user:'eduxfac_profit_fixture',database:'postgres',max:2});
  try{
   await Promise.all([2,4].map(async cost=>{const c=await pool.connect();try{await c.query('BEGIN');await applyPositiveStockEntry(c,{empresaId:ids.empresaA,sucursalId:ids.sucursalA,productoId:p.id,loteId:lot.id,cantidad:5,costoUnitario:cost,tipo:'AJUSTE',referenciaTipo:'ENSAYO_FICTICIO',usuarioId:ids.usuarioA});await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}));
  }finally{await pool.end();}
  assert.equal((await balance(p)).stock,10);near((await balance(p)).value,30);
 });
 await t.test('reintento de anulación no duplica stock ni cambia costo',async()=>{
  const p=await product();await buy(p,10,1.57);const s=await sell(p,10);await returned(s);
  const before=await balance(p);const r=await request('/api/sales/'+s.id+'/return',{tipo:'TOTAL',motivo:'Reintento ficticio',metodo_reembolso:'Efectivo',sesion_caja_id:cash.id});
  assert.equal(r.status,400);assert.deepEqual(await balance(p),before);
 });

 await t.test('reparación ensayada sobre réplica exacta legacy: dry-run, aplicación y no repetición',async()=>{
  const p=await product();await buy(p,120,1.57,'DFDF');
  const sales=[];for(let i=0;i<3;i++)sales.push(await sell(p,120,{price:2}));
  const lots=(await f.query('SELECT id,numero_lote FROM lotes WHERE producto_id=$1',[p.id])).rows;
  const real=lots.find(l=>l.numero_lote==='DFDF').id,unassigned=lots.find(l=>l.numero_lote===null).id;
  const port=Number((await f.query('SHOW port')).rows[0].port),c=new pg.Client({host:'127.0.0.1',port,user:'eduxfac_profit_fixture',database:'postgres'});
  await c.connect();
  const {applyPositiveStockEntry:legacy}=await import('../docs/costos_consistentes_candidato_original/server/src/inventory-entry.js');
  const {repairApronax}=await import('../operations/repair-costs/repair-apronax.mjs');
  try{
   await c.query('BEGIN');
   await c.query('UPDATE venta_detalles SET costo_snapshot=0 WHERE venta_id=ANY($1::uuid[])',[[sales[1].id,sales[2].id]]);
   await c.query("UPDATE movimientos_inventario SET costo_unitario=0 WHERE referencia_tipo='VENTA' AND referencia_id=ANY($1::uuid[])",[[sales[1].id,sales[2].id]]);
   await c.query('UPDATE lotes SET costo_unitario=0 WHERE id=$1',[unassigned]);
   for(const index of [2,0,1]){
    const s=sales[index],lot=index===0?real:unassigned,cost=index===0?1.57:0;
    const dv=(await c.query("INSERT INTO devoluciones_venta(venta_id,empresa_id,sucursal_id,tipo,motivo,metodo_reembolso,monto,usuario_id) VALUES($1,$2,$3,'TOTAL','Réplica histórica ficticia','Efectivo',240,$4) RETURNING id",[s.id,ids.empresaA,ids.sucursalA,ids.usuarioA])).rows[0];
    const detail=(await c.query('SELECT id FROM venta_detalles WHERE venta_id=$1',[s.id])).rows[0];
    await c.query('INSERT INTO devolucion_venta_detalles(devolucion_id,venta_detalle_id,cantidad,monto,cantidad_base) VALUES($1,$2,120,240,120)',[dv.id,detail.id]);
    await legacy(c,{empresaId:ids.empresaA,sucursalId:ids.sucursalA,productoId:p.id,loteId:lot,cantidad:120,costoUnitario:cost,tipo:'DEVOLUCION_VENTA',referenciaTipo:'DEVOLUCION',referenciaId:dv.id,usuarioId:ids.usuarioA});
    await c.query("UPDATE ventas SET estado='ANULADA' WHERE id=$1",[s.id]);
   }
   await c.query('COMMIT');
   assert.deepEqual(await balance(p),{stock:120,value:0});
   const plan={laboratory:true,empresaId:ids.empresaA,sucursalId:ids.sucursalA,productoId:p.id,saldoSinLoteId:unassigned,loteRealId:real,usuarioId:ids.usuarioA};
   const history=await unchangedHistory(p),beforeMovements=(await f.query('SELECT count(*)::int n FROM movimientos_inventario WHERE producto_id=$1',[p.id])).rows[0].n;
   const dry=await repairApronax(c,plan);assert.equal(dry.dry_run,true);
   assert.deepEqual(await balance(p),{stock:120,value:0});assert.deepEqual(await unchangedHistory(p),history);
   await assert.rejects(()=>repairApronax(c,plan,{apply:true}),/BACKUP_AND_PHYSICAL/);
   const result=await repairApronax(c,plan,{apply:true,backupVerified:true,physicalLotConfirmed:true});
   assert.equal(result.applied,true);assert.deepEqual(await balance(p),{stock:120,value:188.4});
   assert.deepEqual(await unchangedHistory(p),history);
   const after=(await f.query('SELECT count(*)::int n FROM movimientos_inventario WHERE producto_id=$1',[p.id])).rows[0].n;
   assert.equal(after-beforeMovements,2);
   await assert.rejects(()=>repairApronax(c,plan,{apply:true,backupVerified:true,physicalLotConfirmed:true}),/REPAIR_BASELINE_CHANGED/);
   const balances=(await f.query('SELECT l.id,l.cantidad_disponible,coalesce(sum(mi.cantidad),0) qty,coalesce(sum(mi.cantidad*mi.costo_unitario),0) val FROM lotes l LEFT JOIN movimientos_inventario mi ON mi.lote_id=l.id WHERE l.producto_id=$1 GROUP BY l.id',[p.id])).rows;
   for(const b of balances){assert.equal(Number(b.cantidad_disponible),Number(b.qty));assert.equal(Number(b.val),b.id===real?188.4:0);}
  }finally{await c.end();}
 });

 for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
  await t.test('costos distintos y tres anulaciones '+order.join('-'),async()=>{
   const p=await product();await buy(p,6,2,'WEIGHT-A');await buy(p,6,4,'WEIGHT-B');
   const sales=[];for(let i=0;i<3;i++)sales.push(await sell(p,12));
   for(const index of order)await returned(sales[index]);
   assert.equal((await balance(p)).stock,12);near((await balance(p)).value,36);
  });
 }
 await t.test('importación inicial sobre lote existente se rechaza y conserva costos/historia',async()=>{
  const p=await product();await buy(p,10,1,'IMPORT-SAME');const history=await unchangedHistory(p),before=await balance(p);const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Inventario inicial');ws.addRow(INITIAL_COLUMNS.map(x=>x[1]));const row={codigo_interno:'COST-'+(seq-1),nombre:p.name,unidad_medida:'UNIDAD',stock:10,stock_minimo:0,costo:3,precio:20,lote:'IMPORT-SAME'};row.codigo_interno=(await f.query('select codigo_interno from productos where id=$1',[p.id])).rows[0].codigo_interno;ws.addRow(INITIAL_COLUMNS.map(x=>row[x[0]]??null));const file_base64=Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  const preview=await request('/api/import/inventory/preview',{sucursal_id:ids.sucursalA,file_base64});assert.equal(preview.status,200);assert.equal(preview.data.errores,1);const r=await request('/api/import/inventory/commit',{sucursal_id:ids.sucursalA,file_base64,preview_sha256:preview.data.sha256});assert.equal(r.status,400);assert.deepEqual(await balance(p),before);assert.deepEqual(await unchangedHistory(p),history);
 });
 await t.test('conciliación rechaza empresa ajena sin cambios',async()=>{
  const before=await f.snapshotB();
  const {reconcileStockCosts}=await import('../server/src/stock-cost.js');
  await assert.rejects(()=>reconcileStockCosts({query:f.query},{empresaId:ids.empresaA,sucursalId:ids.sucursalB,productoId:ids.productoB}),/inválidos/);
  assert.deepEqual(await f.snapshotB(),before);
 });
 await t.test('migración legacy conserva vista, permisos, snapshots e idempotencia',async()=>{
  const p=await product();await buy(p,1,1.57);const sale=await sell(p,1);const before=await unchangedHistory(p);
  const oldUpgrade=readFileSync(new URL('../database/upgrade_v44_4.sql',import.meta.url),'utf8');
  await f.query('DROP VIEW reporte_detalles_netos');
  await f.query('ALTER TABLE venta_detalles ALTER COLUMN costo_snapshot TYPE numeric(14,4)');
  await f.query(oldUpgrade);
  await f.query('CREATE ROLE cost_report_reader NOLOGIN');
  await f.query('GRANT SELECT ON reporte_detalles_netos TO cost_report_reader');
  await f.query('ALTER VIEW reporte_detalles_netos SET (security_invoker=true)');
  const definition=(await f.query("SELECT pg_get_viewdef('reporte_detalles_netos'::regclass,true) d")).rows[0].d;
  const sql=readFileSync(new URL('../database/migrations/007_consistencia_costos.sql',import.meta.url),'utf8');
  await f.query(sql);await f.query(sql);
  assert.equal((await f.query("SELECT pg_get_viewdef('reporte_detalles_netos'::regclass,true) d")).rows[0].d,definition);
  assert.equal((await f.query("SELECT has_table_privilege('cost_report_reader','reporte_detalles_netos','SELECT') p")).rows[0].p,true);
  assert.ok((await f.query("SELECT reloptions FROM pg_class WHERE oid='reporte_detalles_netos'::regclass")).rows[0].reloptions.includes('security_invoker=true'));
  assert.deepEqual(await unchangedHistory(p),before);
 });
 await t.test('conciliación queda auditada, sin modificar compras o ventas previas',async()=>{
  const rows=(await f.query("SELECT detalle FROM auditoria WHERE empresa_id=$1 AND accion='CONCILIAR_COSTO_STOCK'",[ids.empresaA])).rows;
  assert.ok(rows.length>0);assert.ok(rows.every(x=>x.detalle.origen==='MOVIMIENTOS_INMUTABLES_Y_APERTURA'));
 });
});

test('Compras: etiqueta nueva sin cambiar expresión ni cálculo',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.ok(html.includes("['Compra promedio por documento',rcMoney(d.summary.promedio)]"));
 assert.ok(!html.includes("['Costo promedio',rcMoney(d.summary.promedio)]"));
 assert.match(readFileSync(new URL('../server/src/app.js',import.meta.url),'utf8'),/avg\(c\.total\)/);
});
