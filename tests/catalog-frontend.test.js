import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webIndexHTML} from '../server/src/csp-header.js';
import {createFixture,ids} from './helpers/isolated-web.js';

const source=webIndexHTML;
const registry=source.split('\n').find(x=>x.startsWith('window.eduxfacActions='));
function registryOutsideTemplate(){
 const at=source.indexOf(registry),begin=source.indexOf('function fallbackReportExcelXls('),end=source.indexOf('async function exportFilteredSalesReport()',begin);
 assert.ok(at<begin||at>end,'El registro global quedó encerrado en la plantilla Excel');
 assert.equal(source.split('window.eduxfacActions=').length-1,1);
}
test('Catálogos: registro real disponible fuera de la plantilla exportada',registryOutsideTemplate);

function frontend(f){
 registryOutsideTemplate();
 const elements=new Map(),events=new Map(),requests=[],toasts=[];
 let reloads=0;
 const context={console,setTimeout,clearTimeout,queueMicrotask,requestAnimationFrame:fn=>queueMicrotask(fn),getComputedStyle:()=>({visibility:'visible'}),Option:function(text,value){this.text=text;this.value=value;},
  state:{token:f.tokenA,branchId:ids.sucursalA},catalogs:{categorias:[],laboratorios:[]},productEquivalences:[],productFormPurchaseParent:false,
  location:{reload(){reloads++;}},showToast:(type,message)=>toasts.push({type,message}),
  clearProductForm:async()=>{},loadAdminProducts:async()=>{},loadProducts:async()=>{},loadDashboard:async()=>{},
  fetch:async(route,options={})=>{
   const body=options.body?JSON.parse(options.body):undefined,token=options.headers?.Authorization?.replace(/^Bearer /,'');
   const r=await f.request(route,{method:options.method||'GET',token,body});
   requests.push({route,status:r.status,body});return {ok:r.status<400,status:r.status,json:async()=>r.data};
  }};
 function element(id){
  const classes=new Set(id==='appDialogModal'?['hidden']:[]);
  const attributes=new Map(),listeners=new Map();
  return {id,value:'',textContent:'',innerHTML:'',disabled:false,inert:false,isConnected:true,options:[],style:{},dataset:{},listeners,
   classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c,on){if(on===undefined)on=!classes.has(c);on?classes.add(c):classes.delete(c);}},
   add:o=>elements.get(id).options.push(o),setAttribute:(k,v)=>attributes.set(k,String(v)),getAttribute:k=>attributes.get(k),removeAttribute:k=>attributes.delete(k),
   addEventListener:(name,fn)=>listeners.set(name,fn),focus(){document.activeElement=this;},blur(){document.activeElement=document.body;},select(){},
   getClientRects:()=>[{}],closest(selector){if(selector==='[data-edux-action]')return attributes.has('data-edux-action')?this:null;return null;},
   contains:other=>id==='appDialogModal'&&other?.id?.startsWith('appDialog')};
 }
 const document={body:element('body'),activeElement:null,getElementById:id=>{if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},
  querySelectorAll:()=>[],addEventListener:(name,fn)=>{const list=events.get(name)||[];list.push(fn);events.set(name,list);}};
 document.activeElement=document.body;
 context.document=document;context.$=id=>document.getElementById(id);context.window=context;
 for(const [id,kind]of [['paCategoryNew','categorias'],['paLabNew','laboratorios']]){
  assert.ok(source.includes('id="'+id+'"'));assert.ok(source.includes('id="'+id.replace(/New$/,'')+'"'));
  context.$(id).setAttribute('data-edux-action',"createProductCatalog('"+kind+"')");
 }
 const sandbox=vm.createContext(context);
 vm.runInContext(readFileSync(new URL('../public/app-dialogs.js',import.meta.url),'utf8'),sandbox);
 vm.runInContext(source.split('\n').find(x=>x.startsWith('async function api(')),sandbox);
 vm.runInContext(source.split('\n').find(x=>x.startsWith('function requestText(')),sandbox);
 vm.runInContext(source.slice(source.indexOf('async function createProductCatalog('),source.indexOf('function validateProductForm(')),sandbox);
 vm.runInContext(source.slice(source.indexOf('function validateProductForm('),source.indexOf('async function saveProduct(')),sandbox);
 vm.runInContext(source.split('\n').find(x=>x.startsWith('async function saveProduct(')),sandbox);
 vm.runInContext(registry,sandbox);
 vm.runInContext(readFileSync(new URL('../public/delegated-events.js',import.meta.url),'utf8'),sandbox);
 async function wait(fn){for(let i=0;i<400&&!fn();i++)await new Promise(r=>setTimeout(r,10));assert.ok(fn(),'La acción no completó');}
 async function clickAndCreate(id,name){
  const count=requests.length;let prevented=false;
  for(const fn of events.get('click')||[])fn({target:context.$(id),preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(context.$('appDialogModal').classList.contains('hidden'),false);
  assert.equal(context.$('appDialogField').classList.contains('hidden'),false);
  context.$('appDialogInput').value=name;
  context.$('appDialogForm').listeners.get('submit')({preventDefault(){}});
  await wait(()=>requests.length>count&&context.$(id).disabled===false);
  assert.equal(context.$('appDialogModal').classList.contains('hidden'),true);
  assert.equal(context.$('app').inert,false);
 }
 return {context,requests,toasts,clickAndCreate,get reloads(){return reloads;}};
}

test('Catálogos: botones → diálogo real → API → selectores → producto',async t=>{
 const f=await createFixture();t.after(()=>f.close());
 const ui=frontend(f),el=ui.context.$;
 const beforeB=await f.snapshotB();
 let category,lab,product;
 await t.test('crear categoría y seleccionarla inmediatamente sin recarga',async()=>{
  await ui.clickAndCreate('paCategoryNew','Categoría ficticia DOM');
  const r=ui.requests.at(-1);assert.equal(r.route,'/api/catalogs/categorias');assert.equal(r.status,201);
  category=el('paCategory').value;assert.ok(category);assert.ok(el('paCategory').options.some(o=>o.value===category&&o.text==='Categoría ficticia DOM'));
  assert.equal(ui.context.catalogs.categorias[0].id,category);assert.equal(ui.reloads,0);
 });
 await t.test('crear laboratorio y seleccionarlo sin perder categoría',async()=>{
  await ui.clickAndCreate('paLabNew','Laboratorio ficticio DOM');
  const r=ui.requests.at(-1);assert.equal(r.route,'/api/catalogs/laboratorios');assert.equal(r.status,201);
  lab=el('paLab').value;assert.ok(lab);assert.ok(el('paLab').options.some(o=>o.value===lab&&o.text==='Laboratorio ficticio DOM'));
  assert.equal(el('paCategory').value,category);assert.equal(ui.context.catalogs.laboratorios[0].id,lab);assert.equal(ui.reloads,0);
 });
 await t.test('crear producto mediante código real con categoría y laboratorio nuevos',async()=>{
  for(const [id,value]of Object.entries({paBarcode:'9991234567812',paName:'Producto ficticio DOM',paActive:'Prueba',paConcentration:'10 mg',paPresentation:'Caja',paUnit:'UNIDAD',paMin:'0',paMax:'10',paPrice:'2.50',paId:''}))el(id).value=value;
  const next=await f.request('/api/admin/products/next-code',{token:f.tokenA});assert.equal(next.status,200);el('paCode').value=next.data.codigo_interno;
  const pending=ui.context.saveProduct();
  assert.equal(el('appDialogModal').classList.contains('hidden'),false);
  el('appDialogForm').listeners.get('submit')({preventDefault(){}});
  await pending;
  const r=ui.requests.find(x=>x.route==='/api/admin/products');assert.ok(r);assert.equal(r.status,201);
  assert.equal(r.body.categoria_id,category);assert.equal(r.body.laboratorio_id,lab);
  product=(await f.query('SELECT id,categoria_id,laboratorio_id,empresa_id FROM productos WHERE nombre=$1',['Producto ficticio DOM'])).rows[0];
  assert.equal(product.categoria_id,category);assert.equal(product.laboratorio_id,lab);assert.equal(product.empresa_id,ids.empresaA);
  assert.ok(ui.toasts.some(x=>x.type==='success'));assert.equal(ui.reloads,0);
 });
 await t.test('GET devuelve ambos catálogos y B no los ve ni puede usar referencias ajenas',async()=>{
  const own=await f.request('/api/catalogs',{token:f.tokenA});assert.equal(own.status,200);
  assert.ok(own.data.categorias.some(x=>x.id===category));assert.ok(own.data.laboratorios.some(x=>x.id===lab));
  const other=await f.request('/api/catalogs',{token:f.tokenB});assert.ok(!other.data.categorias.some(x=>x.id===category));assert.ok(!other.data.laboratorios.some(x=>x.id===lab));
  const body={...ui.requests.find(x=>x.route==='/api/admin/products').body,sucursal_id:ids.sucursalB,codigo_barras:'9991234567829'};
  assert.equal((await f.request('/api/admin/products',{token:f.tokenB,method:'POST',body})).status,400);
  assert.deepEqual(await f.snapshotB(),beforeB);
 });
 await t.test('401 sin sesión; 403 rol sin permisos; 409 duplicado visible y selector intacto',async()=>{
  assert.equal((await f.request('/api/catalogs/categorias',{method:'POST',body:{nombre:'No autorizado'}})).status,401);
  const original=(await f.query('SELECT rol_id FROM usuario_sucursal WHERE usuario_id=$1 AND sucursal_id=$2',[ids.usuarioA,ids.sucursalA])).rows[0].rol_id;
  const cashier=(await f.query("SELECT id FROM roles WHERE nombre='Cajero / Vendedor'")).rows[0].id;
  await f.query('UPDATE usuario_sucursal SET rol_id=$3 WHERE usuario_id=$1 AND sucursal_id=$2',[ids.usuarioA,ids.sucursalA,cashier]);
  await f.query('UPDATE usuario_sucursal SET rol_id=$2 WHERE usuario_id=$1',[ids.usuarioA,cashier]);
  try{assert.equal((await f.request('/api/catalogs/laboratorios',{token:f.tokenA,method:'POST',body:{nombre:'No autorizado'}})).status,403);}
  finally{await f.query('UPDATE usuario_sucursal SET rol_id=$2 WHERE usuario_id=$1',[ids.usuarioA,original]);}
  await ui.clickAndCreate('paCategoryNew','Categoría ficticia DOM');
  assert.equal(ui.requests.at(-1).status,409);assert.match(el('paStatus').textContent,/Ya existe/);
  assert.equal(el('paCategory').value,category);assert.equal(el('paCategory').options.length,1);assert.equal(ui.reloads,0);
 });
});
