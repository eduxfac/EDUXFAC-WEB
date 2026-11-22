import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {frontendPaths} from '../server/src/frontend-routes.js';
import {webIndexHTML,contentSecurityPolicy} from '../server/src/csp-header.js';
const source=readFileSync(new URL('../public/web-router.js',import.meta.url),'utf8');
function browser(path='/reportes',ready=true,permissions={}){
 let url=new URL('https://app.eduxfac.com'+path),index=0;const entries=[url.href],listeners={},shown=[];
 const location={};for(const key of ['pathname','search','hash'])Object.defineProperty(location,key,{get:()=>url[key]});
 const window={history:{pushState(_s,_t,path){url=new URL(path,url);entries.splice(++index);entries.push(url.href);},replaceState(_s,_t,path){url=new URL(path,url);entries[index]=url.href;}},addEventListener:(type,fn)=>listeners[type]=fn};
 vm.runInNewContext(source,{window,location});
 const router=window.createWebRouter({show:async module=>shown.push(module),isReady:()=>ready,can:module=>permissions[module]!=='denied'});
 return {router,location,shown,login:()=>ready=true,back:async()=>{url=new URL(entries[--index]);listeners.popstate();await Promise.resolve();},forward:async()=>{url=new URL(entries[++index]);listeners.popstate();await Promise.resolve();}};
}
test('Reportes conserva su modulo al recargar y al iniciar sesion desde enlace directo',async()=>{
 const b=browser('/reportes',false);await b.router.restore();assert.deepEqual(b.shown,[]);assert.equal(b.location.pathname,'/reportes');
 b.login();await b.router.restore();assert.deepEqual(b.shown,['reports']);
 await b.router.navigate('inventory');assert.equal(b.location.pathname,'/inventario');
 const reload=browser(b.location.pathname);await reload.router.restore();assert.deepEqual(reload.shown,['inventory']);
 await b.back();assert.equal(b.location.pathname,'/reportes');assert.equal(b.shown.at(-1),'reports');
 await b.forward();assert.equal(b.shown.at(-1),'inventory');
});
test('Cada modulo tiene ruta servida por el backend y las rutas respetan permisos',async()=>{
 const b=browser('/reporte');await b.router.restore();assert.equal(b.location.pathname,'/reportes');
 for(const module of ['dashboard','sales','productsAdmin','inventory','purchases','suppliers','customers','cash','alerts','replenishment','transfers','reports','usersAdmin','sunat','settings'])assert.ok(frontendPaths.includes(b.router.href(module)));
 const denied=browser('/usuarios',true,{usersAdmin:'denied'});await denied.router.restore();assert.equal(denied.shown.at(-1),'dashboard');
 assert.equal(await denied.router.navigate('usersAdmin'),false);assert.equal(denied.location.pathname,'/inicio');
 assert.equal(await denied.router.navigate('unknown'),false);
});
test('HTML enlaza el router, compila sus scripts y restaura tanto login como sesion activa',()=>{
 assert.match(webIndexHTML,/src="\/web-router.js"/);
 assert.equal((webIndexHTML.match(/await webRouter\.restore\(\)/g)||[]).length,2);
 for(const match of webIndexHTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
 assert.ok(!contentSecurityPolicy.includes("'unsafe-eval'"));
 assert.doesNotMatch(webIndexHTML,/(?:href|src)="(?:sunat|sidebar)[^/]*\.(?:css|js)/);
});
test('Rutas directas entregan HTML; API exige sesion y no hay fallback para archivos inexistentes',async t=>{
 process.env.NODE_ENV='test';
 const {app}=await import('../server/src/app.js');
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 for(const path of ['/reportes','/reporte','/inventario','/ventas','/productos/']){
  const r=await fetch(base+path);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/html/);assert.match(await r.text(),/src="\/web-router.js"/);
 }
 assert.equal((await fetch(base+'/web-router.js')).status,200);
 assert.equal((await fetch(base+'/api/bootstrap')).status,401);
 for(const path of ['/missing.js','/.env','/ruta-desconocida'])assert.equal((await fetch(base+path)).status,404);
});
