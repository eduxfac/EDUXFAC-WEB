import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),before=readFileSync(new URL('./purchase-detail-visual/original/public/index.html',import.meta.url),'utf8');
const data=JSON.parse(readFileSync(new URL('./purchase-detail-visual/data.json',import.meta.url),'utf8'));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function context(source){const el=new Map();const c={esc,api:async()=>data,$:id=>{if(!el.has(id)){const classes=new Set();el.set(id,{open:false,textContent:'',innerHTML:'',classList:{toggle:(x,b)=>b?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},showModal(){this.open=true;},close(){this.open=false;},addEventListener(){}});}return el.get(id);}};vm.createContext(c);if(source.includes('function formatExpiryDate(value){'))vm.runInContext(source.slice(source.indexOf('function formatExpiryDate(value){'),source.indexOf('async function loadAlerts()')),c);vm.runInContext(source.slice(source.indexOf('function reportDocumentMarkup(data){'),source.indexOf('document.addEventListener(\'click\',e=>{const button=e.target.closest?.(\'[data-report-document]\')')),c);return c;}
const text=html=>html.replace(/(<td>)(\d{4})-(\d{2})-(\d{2})(<\/td>)/g,'$1$4/$3/$2$5').replace(/<h4>[\s\S]*?<\/h4>/g,'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
test('Compra: mismo contenido, valores, nueve columnas y totales, con secciones visuales',()=>{
 const a=context(before),b=context(html),snapshot=JSON.stringify(data),old=a.reportDocumentMarkup(data),now=b.reportDocumentMarkup(data);
 assert.equal(text(now.content),text(old.content));assert.equal(now.totals,old.totals);assert.equal(now.title,old.title);assert.equal(JSON.stringify(data),snapshot);
 assert.match(now.content,/>Información general</);assert.match(now.content,/>Detalle de productos</);
 assert.deepEqual([...now.content.matchAll(/<th>(.*?)<\/th>/g)].map(x=>x[1]),['Código','Descripción','Presentación / unidad','Lote','Vencimiento','Cantidad','Costo unitario','Descuento registrado','Subtotal registrado']);
 assert.equal((now.content.match(/<td>/g)||[]).length,18);assert.equal((now.content.match(/<b>/g)||[]).length,10);
});
test('Compra: nulos, documento vacío, moneda USD y texto escapado conservan representación',()=>{
 for(const modify of [x=>{x.documento.descuento=null;x.documento.observacion=null;},x=>{x.productos=[];},x=>{x.documento.moneda='USD';x.documento.total=123.45;},x=>{x.documento.proveedor='<script>NO EJECUTAR</script>';x.productos[0].descripcion_referencia='<img onerror=NO>';}]){
  const x=structuredClone(data);modify(x);const a=context(before).reportDocumentMarkup(x),b=context(html).reportDocumentMarkup(x);
  assert.equal(text(a.content),text(b.content));assert.equal(a.totals,b.totals);assert.ok(!b.content.includes('<script>'));
 }
});
test('Venta anulada: marcado y totales totalmente idénticos al original',()=>{
 const x={...data,tipo:'cancellations'};assert.deepEqual(JSON.parse(JSON.stringify(context(html).reportDocumentMarkup(x))),JSON.parse(JSON.stringify(context(before).reportDocumentMarkup(x))));
});
test('Modal: apertura/cierre y ruta API preservados; clase exclusiva compra',async()=>{
 const c=context(html),routes=[];c.api=async route=>{routes.push(route);return data;};
 await c.showReportDocument('purchases','DEMO-123');assert.equal(c.$('reportDocumentModal').open,true);assert.equal(c.$('reportDocumentModal').classList.contains('purchase-detail-view'),true);assert.equal(routes[0],'/api/reports/purchases/DEMO-123/detail');assert.equal(c.$('reportDocumentTitle').textContent,'Detalle de compra');
 c.$('reportDocumentClose').onclick();assert.equal(c.$('reportDocumentModal').open,false);
 await c.showReportDocument('cancellations','DEMO-CANCEL');assert.equal(c.$('reportDocumentModal').classList.contains('purchase-detail-view'),false);assert.equal(routes[1],'/api/reports/cancellations/DEMO-CANCEL/detail');
});
test('Modal: respuesta cerrada/obsoleta no vuelve a pintar datos',async()=>{
 const c=context(html);let done;c.api=()=>new Promise(r=>done=r);const p=c.showReportDocument('purchases','DEMO-123');c.$('reportDocumentModal').close();done(data);await p;assert.equal(c.$('reportDocumentContent').innerHTML,'');
});
test('Todos los scripts inline siguen compilando',()=>{
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
});
