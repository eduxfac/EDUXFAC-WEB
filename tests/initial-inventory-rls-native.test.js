import {initialCostChecks} from './helpers/initial-cost-checks.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {createProfitNativeCluster} from './helpers/profit-native-cluster.js';
import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';
import {readFileSync,readdirSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';import {INITIAL_COLUMNS} from '../server/src/initial-inventory.js';
import pg from 'pg';import bcrypt from 'bcryptjs';import net from 'node:net';
import {planGlobalRLS} from '../server/scripts/global-rls.js';
const run=promisify(execFile),SECRET='FAKE_NATIVE_PROFIT_SESSION_ONLY_000000000000',PASS='FAKE_NATIVE_PROFIT_PASSWORD_ONLY';
test('Inventario inicial Linux: servidor real, permisos mínimos y 44 FORCE RLS',{skip:process.platform!=='linux'||process.env.EDUXFAC_PROFIT_NATIVE!=='yes'},async t=>{
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

 const row=(code='INI-NATIVE')=>({codigo_interno:code,nombre:'Producto '+code,unidad_medida:'UNIDAD',stock:50,stock_minimo:0,costo:1.57,precio:2,lote:'A',vencimiento:'29/10/2026'});
 const book=async(rows)=>{const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Inventario inicial');ws.addRow(INITIAL_COLUMNS.map(c=>c[1]));for(const r of rows)ws.addRow(INITIAL_COLUMNS.map(c=>r[c[0]]??null));return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');};
 const post=async(mode,body,token=tokenA)=>request('/api/import/inventory/'+mode,{token,method:'POST',body:{sucursal_id:branchA,...body}});
 const importRows=async(rows)=>{const file_base64=await book(rows),p=await post('preview',{file_base64});assert.equal(p.status,200,JSON.stringify(p));return post('commit',{file_base64,preview_sha256:p.data.sha256});};
 const snapshot=async()=>{const out={};for(const table of ['productos','producto_sucursal','lotes','precios_producto','movimientos_inventario','compras','compra_detalles','ventas','venta_detalles','auditoria'])out[table]=(await db.query('SELECT * FROM '+table)).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return out;};
 await t.test('44 tablas FORCE RLS intactas',async()=>assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and relrowsecurity and relforcerowsecurity")).rows[0].n,44));
 await t.test('API real crea un producto y dos lotes, valorización diferenciada',async()=>{const r=row(),c=await importRows([r,{...r,lote:'B',costo:1.65,vencimiento:'29/11/2026'}]);assert.equal(c.status,201,JSON.stringify(c));assert.equal(c.data.creados,1);assert.equal(c.data.lotes_creados,2);assert.equal(c.data.valor_total,161);assert.equal(Number((await db.query('select sum(l.cantidad_disponible*l.costo_unitario)::numeric value,sum(l.cantidad_disponible)::numeric stock from lotes l join productos p on p.id=l.producto_id where p.codigo_interno=$1',[r.codigo_interno])).rows[0].value),161);});
 await t.test('sin lote conserva null, costo y stock; no crea compra',async()=>{const c=await importRows([{...row('INI-NULL'),lote:'',vencimiento:''}]);assert.equal(c.status,201,JSON.stringify(c));const l=(await db.query('select l.* from lotes l join productos p on p.id=l.producto_id where p.codigo_interno=$1',['INI-NULL'])).rows[0];assert.equal(l.numero_lote,null);assert.equal(l.fecha_vencimiento,null);assert.equal(Number(l.costo_unitario),1.57);assert.equal((await db.query('select count(*)::int n from compras')).rows[0].n,0);});
 await t.test('sucursal de B rechazada y B no ve productos A',async()=>{const file_base64=await book([row('INI-ISOLATION')]),snap=await snapshot();assert.equal((await post('commit',{file_base64,preview_sha256:'fake',sucursal_id:branchB})).status,403);assert.equal((await post('preview',{file_base64},tokenB)).status,403);assert.deepEqual(await snapshot(),snap);const other=await request('/api/products?search=INI-NATIVE&sucursal_id='+branchB,{token:tokenB});assert.equal(other.status,200);assert.ok(!JSON.stringify(other.data).includes('INI-NATIVE'));});
 await t.test('rol vendedor no importa, no hay excepción administrativa por API',async()=>{const snap=await snapshot();assert.equal((await post('preview',{file_base64:await book([row('INI-DENIED')])},tokenCash)).status,403);assert.deepEqual(await snapshot(),snap);});
 await t.test('rollback completo si una fila contiene error',async()=>{const snap=await snapshot();assert.equal((await importRows([row('INI-ROLLBACK1'),{...row('INI-ROLLBACK2'),costo:''}])).status,400);assert.deepEqual(await snapshot(),snap);});
 await t.test('fallo SQL tras primer lote revierte toda la transacción',async()=>{await db.query("CREATE FUNCTION initial_native_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.numero_lote='FAIL-TEST' THEN RAISE EXCEPTION 'FAKE_TEST_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER initial_failure BEFORE INSERT ON lotes FOR EACH ROW EXECUTE FUNCTION initial_native_fail()");const snap=await snapshot();try{const c=await importRows([row('INI-SQL1'),{...row('INI-SQL2'),lote:'FAIL-TEST'}]);assert.equal(c.status,400);assert.deepEqual(await snapshot(),snap);}finally{await db.query('DROP TRIGGER initial_failure ON lotes; DROP FUNCTION initial_native_fail()');}});
 await t.test('dos confirmaciones concurrentes: una aplicada, una rechazada sin duplicado',async()=>{const r=row('INI-CONCURRENT'),file_base64=await book([r]),p=await post('preview',{file_base64});const result=await Promise.all([post('commit',{file_base64,preview_sha256:p.data.sha256}),post('commit',{file_base64,preview_sha256:p.data.sha256})]);assert.deepEqual(result.map(x=>x.status).sort(),[201,400]);assert.equal((await db.query('select count(*)::int n from productos where codigo_interno=$1',[r.codigo_interno])).rows[0].n,1);assert.equal(Number((await db.query('select sum(l.cantidad_disponible) n from lotes l join productos p on p.id=l.producto_id where p.codigo_interno=$1',[r.codigo_interno])).rows[0].n),50);});
 await initialCostChecks(t,{base,query:db.query.bind(db),request,tokenA,tokenB,connect:()=>db.connect()},{empresaA:A,empresaB:B,sucursalA:branchA,sucursalB:branchB},{native:true});
 await t.test('5.000 productos / lotes: transacción completa y rendimiento nativo',async()=>{const rows=Array.from({length:5000},(_,i)=>({...row('PERF-'+i),stock:1})),start=performance.now(),c=await importRows(rows);assert.equal(c.status,201,JSON.stringify(c));assert.equal(c.data.creados,5000);assert.equal(c.data.lotes_creados,5000);assert.equal(c.data.valor_total,7850);console.log('PERFORMANCE_NATIVE_5000_MS='+Math.round(performance.now()-start));});
 await t.test('RLS sigue forzado y runtime no obtiene BYPASS',async()=>{assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and relforcerowsecurity")).rows[0].n,44);assert.ok((await db.query("select rolsuper,rolbypassrls from pg_roles where rolname=$1",[roles.tenant])).rows.every(r=>!r.rolsuper&&!r.rolbypassrls));});

});
