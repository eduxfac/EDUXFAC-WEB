import test from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';
import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import {mkdir,writeFile} from 'node:fs/promises';
import {countWorkbook,inventorySummary} from '../server/src/inventory-count.js';
import {createFixture,ids} from './helpers/initial-inventory-template-fixture.js';
const columns=['Código interno','Código de barras','Producto','Stock del sistema','Stock físico','Falta','Sobra','Precio falta','Precio sobra','Costo','Precio venta','Valorizado'];
async function workbook(buffer){const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);return wb;}
function byCode(wb,code){const ws=wb.getWorksheet('Conteo físico');for(let i=2;i<=ws.rowCount;i++)if(ws.getCell('A'+i).value===code)return ws.getRow(i);throw Error('No encontrado '+code);}
test('Conteo físico: exportación e importación reales en base ficticia',async t=>{
 const f=await createFixture();t.after(()=>f.close());
 const lotA=(await f.query('select id from lotes where producto_id=$1 and sucursal_id=$2',[ids.productoA,ids.sucursalA])).rows[0].id;
 await f.query('update lotes set cantidad_inicial=50,cantidad_disponible=50,costo_unitario=1.57 where id=$1',[lotA]);
 const lotB=randomUUID();
 await f.query("insert into lotes(id,producto_id,sucursal_id,numero_lote,cantidad_inicial,cantidad_disponible,costo_unitario) values($1,$2,$3,'SEGUNDO',50,50,1.65)",[lotB,ids.productoA,ids.sucursalA]);
 await f.query("insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,created_at) values($1,$2,$3,$4,'COMPRA',50,1.57,'2025-01-01'),($1,$2,$3,$5,'COMPRA',50,1.65,'2025-06-01')",[ids.empresaA,ids.sucursalA,ids.productoA,lotA,lotB]);
 await f.query("insert into precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta) values($1,$2,'unidad',1,2),($1,$3,'unidad',1,999),($1,null,'unidad',1,1.9)",[ids.productoA,ids.sucursalA,ids.sucursalA2]);
 async function product(code,{qty=100,cost=1.57,price=2.3,lot='REAL',createLot=true}={}){
  const id=randomUUID(),l=randomUUID();
  await f.query("insert into productos(id,empresa_id,codigo_interno,nombre,unidad_medida) values($1,$2,$3,$3,'UNIDAD')",[id,ids.empresaA,code]);
  await f.query("insert into producto_sucursal(producto_id,sucursal_id,origen) values($1,$2,'operacion')",[id,ids.sucursalA]);
  if(createLot)await f.query('insert into lotes(id,producto_id,sucursal_id,numero_lote,cantidad_inicial,cantidad_disponible,costo_unitario) values($1,$2,$3,$4,$5,$5,$6)',[l,id,ids.sucursalA,lot,qty,cost]);
  if(price!==null)await f.query("insert into precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta) values($1,$2,'unidad',1,$3)",[id,ids.sucursalA,price]);
  return{id,lot:l};
 }
 const less=await product('COUNT-LESS'),more=await product('COUNT-MORE',{cost:2}),equal=await product('COUNT-EQUAL',{cost:1}),decimal=await product('COUNT-DECIMAL',{qty:100,cost:1.2345});
 const unknown=await product('COUNT-UNKNOWN',{qty:10,cost:0,price:null});
 const zero=await product('COUNT-ZERO',{qty:0,cost:3.2,lot:'LAST'});
 const zeroOld=randomUUID();await f.query("insert into lotes(id,producto_id,sucursal_id,numero_lote,cantidad_inicial,cantidad_disponible,costo_unitario) values($1,$2,$3,'OLD',0,0,1)",[zeroOld,zero.id,ids.sucursalA]);
 await f.query("insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,created_at) values($1,$2,$3,$4,'COMPRA',1,1,'2025-01-01'),($1,$2,$3,$5,'COMPRA',1,3.2,'2025-06-01')",[ids.empresaA,ids.sucursalA,zero.id,zeroOld,zero.lot]);
 await product('COUNT-NONE',{createLot:false,price:null});
 const free=await product('COUNT-FREE',{qty:10,cost:0});
 await f.query("insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario) values($1,$2,$3,$4,'INVENTARIO_INICIAL',10,0)",[ids.empresaA,ids.sucursalA,free.id,free.lot]);
 const general=await product('COUNT-GENERAL',{qty:10,cost:3,price:null});
 await f.query("insert into precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta) values($1,null,'unidad',1,4),($1,$2,'unidad',1,99)",[general.id,ids.sucursalA2]);
 const snapshot=async()=>{const out={};for(const table of ['productos','producto_sucursal','lotes','precios_producto','compras','compra_detalles','ventas','venta_detalles','movimientos_inventario','ajustes_inventario'])out[table]=(await f.query('select * from '+table+' order by 1')).rows;return out;};
 const original=await snapshot(),buffer=await countWorkbook({query:f.query},ids.empresaA,ids.sucursalA);
 const wb=await workbook(buffer),ws=wb.getWorksheet('Conteo físico');
 await t.test('12 columnas correctas; información y versión original preservadas',()=>{assert.deepEqual(ws.getRow(1).values.slice(1),columns);assert.equal(wb.getWorksheet('Información').getCell('B1').value,'EDUXFAC_CONTEO_V1');assert.equal(wb.getWorksheet('Información').getCell('B2').value,ids.sucursalA);});
 await t.test('una fila por producto y ponderación de dos lotes 50×1.57+50×1.65',()=>{const r=byCode(wb,'P-A');assert.equal(r.getCell(4).value,100);assert.equal(r.getCell(10).value,1.61);assert.equal(r.getCell(11).value,2);assert.equal([...ws.getColumn(1).values].filter(v=>v==='P-A').length,1);});
 await t.test('precio de sucursal prioritario, general solo como fallback; nunca precio de otra sucursal',()=>assert.equal(byCode(wb,'COUNT-GENERAL').getCell(11).value,4));
 await t.test('stock cero usa lote del sobrante seleccionado por la cronología vigente',()=>assert.equal(byCode(wb,'COUNT-ZERO').getCell(10).value,3.2));
 await t.test('costo desconocido no se inventa; cero explícito documentado se conserva',()=>{assert.equal(byCode(wb,'COUNT-UNKNOWN').getCell(10).value,null);assert.equal(byCode(wb,'COUNT-NONE').getCell(10).value,null);assert.equal(byCode(wb,'COUNT-FREE').getCell(10).value,0);});
 await t.test('E editable; otras columnas bloqueadas; amarillo y formatos S/ correctos',()=>{const r=byCode(wb,'P-A');assert.equal(r.getCell(5).protection.locked,false);for(const c of [6,7,8,9,12])assert.notEqual(r.getCell(c).protection?.locked,false);assert.equal(r.getCell(5).fill.fgColor.argb,'FFFFF2CC');for(const c of [4,5,6,7])assert.equal(ws.getColumn(c).numFmt,'0.000');for(const c of [8,9,10,11,12])assert.match(ws.getColumn(c).numFmt,/S\//);});
 await t.test('formato condicional diferencial conserva fondos naranja y verde al reabrir XLSX',()=>{assert.equal(ws.conditionalFormattings.length,2);assert.equal(ws.conditionalFormattings[0].rules[0].style.fill.bgColor.argb,'FFFFE4CC');assert.equal(ws.conditionalFormattings[1].rules[0].style.fill.bgColor.argb,'FFDCFCE7');});
 await t.test('cinco fórmulas por fila: referencias correctas, vacío no cuenta como cero',()=>{for(let r=2;r<=ws.rowCount;r++){assert.equal(ws.getCell('F'+r).value.formula,'IF(E'+r+'="","",ROUND(MAX(D'+r+'-E'+r+',0),3))');assert.equal(ws.getCell('G'+r).value.formula,'IF(E'+r+'="","",ROUND(MAX(E'+r+'-D'+r+',0),3))');for(const c of ['H','I','L'])assert.match(ws.getCell(c+r).value.formula,/NOT\(ISNUMBER\(J/);}});
 await t.test('exportación SQL totalmente READ-ONLY, resumen de inventario sin cambios',async()=>{assert.deepEqual(await snapshot(),original);const sum=await inventorySummary({query:f.query},ids.empresaA,ids.sucursalA);assert.equal(Number(sum.total),ws.rowCount-1);});
 await t.test('aislamiento: hoja A no contiene códigos de B y sucursal ajena devuelve 403',async()=>{assert.ok(!ws.getColumn(1).values.includes('P-B'));const r=await f.request('/api/import/stock-only/template?sucursal_id='+ids.sucursalB,{token:f.tokenA});assert.equal(r.status,403);});
 const asBase64=async(x)=>Buffer.from(await x.xlsx.writeBuffer()).toString('base64');
 const commit=x=>f.request('/api/import/stock-only/commit',{token:f.tokenA,method:'POST',body:{sucursal_id:ids.sucursalA,file_base64:x}});
 await t.test('alterar J/K y fórmulas monetarias no cambia costos ni precios; solo E ajusta',async()=>{
  const x=await workbook(buffer),r=byCode(x,'COUNT-LESS');
  r.getCell(5).value=95;r.getCell(10).value=999999;r.getCell(11).value={formula:'1+1',result:999999};r.getCell(8).value=999999;r.getCell(12).value=999999;
  const beforeLots=(await f.query('select id,costo_unitario from lotes order by id')).rows,beforePrices=(await f.query('select * from precios_producto order by id')).rows;
  const result=await commit(await asBase64(x));assert.equal(result.status,201,JSON.stringify(result.data));
  assert.deepEqual((await f.query('select id,costo_unitario from lotes order by id')).rows,beforeLots);assert.deepEqual((await f.query('select * from precios_producto order by id')).rows,beforePrices);
  assert.equal(Number((await f.query('select cantidad_disponible from lotes where id=$1',[less.lot])).rows[0].cantidad_disponible),95);
 });
 await t.test('faltante conserva regla de lotes más antiguos, aunque J ponderado difiera',async()=>{
  const x=await workbook(await countWorkbook({query:f.query},ids.empresaA,ids.sucursalA)),r=byCode(x,'P-A');r.getCell(5).value=95;
  const result=await commit(await asBase64(x));assert.equal(result.status,201,JSON.stringify(result.data));
  assert.equal(Number((await f.query('select cantidad_disponible from lotes where id=$1',[lotA])).rows[0].cantidad_disponible),45);assert.equal(Number((await f.query('select cantidad_disponible from lotes where id=$1',[lotB])).rows[0].cantidad_disponible),50);
 });
 await t.test('sobrante agrega al lote vigente y conserva costos/precios propios, no J/K Excel',async()=>{
  const x=await workbook(await countWorkbook({query:f.query},ids.empresaA,ids.sucursalA)),r=byCode(x,'P-A');r.getCell(5).value=100;r.getCell(10).value=999;r.getCell(11).value=999;
  const result=await commit(await asBase64(x));assert.equal(result.status,201,JSON.stringify(result.data));
  const lots=(await f.query('select id,cantidad_disponible,costo_unitario from lotes where producto_id=$1 and sucursal_id=$2 order by id',[ids.productoA,ids.sucursalA])).rows;
  assert.equal(Number(lots.find(l=>l.id===lotA).cantidad_disponible),45);assert.equal(Number(lots.find(l=>l.id===lotB).cantidad_disponible),55);
  assert.equal(Number(lots.find(l=>l.id===lotA).costo_unitario),1.57);assert.equal(Number(lots.find(l=>l.id===lotB).costo_unitario),1.65);
 });
 await t.test('stock físico decimal conserva milésimas y solo ajusta cantidad',async()=>{const x=await workbook(await countWorkbook({query:f.query},ids.empresaA,ids.sucursalA)),r=byCode(x,'COUNT-DECIMAL');r.getCell(5).value=95.125;assert.equal((await commit(await asBase64(x))).status,201);assert.equal(Number((await f.query('select cantidad_disponible from lotes where id=$1',[decimal.lot])).rows[0].cantidad_disponible),95.125);});
 await t.test('stock físico vacío omite; cero explícito ajusta; stock exportado obsoleto revierte',async()=>{const x=await workbook(await countWorkbook({query:f.query},ids.empresaA,ids.sucursalA));byCode(x,'COUNT-EQUAL').getCell(5).value=0;byCode(x,'COUNT-MORE').getCell(5).value=90;byCode(x,'COUNT-MORE').getCell(4).value=99;const before=await snapshot();assert.equal((await commit(await asBase64(x))).status,400);assert.deepEqual(await snapshot(),before);});
 await t.test('viejo formato cinco columnas sigue siendo compatible',async()=>{const x=await workbook(await countWorkbook({query:f.query},ids.empresaA,ids.sucursalA));x.getWorksheet('Conteo físico').spliceColumns(6,7);byCode(x,'COUNT-EQUAL').getCell(5).value=100;assert.equal((await commit(await asBase64(x))).status,201);});
 await t.test('E completamente vacío rechaza sin cambios y no convierte blancos en cero',async()=>{const x=await workbook(await countWorkbook({query:f.query},ids.empresaA,ids.sucursalA));const before=await snapshot();const result=await commit(await asBase64(x));assert.equal(result.status,400);assert.match(result.data.error,/Complete Stock físico/);assert.deepEqual(await snapshot(),before);});
 await t.test('E cero explícito vacía producto; otros E vacíos se omiten y costos/precios siguen iguales',async()=>{const x=await workbook(await countWorkbook({query:f.query},ids.empresaA,ids.sucursalA));byCode(x,'COUNT-EQUAL').getCell(5).value=0;byCode(x,'COUNT-EQUAL').getCell(10).value=777;byCode(x,'COUNT-EQUAL').getCell(11).value=888;const before=await snapshot();const result=await commit(await asBase64(x));assert.equal(result.status,201,JSON.stringify(result.data));assert.equal(Number((await f.query('select coalesce(sum(l.cantidad_disponible),0) stock from lotes l join productos p on p.id=l.producto_id where p.codigo_interno=$1 and l.sucursal_id=$2',['COUNT-EQUAL',ids.sucursalA])).rows[0].stock),0);const after=await snapshot();assert.deepEqual(after.precios_producto,before.precios_producto);for(const lot of before.lotes){const now=after.lotes.find(l=>l.id===lot.id);assert.equal(now.costo_unitario,lot.costo_unitario);if(lot.producto_id!==after.productos.find(p=>p.codigo_interno==='COUNT-EQUAL').id)assert.deepEqual(now,lot);}});
 await mkdir(new URL('../docs/physical_count_excel/',import.meta.url),{recursive:true});
 await writeFile(new URL('../docs/physical_count_excel/Conteo_Fisico_FICTICIO_QA.xlsx',import.meta.url),buffer);
 await writeFile(new URL('../operations/physical-count-excel/QA_ROWS.json',import.meta.url),JSON.stringify({rows:Object.fromEntries(['COUNT-LESS','COUNT-MORE','COUNT-EQUAL','COUNT-DECIMAL','P-A','COUNT-UNKNOWN'].map(c=>[c,byCode(wb,c).number]))},null,2));
});
test('Conteo físico: 5.000 productos, consultas constantes y todas las fórmulas',async()=>{
 const rows=Array.from({length:5000},(_,i)=>({id:'P'+i,codigo_interno:'P'+i,codigo_barras:null,nombre:'Producto ficticio '+i,stock:'100',valor:'200',precio:'3'}));
 const lots=rows.map(r=>({id:'L'+r.id,producto_id:r.id,numero_lote:'REAL',cantidad_disponible:'100',costo_unitario:'2',costo_verificable:true}));
 let calls=0;const db={query:async sql=>{calls++;if(sql.includes('select inventory.*'))return{rows};if(sql.includes('select l.id,l.producto_id'))return{rows:lots};if(sql.includes('select nombre from sucursales'))return{rows:[{nombre:'Sucursal ficticia'}]};throw Error('Consulta no esperada');}};
 const start=performance.now(),wb=await workbook(await countWorkbook(db,'A','S')),ws=wb.getWorksheet('Conteo físico');
 assert.equal(calls,3);assert.equal(ws.rowCount,5001);assert.ok(ws.getCell('L5001').value.formula.includes('E5001*J5001'));console.log('COUNT_EXPORT_5000_MS='+Math.round(performance.now()-start));
});
test('Conteo físico: planificación/importación y resumen conservados salvo el formato de fecha calendario',()=>{
 const old=readFileSync(new URL('../operations/physical-count-excel/inventory-count.before.js',import.meta.url)),now=readFileSync(new URL('../server/src/inventory-count.js',import.meta.url));
 assert.equal(old.subarray(old.indexOf('export function validateCount(')).toString().replace("new Date(lot.fecha_vencimiento).toISOString().slice(0,10)","lot.fecha_vencimiento.split('-').reverse().join('/')"),now.subarray(now.indexOf('export function validateCount(')).toString());
 assert.deepEqual(old.subarray(0,old.indexOf('export async function countWorkbook(')),now.subarray(0,now.indexOf('// The export is informational')));
});
