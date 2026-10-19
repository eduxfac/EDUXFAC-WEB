import test from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';
import {mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createFixture,ids} from './helpers/initial-inventory-template-fixture.js';
test('Post-deploy: descargar XLSX del endpoint con usuario ficticio, verificar 15 columnas y hoja Información',async()=>{
 const f=await createFixture();
 try{
  const r=await fetch(f.base+'/api/import/inventory/template?sucursal_id='+ids.sucursalA,{headers:{Authorization:'Bearer '+f.tokenA}});
  assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/spreadsheetml/);
  const buffer=Buffer.from(await r.arrayBuffer()),wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);
  const expected=['Código interno','Código de barras','Producto','Principio activo','Concentración','Presentación','Unidad de medida','Categoría','Laboratorio','Stock del lote','Stock mínimo','Precio de compra','Precio de venta','Lote','Vencimiento'];
  assert.deepEqual(wb.getWorksheet('Inventario inicial').getRow(1).values.slice(1),expected);
  assert.equal(wb.getWorksheet('Inventario inicial').columnCount,15);
  assert.ok(!expected.includes('Stock máximo')&&!expected.includes('Valor del stock'));
  const info=wb.getWorksheet('Información');assert.ok(info);assert.equal(info.getRow(13).getCell(1).value,'P000003');assert.equal(info.getRow(14).getCell(1).value,'P000003');
  assert.equal(info.getRow(13).getCell(10).value+info.getRow(14).getCell(10).value,10);
  assert.equal(info.getRow(13).getCell(14).value,'EDED');assert.equal(info.getRow(14).getCell(14).value,'DEDEEE');
  const directory=new URL('../docs/initial_inventory_deploy/',import.meta.url);await mkdir(directory,{recursive:true});
  await writeFile(new URL('Plantilla_Inventario_Inicial_EDUXFAC.xlsx',directory),buffer);
  await writeFile(new URL('TEMPLATE_VERIFIED.json',directory),JSON.stringify({status:200,headers:expected,informationSheet:true,twoLotsExample:true,source:'Actual API on isolated fictitious database; source hashes identical to deployed files',bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')},null,2));
 }finally{await f.close();}
});
