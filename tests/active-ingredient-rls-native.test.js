import test from 'node:test';import assert from 'node:assert/strict';
import {createProfitNativeCluster} from './helpers/profit-native-cluster.js';
import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';
import {readFileSync,readdirSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import pg from 'pg';import bcrypt from 'bcryptjs';import net from 'node:net';
import {planGlobalRLS} from '../server/scripts/global-rls.js';
const run=promisify(execFile),SECRET='FAKE_NATIVE_PROFIT_SESSION_ONLY_000000000000',PASS='FAKE_NATIVE_PROFIT_PASSWORD_ONLY';
test('Principio activo Linux: servidor real con RLS global y catálogo de 10000 productos',{skip:process.platform!=='linux'||process.env.EDUXFAC_PROFIT_NATIVE!=='yes'},async t=>{
 const n=await createProfitNativeCluster();let db,server;
 t.after(async()=>{if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}if(db)await db.end();await n.close();});
 const roles={tenant:'profit_app',auth:'profit_auth',service:'profit_service',migrator:'profit_migrator',backup:'profit_backup'};
 for(const role of Object.values(roles))await n.query('CREATE ROLE '+role+' LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
 const dbName='web_f10_profit_native';await n.query('CREATE DATABASE '+dbName+' OWNER '+roles.migrator+' TEMPLATE template0');
 const url=role=>'postgresql://'+role+'@127.0.0.1:'+n.port+'/'+dbName;
 db=new pg.Pool({connectionString:url(roles.migrator),max:6,options:'-c statement_timeout=15000'});
 await db.query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
 await run(process.execPath,['server/scripts/migrate.js'],{env:{...process.env,NODE_ENV:'test',DATABASE_URL:url(roles.migrator),WEB_RLS_ENABLED:'false',WEB_RLS_PROFILE:'',SESSION_SECRET:SECRET},timeout:60000,maxBuffer:1024*1024});
 for(const file of readdirSync(new URL('../database/migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())await db.query(readFileSync(new URL('../database/migrations/'+file,import.meta.url),'utf8'));
 await db.query('CREATE TABLE IF NOT EXISTS web_schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
 const plan=await planGlobalRLS(db,{...roles,dataMode:'DEMO'});
 await db.query('BEGIN');try{for(const sql of plan.statements)await db.query(sql);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}
 const A=randomUUID(),B=randomUUID(),branchA=randomUUID(),branchB=randomUUID(),admin=randomUUID(),cashier=randomUUID(),other=randomUUID(),hash=await bcrypt.hash(PASS,4);
 const adminRole=(await db.query("SELECT id FROM roles WHERE nombre='Administrador'")).rows[0].id,cashRole=(await db.query("SELECT id FROM roles WHERE nombre='Cajero / Vendedor'")).rows[0].id;
 for(const[id,branch,label,ruc]of [[A,branchA,'PROFIT-A','20900123011'],[B,branchB,'PROFIT-B','20900123012']]){
  await db.query('INSERT INTO empresas(id,razon_social,empresa_codigo,ruc) VALUES($1,$2,$2,$3)',[id,label,ruc]);
  await db.query("INSERT INTO empresa_acceso(empresa_id,estado,plan_codigo,condiciones_version,limite_sucursales,limite_usuarios,multisucursal,suscripcion_id,estado_suscripcion,version_suscripcion,fecha_inicio,fecha_vencimiento) VALUES($1,'ACTIVO','PROFESIONAL',1,1,5,false,$2,'ACTIVA',1,now()-interval '1 day',now()+interval '1 month')",[id,randomUUID()]);
  await db.query("INSERT INTO sucursales(id,empresa_id,codigo,nombre) VALUES($1,$2,'PRINCIPAL','PRINCIPAL')",[branch,id]);
 }
 for(const[id,company,branch,username,role]of [[admin,A,branchA,'native_admin',adminRole],[cashier,A,branchA,'native_cashier',cashRole],[other,B,branchB,'native_other',adminRole]]){
  await db.query('INSERT INTO usuarios(id,empresa_id,nombre,usuario,password_hash) VALUES($1,$2,$3,$3,$4)',[id,company,username,hash]);
  await db.query('INSERT INTO usuario_sucursal(usuario_id,sucursal_id,rol_id) VALUES($1,$2,$3)',[id,branch,role]);
 }
 const p=randomUUID(),unknown=randomUUID(),racing=randomUUID(),bProduct=randomUUID();
 for(const[id,company,branch,code,cost]of [[p,A,branchA,'PROFIT-KNOWN',10],[unknown,A,branchA,'PROFIT-UNKNOWN',0],[racing,A,branchA,'PROFIT-RACING',1],[bProduct,B,branchB,'PROFIT-B',1]]){
  await db.query("INSERT INTO productos(id,empresa_id,codigo_interno,nombre,unidad_medida) VALUES($1,$2,$3,$3,'UNIDAD')",[id,company,code]);
  await db.query("INSERT INTO producto_sucursal(producto_id,sucursal_id,origen) VALUES($1,$2,'operacion')",[id,branch]);
  await db.query('INSERT INTO lotes(producto_id,sucursal_id,numero_lote,costo_unitario,cantidad_inicial,cantidad_disponible,fecha_vencimiento) VALUES($1,$2,$3,$4,$5,$5,$6)',[id,branch,'L-'+code,cost,id===racing?1:100,'2030-01-01']);
  for(const[kind,factor]of [['UNIDAD',1],['BLISTER',6],['CAJA',12]])await db.query('INSERT INTO precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta) VALUES($1,$2,$3,$4,$5)',[id,branch,kind,factor,cost*factor+1]);
 }
 await db.query("INSERT INTO lotes(producto_id,sucursal_id,numero_lote,costo_unitario,cantidad_inicial,cantidad_disponible,fecha_vencimiento) VALUES($1,$2,'RACE-EXPENSIVE',10,1,1,'2030-02-01')",[racing,branchA]);
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 let errors='';
 server=spawn(process.execPath,['server/start.mjs'],{env:{...process.env,NODE_ENV:'production',EDUXFAC_DATA_MODE:'DEMO',PORT:String(port),DATABASE_URL:url(roles.tenant),WEB_AUTH_DATABASE_URL:url(roles.auth),WEB_SERVICE_DATABASE_URL:url(roles.service),WEB_RLS_ENABLED:'true',WEB_RLS_PROFILE:'global',WEB_PG_TLS:'',SESSION_SECRET:SECRET,PANEL_WEB_SERVICE_SECRET:SECRET,PANEL_WEB_SERVICE_ISSUER:'native-profit',PANEL_WEB_SERVICE_AUDIENCE:'native-profit',EXPIRATION_WORKER_ENABLED:'false',EDUXFAC_SUBSCRIPTION_WORKER_ALLOW_MUTATION:'no'},stdio:['ignore','pipe','pipe']});
 server.stderr.on('data',b=>{errors+=b.toString();});server.stdout.resume();
 const base='http://127.0.0.1:'+port;
 const request=async(route,{token,method='GET',body}={})=>{const response=await fetch(base+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:await response.json()};};
 let ready=false;for(let i=0;i<120;i++){try{ready=(await request('/api/health')).status===200;if(ready)break;}catch{}if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,50));}
 assert.ok(ready,'Servidor RLS no inició: '+errors);
 const login=async(username,company)=>{const r=await request('/api/auth/login',{method:'POST',body:{usuario:username,password:PASS,empresa_codigo:company}});assert.equal(r.status,200,JSON.stringify(r.data));return r.data.token;};
 const tokenA=await login('native_admin','PROFIT-A'),tokenCash=await login('native_cashier','PROFIT-A'),tokenB=await login('native_other','PROFIT-B');

 await db.query("UPDATE productos SET nombre='APRONAX 550MG',principio_activo='NAPROXENO SÓDICO',codigo_interno='APR-550',codigo_anterior='APR-OLD',codigo_barras='7751234567890' WHERE id=$1",[p]);
 await db.query("UPDATE productos SET principio_activo='NAPROXENO SÓDICO' WHERE id=$1",[bProduct]);
 await db.query("UPDATE empresa_acceso SET multisucursal=true,limite_sucursales=NULL WHERE empresa_id=$1",[A]);
 const alt=randomUUID(),branch2=randomUUID(),only2=randomUUID();
 await db.query("INSERT INTO sucursales(id,empresa_id,codigo,nombre) VALUES($1,$2,'SEGUNDA','SEGUNDA')",[branch2,A]);
 for(const[id,branch,name]of [[alt,branchA,'Otra marca naproxeno'],[only2,branch2,'Exclusivo segunda']]){
  await db.query("INSERT INTO productos(id,empresa_id,codigo_interno,nombre,principio_activo) VALUES($1,$2,$3,$4,'NAPROXENO SÓDICO')",[id,A,'S-'+id,name]);
  await db.query("INSERT INTO producto_sucursal(producto_id,sucursal_id,origen) VALUES($1,$2,'operacion')",[id,branch]);
 }
 const search=(term,token=tokenA,branch=branchA,extra='')=>request('/api/products?sucursal_id='+branch+'&q='+encodeURIComponent(term)+'&search_scope=ventas&limit=30'+extra,{token});
 await t.test('44 tablas FORCE RLS y rol tenant sin BYPASS/superusuario',async()=>{
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity AND relforcerowsecurity")).rows[0].n,44);
  const role=(await db.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[roles.tenant])).rows[0];assert.equal(role.rolsuper,false);assert.equal(role.rolbypassrls,false);
 });
 for(const term of ['APRONAX','NAPROXENO','naproxeno','NaPrO','naproxeno sódico','sódico','SÓDICO','SóDiCo','APR-550','APR-OLD','7751234567890']){
  await t.test('búsqueda nativa '+term,async()=>{const x=await search(term);assert.equal(x.status,200);assert.ok(x.data.some(x=>x.id===p),JSON.stringify(x.data));});
 }
 await t.test('principio compartido completo y sin otras empresas/sucursales',async()=>{
  const x=await search('NAPROXENO');assert.deepEqual(new Set(x.data.map(x=>x.id)),new Set([p,alt]));
  const y=await search('NAPROXENO',tokenB,branchB);assert.equal(y.status,200);assert.deepEqual(y.data.map(x=>x.id),[bProduct]);
 });
 await t.test('cajero usa mismo aislamiento y puede buscar principio',async()=>{const x=await search('NAPROXENO',tokenCash);assert.equal(x.status,200);assert.equal(x.data.length,2);});
 await t.test('sucursal B y sucursal no asignada A2 rechazadas',async()=>{
  assert.equal((await search('NAPROXENO',tokenA,branchB)).status,403);
  assert.equal((await search('NAPROXENO',tokenA,branch2)).status,403);
 });
 await t.test('nulo en principio mantiene producto disponible por código',async()=>{const x=await search('PROFIT-UNKNOWN');assert.equal(x.status,200);assert.equal(x.data[0].id,unknown);});
 await t.test('inyección no evita RLS ni modifica tablas',async()=>{const x=await search("' OR TRUE --");assert.equal(x.status,200);assert.equal(x.data.length,0);});
 await t.test('otros módulos mantienen búsqueda previa',async()=>{const x=await request('/api/products?sucursal_id='+branchA+'&q='+encodeURIComponent('SÓDICO'),{token:tokenA});assert.equal(x.status,200);assert.equal(x.data.length,0);});
 await t.test('catálogo 10000: páginas acotadas, todos accesibles y rendimiento',async()=>{
  await db.query("INSERT INTO productos(empresa_id,codigo_interno,nombre,principio_activo) SELECT $1,'BENCH-'||n,'Producto benchmark '||lpad(n::text,5,'0'),CASE WHEN n<=65 THEN 'NAPROXENO SÓDICO' ELSE 'INGREDIENTE DIFERENTE' END FROM generate_series(1,10000) n",[A]);
  await db.query("INSERT INTO producto_sucursal(producto_id,sucursal_id,origen) SELECT id,$1,'operacion' FROM productos WHERE empresa_id=$2 AND codigo_interno LIKE 'BENCH-%'",[branchA,A]);
  await db.query('ANALYZE productos');await db.query('ANALYZE producto_sucursal');
  const all=[],durations=[];
  for(const offset of [0,30,60]){const start=performance.now();const x=await search('NAPROXENO',tokenA,branchA,'&offset='+offset);durations.push(performance.now()-start);assert.equal(x.status,200);all.push(...x.data);}
  assert.equal(all.length,67);assert.equal(new Set(all.map(x=>x.id)).size,67);
  for(let i=0;i<5;i++){const start=performance.now();const x=await search('NAPRO',tokenA,branchA);durations.push(performance.now()-start);assert.equal(x.status,200);assert.equal(x.data.length,30);}
  durations.sort((a,b)=>a-b);const stats={catalog_products:10000,matched:67,page:30,samples:durations.length,median_ms:+durations[Math.floor(durations.length/2)].toFixed(2),max_ms:+durations.at(-1).toFixed(2)};
  console.log('SEARCH_NATIVE_PERFORMANCE '+JSON.stringify(stats));assert.ok(stats.max_ms<3000,'Latency exceeds 3s lab budget');
 });
 await t.test('búsqueda no altera existencias, precios, caja o históricos',async()=>{
  const snapshot=async()=>{const out={};for(const table of ['lotes','precios_producto','ventas','venta_detalles','compras','compra_detalles','movimientos_inventario','movimientos_caja','sesiones_caja'])out[table]=(await db.query('SELECT * FROM '+table)).rows;return out;};
  const before=await snapshot();await search('NAPROXENO');await search('APR-OLD');assert.deepEqual(await snapshot(),before);
 });
});
