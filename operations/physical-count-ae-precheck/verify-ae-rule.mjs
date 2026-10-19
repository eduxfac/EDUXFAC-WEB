import ExcelJS from 'exceljs';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {writeFile} from 'node:fs/promises';
import {createFixture,ids} from '../../tests/helpers/initial-inventory-template-fixture.js';
const out=new URL('./',import.meta.url);const fixture=await createFixture();
try{
 const tables=['productos','producto_sucursal','lotes','precios_producto','compras','compra_detalles','ventas','venta_detalles','movimientos_inventario','ajustes_inventario'];
 async function snapshot(){const data={};for(const table of tables)data[table]=(await fixture.query('select * from '+table)).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return data;}
 const response=await fixture.request('/api/import/stock-only/template?sucursal_id='+ids.sucursalA,{token:fixture.tokenA});assert.equal(response.status,200);
 const download=await fetch(fixture.base+'/api/import/stock-only/template?sucursal_id='+ids.sucursalA,{headers:{Authorization:'Bearer '+fixture.tokenA}});assert.equal(download.status,200);const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(await download.arrayBuffer()));const ws=wb.getWorksheet('Conteo físico');let target;
 ws.eachRow((row,i)=>{if(i>1&&row.getCell(1).value==='P-A')target=row});assert.ok(target);
 const exportedStock=Number(target.getCell(4).value),physical=exportedStock-2;assert.ok(physical>=0);
 const edits={B:'BARRA_MANIPULADA',C:'NOMBRE_MANIPULADO',D:exportedStock+999,F:777,G:888,H:999,I:111,J:222,K:333,L:444};
 for(const[column,value]of Object.entries(edits))target.getCell(column).value=value;
 target.getCell('E').value=physical;
 const before=await snapshot(),file=Buffer.from(await wb.xlsx.writeBuffer());await writeFile(new URL('CONTEO_MANIPULADO_FICTICIO.xlsx',out),file);
 const result=await fixture.request('/api/import/stock-only/commit',{token:fixture.tokenA,method:'POST',body:{sucursal_id:ids.sucursalA,file_base64:file.toString('base64')}});
 const after=await snapshot();const same=JSON.stringify(before)===JSON.stringify(after);
 const relevant=state=>({product:state.productos.find(p=>p.id===ids.productoA),lots:state.lotes.filter(l=>l.producto_id===ids.productoA),prices:state.precios_producto.filter(p=>p.producto_id===ids.productoA),stock:state.lotes.filter(l=>l.producto_id===ids.productoA).reduce((n,l)=>n+Number(l.cantidad_disponible),0)});
 const perTable=Object.fromEntries(tables.map(t=>[t,{rows_before:before[t].length,rows_after:after[t].length,unchanged:JSON.stringify(before[t])===JSON.stringify(after[t]),sha256_before:crypto.createHash('sha256').update(JSON.stringify(before[t])).digest('hex'),sha256_after:crypto.createHash('sha256').update(JSON.stringify(after[t])).digest('hex')}]))
 const evidence={status:result.status===201?'MANDATORY_AE_RULE_PASSED':'BLOCKER_MANDATORY_AE_RULE_FAILED',expected_http:201,actual_http:result.status,error:result.data.error??null,edited_informative_columns:edits,column_A:'P-A',column_E:physical,stock_before:relevant(before).stock,stock_after:relevant(after).stock,all_compared_tables_unchanged:same,per_table:perTable,vps_connected:false,deployed:false,only_fictitious_in_memory_database:true};
 await writeFile(new URL('DB_BEFORE_AFTER_FICTICIO.json',out),JSON.stringify({before:relevant(before),after:relevant(after)},null,2));await writeFile(new URL('RESULT.json',out),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await fixture.close();}
