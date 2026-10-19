import fs from 'node:fs';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js';
const s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json','utf8'));
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_web_piloto',user:'eduxfac_web_migrator',password:s.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c default_transaction_read_only=on -c statement_timeout=10000'});


import assert from 'node:assert/strict';
import {requirementList,lowStockCount,generateRequirement,requirementWorkbook,requirementPrint} from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/server/src/purchase-requirement.js';
import ExcelJS from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/exceljs/excel.js';
const checks=[];const check=(name,fn)=>{fn();checks.push(name)};
await db.connect();try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const guard=(await db.query("select current_database() db,current_setting('transaction_read_only') ro")).rows[0];
 check('PILOTO_READ_ONLY',()=>assert.deepEqual(guard,{db:'eduxfac_web_piloto',ro:'on'}));
 const scopes=(await db.query("select e.id company,s.id branch from empresas e join sucursales s on s.empresa_id=e.id where e.ruc='10460023039' and s.codigo='PRINCIPAL'")).rows;
 check('PILOT_COMPANY_BRANCH_FOUND',()=>assert.equal(scopes.length,1));
 const {company,branch}=scopes[0];const start=performance.now();const list=await requirementList(db,company,branch);const ms=performance.now()-start;
 check('ALL_ROWS_STOCK_LE_MINIMUM',()=>assert.ok(list.items.every(x=>Number(x.stock)<=Number(x.stock_minimo))));
 const count=Number((await lowStockCount(db,company,branch)).rows[0].cantidad);
 check('DASHBOARD_COUNT_EQUALS_REQUIREMENT',()=>assert.equal(count,list.total));
 const independent=Number((await db.query("select count(*)::int n from (select ps.producto_id from producto_sucursal ps join productos p on p.id=ps.producto_id left join lotes l on l.producto_id=p.id and l.sucursal_id=ps.sucursal_id where ps.sucursal_id=$2 and p.empresa_id=$1 and ps.activo group by ps.producto_id,ps.stock_minimo having coalesce(sum(l.cantidad_disponible),0)<=ps.stock_minimo) q",[company,branch])).rows[0].n);
 check('INDEPENDENT_REAL_COUNT',()=>assert.equal(count,independent));
 const rls=Number((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and relforcerowsecurity")).rows[0].n);check('FORCE_RLS_44',()=>assert.equal(rls,44));
 let exported=0,printed=0;
 if(list.items.length){
  const row=list.items[0],doc=await generateRequirement(db,company,branch,[{producto_id:row.id,cantidad:1}]);
  check('GENERATE_READ_ONLY_MANUAL_QUANTITY',()=>{assert.equal(doc.items.length,1);assert.equal(doc.items[0].cantidad,1)});
  const buf=await requirementWorkbook(doc),book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(buf));
  check('EXCEL_8_COLUMNS',()=>assert.deepEqual(book.getWorksheet('Requerimiento').getRow(1).values.slice(1),['Código','Producto','Stock actual','Stock mínimo','Cantidad a pedir','Último costo','Proveedor','Sucursal']));
  check('EXCEL_INFORMATION',()=>assert.ok(book.getWorksheet('Información')));
  fs.writeFileSync(new URL('./Requerimiento_VPS_READONLY.xlsx',import.meta.url),Buffer.from(buf),{mode:0o600});exported=doc.items.length;
  const html=requirementPrint(doc);check('PRINT_DOCUMENT',()=>{assert.match(html,/Requerimiento de compra/);assert.ok(!html.includes('<button'))});fs.writeFileSync(new URL('./Impresion_VPS_READONLY.html',import.meta.url),html,{mode:0o600});printed=doc.items.length;
 }
 await db.query('ROLLBACK');
 console.log(JSON.stringify({result:'READONLY_REQUIREMENT_OK',passed:checks.length,failed:0,checks,dashboard_stock_bajo:count,requirement_total:list.total,page_rows:list.items.length,response_ms:Math.round(ms*100)/100,force_rls:rls,exported_rows:exported,printed_rows:printed,real_database_writes:false}));
}finally{await db.end()}
