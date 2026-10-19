import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createFixture,ids} from './helpers/active-search-fixture.js';
test('Búsqueda Ventas: API real con catálogo ficticio y aislamiento',async t=>{
 const f=await createFixture();t.after(()=>f.close());
 await f.query("UPDATE productos SET nombre='APRONAX 550MG',principio_activo='NAPROXENO SÓDICO',codigo_interno='COD-APRO',codigo_anterior='ANT-123',codigo_barras='7751234567890' WHERE id=$1",[ids.productoA]);
 await f.query("UPDATE productos SET principio_activo='NAPROXENO SÓDICO' WHERE id=$1",[ids.productoB]);
 const other=randomUUID(),onlyBranch2=randomUUID(),missing=randomUUID();
 for(const [id,name,active,branch]of [[other,'Naproxeno alternativa','NAPROXENO SÓDICO',ids.sucursalA],[onlyBranch2,'Exclusivo sucursal dos','NAPROXENO SÓDICO',ids.sucursalA2],[missing,'Producto sin principio',null,ids.sucursalA]]){
  await f.query('INSERT INTO productos(id,empresa_id,codigo_interno,nombre,principio_activo) VALUES($1,$2,$3,$4,$5)',[id,ids.empresaA,'ST-'+id,name,active]);
  await f.query("INSERT INTO producto_sucursal(producto_id,sucursal_id,origen) VALUES($1,$2,'operacion')",[id,branch]);
 }
 const search=async(q,extra='',token=f.tokenA,branch=ids.sucursalA)=>{
  const r=await f.request('/api/products?sucursal_id='+branch+'&q='+encodeURIComponent(q)+'&search_scope=ventas&limit=30'+extra,{token});return r;
 };
 for(const [term,label]of [['APRONAX','nombre'],['NAPROXENO','principio'],['naproxeno','minúsculas'],['NaPrO','parcial mixto'],['naproxeno sódico','varias palabras'],['sódico','segunda palabra'],['SÓDICO','mayúsculas acentuadas'],['SóDiCo','acentos con caso mixto'],['COD-APRO','código interno'],['ANT-123','código anterior'],['7751234567890','código de barras']]){
  await t.test(label,async()=>{const x=await search(term);assert.equal(x.status,200);assert.ok(x.data.some(p=>p.id===ids.productoA),JSON.stringify(x.data));});
 }
 await t.test('todos con principio compartido; empresa B y sucursal A2 excluidas',async()=>{
  const x=await search('NAPROXENO');assert.deepEqual(new Set(x.data.map(p=>p.id)),new Set([ids.productoA,other]));
 });
 await t.test('sin principio activo no genera error y conserva búsqueda por nombre',async()=>{
  const x=await search('Producto sin principio');assert.equal(x.status,200);assert.equal(x.data[0].id,missing);
 });
 await t.test('sucursal sin coincidencias vinculadas no filtra stock de A',async()=>{
  const x=await search('naproxeno','',f.tokenA,ids.sucursalA2);assert.equal(x.status,200);assert.equal(x.data.length,2);assert.equal(Number(x.data.find(p=>p.id===ids.productoA).stock),0);
 });
 await t.test('sucursal de empresa B rechazada',async()=>assert.equal((await search('NAPROXENO','',f.tokenA,ids.sucursalB)).status,403));
 await t.test('sin sesión rechazado',async()=>assert.equal((await search('NAPROXENO','',null)).status,401));
 await t.test('inyección textual no amplía resultados',async()=>{const x=await search("' OR TRUE --");assert.equal(x.status,200);assert.equal(x.data.length,0);});
 await t.test('otros consumidores del endpoint conservan búsqueda anterior',async()=>{
  const x=await f.request('/api/products?sucursal_id='+ids.sucursalA+'&q='+encodeURIComponent('SÓDICO'),{token:f.tokenA});assert.equal(x.status,200);assert.equal(x.data.length,0);
 });
 await t.test('más de 30 coincidencias: páginas completas sin omisiones ni duplicados',async()=>{
  await f.query("INSERT INTO productos(empresa_id,codigo_interno,nombre,principio_activo) SELECT $1,'PAG-'||n,'Alternativa paginada '||lpad(n::text,3,'0'),'NAPROXENO SÓDICO' FROM generate_series(1,65) n",[ids.empresaA]);
  await f.query("INSERT INTO producto_sucursal(producto_id,sucursal_id,origen) SELECT id,$1,'operacion' FROM productos WHERE codigo_interno LIKE 'PAG-%' AND empresa_id=$2",[ids.sucursalA,ids.empresaA]);
  const all=[];for(let offset=0;offset<90;offset+=30){const x=await search('NAPROXENO','&offset='+offset);assert.equal(x.status,200);all.push(...x.data);}
  assert.equal(all.length,67);assert.equal(new Set(all.map(p=>p.id)).size,67);
 });
 await t.test('lectura no altera stock, ventas, compras ni movimientos',async()=>{
  const snapshot=async()=>{const out={};for(const table of ['lotes','ventas','venta_detalles','compras','compra_detalles','movimientos_inventario','movimientos_caja'])out[table]=(await f.query('SELECT * FROM '+table)).rows;return out;};
  const before=await snapshot();await search('NAPRO');await search('ANT-123');assert.deepEqual(await snapshot(),before);
 });
});
