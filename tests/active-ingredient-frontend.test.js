import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
function ui(api){
 const elements=new Map(),context={state:{products:[],branchId:'A'},api,document:{querySelectorAll:()=>[]},esc:String,money:x=>String(x),stockHtml:String,rememberProducts(){},add(){},setTimeout};
 context.$=id=>{if(!elements.has(id)){const classes=new Set();elements.set(id,{value:'',innerHTML:'',textContent:'',firstElementChild:{textContent:''},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,v)=>v?classes.add(x):classes.delete(x),contains:x=>classes.has(x)}});}return elements.get(id);};
 vm.createContext(context);vm.runInContext('let saleSearchRequest=0,saleSearchHasMore=false,saleSearchLoading=false,saleSearchOffset=0,saleSearchTerm="",saleSearchBranch=null;\n'+html.slice(html.indexOf('function renderProducts(){'),html.indexOf('let inventoryAllRows=[];')),context);
 return {c:context,el:context.$};
}
const rows=(start,count)=>Array.from({length:count},(_,i)=>({id:String(start+i),nombre:'APRONAX '+(start+i),codigo_interno:'P'+(start+i)}));
test('Frontend: placeholder exacto y scripts compilan',()=>{
 assert.match(html,/placeholder="Buscar por nombre, principio activo, código interno o código de barras\.\.\."/);
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
});
test('Frontend: muestra los 30 resultados y luego todas las páginas',async()=>{
 const urls=[];const f=ui(async url=>{urls.push(url);const n=Number(new URL('http://local'+url).searchParams.get('offset'));return n===0?rows(0,30):rows(30,15);});
 f.el('search').value='NAPROXENO';await f.c.loadProducts();assert.equal((f.el('productRows').innerHTML.match(/data-row-add=/g)||[]).length,30);
 assert.equal(f.el('saleSearchMore').classList.contains('hidden'),false);
 await f.c.loadMoreSalesProducts();assert.equal(f.c.state.products.length,45);assert.equal((f.el('productRows').innerHTML.match(/data-row-add=/g)||[]).length,45);
 assert.equal(f.el('saleSearchMore').classList.contains('hidden'),true);assert.match(urls[0],/search_scope=ventas/);assert.match(urls[1],/offset=30/);
});
test('Frontend: respuesta obsoleta de término anterior se descarta',async()=>{
 let resolve;const f=ui(()=>new Promise(r=>resolve=r));f.el('search').value='NAPRO';const p=f.c.loadProducts();f.el('search').value='OTRO';resolve(rows(0,2));await p;assert.equal(f.c.state.products.length,0);
});
test('Frontend: cambiar sucursal descarta respuesta anterior',async()=>{
 let resolve;const f=ui(()=>new Promise(r=>resolve=r));f.el('search').value='NAPRO';const p=f.c.loadProducts();f.c.state.branchId='B';resolve(rows(0,2));await p;assert.equal(f.c.state.products.length,0);
});
test('Frontend: doble clic no duplica requests ni productos',async()=>{
 let n=0,resolve;const f=ui(async()=>{n++;if(n===1)return rows(0,30);return new Promise(r=>resolve=r);});
 f.el('search').value='NAPRO';await f.c.loadProducts();const p=f.c.loadMoreSalesProducts();await f.c.loadMoreSalesProducts();assert.equal(n,2);resolve(rows(25,10));await p;assert.equal(f.c.state.products.length,35);
});
test('Frontend: limpiar elimina resultados y botón; errores visibles sin perder páginas previas',async()=>{
 let n=0;const f=ui(async()=>{if(++n===1)return rows(0,30);throw Error('Error ficticio visible');});
 f.el('search').value='NAPRO';await f.c.loadProducts();await assert.rejects(f.c.loadMoreSalesProducts(),/Error ficticio/);assert.equal(f.c.state.products.length,30);assert.match(f.el('saleStatus').textContent,/Error ficticio/);
 f.el('search').value='';await f.c.loadProducts();assert.equal(f.el('productRows').innerHTML,'');assert.equal(f.el('saleSearchMore').classList.contains('hidden'),true);
});
