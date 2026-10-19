import test from 'node:test';import assert from 'node:assert/strict';
import {createProfitNativeCluster} from './helpers/profit-native-cluster.js';
import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';
import {readFileSync,readdirSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';import {INITIAL_COLUMNS} from '../server/src/initial-inventory.js';
import pg from 'pg';import bcrypt from 'bcryptjs';import net from 'node:net';
import {planGlobalRLS} from '../server/scripts/global-rls.js';
const run=promisify(execFile),SECRET='FAKE_NATIVE_PROFIT_SESSION_ONLY_000000000000',PASS='FAKE_NATIVE_PROFIT_PASSWORD_ONLY';
test('Conteo físico Excel Linux: exportación e importación con 44 FORCE RLS',{skip:process.platform!=='linux'||process.env.EDUXFAC_PROFIT_NATIVE!=='yes'},async t=>{
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


 const product=randomUUID(),old=randomUUID(),recent=randomUUID(),otherProduct=randomUUID();
 await db.query("insert into productos(id,empresa_id,codigo_interno,nombre,unidad_medida) values($1,$2,'COUNT-NATIVE','Conteo ficticio','UNIDAD'),($3,$4,'COUNT-B','Solo B','UNIDAD')",[product,A,otherProduct,B]);
 await db.query("insert into producto_sucursal(producto_id,sucursal_id,origen) values($1,$2,'operacion'),($3,$4,'operacion')",[product,branchA,otherProduct,branchB]);
 await db.query("insert into lotes(id,producto_id,sucursal_id,numero_lote,cantidad_inicial,cantidad_disponible,costo_unitario) values($1,$2,$3,'OLD',50,50,1.57),($4,$2,$3,'RECENT',50,50,1.65)",[old,product,branchA,recent]);
 await db.query("insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,created_at) values($1,$2,$3,$4,'COMPRA',50,1.57,'2025-01-01'),($1,$2,$3,$5,'COMPRA',50,1.65,'2025-06-01')",[A,branchA,product,old,recent]);
 await db.query("insert into precios_producto(producto_id,sucursal_id,tipo,factor_unidades,precio_venta) values($1,$2,'unidad',1,2)",[product,branchA]);
 const snapshot=async()=>{const out={};for(const table of ['productos','precios_producto','lotes','compras','compra_detalles','ventas','venta_detalles'])out[table]=(await db.query('select * from '+table+' order by 1')).rows;return out;};
 const before=await snapshot();
 async function excel(){const r=await fetch(base+'/api/import/stock-only/template?sucursal_id='+branchA,{headers:{Authorization:'Bearer '+tokenA}});assert.equal(r.status,200);const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(await r.arrayBuffer()));return wb;}
 let wb=await excel();const ws=wb.getWorksheet('Conteo físico');
 await t.test('12 columnas y costo ponderado/ precio correctos con rol tenant real',()=>{assert.equal(ws.columnCount,12);assert.equal(ws.rowCount,2);assert.equal(ws.getCell('A2').value,'COUNT-NATIVE');assert.equal(ws.getCell('J2').value,1.61);assert.equal(ws.getCell('K2').value,2);});
 await t.test('exportación no escribe datos ni concilia costos',async()=>assert.deepEqual(await snapshot(),before));
 await t.test('sucursal empresa B y aislamiento RLS impiden exportación ajena',async()=>{assert.equal((await request('/api/import/stock-only/template?sucursal_id='+branchB,{token:tokenA})).status,403);assert.equal((await request('/api/import/stock-only/template?sucursal_id='+branchA,{token:tokenB})).status,403);});
 const commit=async(book)=>request('/api/import/stock-only/commit',{token:tokenA,method:'POST',body:{sucursal_id:branchA,file_base64:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')}});
 await t.test('J/K manipulados se ignoran; faltante 5 sale del lote más antiguo',async()=>{ws.getCell('E2').value=95;ws.getCell('J2').value=99999;ws.getCell('K2').value=88888;const c=await commit(wb);assert.equal(c.status,201,JSON.stringify(c));const ls=(await db.query('select id,cantidad_disponible,costo_unitario from lotes where producto_id=$1 order by id',[product])).rows;assert.equal(Number(ls.find(l=>l.id===old).cantidad_disponible),45);assert.equal(Number(ls.find(l=>l.id===recent).cantidad_disponible),50);assert.equal(Number(ls.find(l=>l.id===old).costo_unitario),1.57);assert.equal(Number(ls.find(l=>l.id===recent).costo_unitario),1.65);assert.deepEqual((await snapshot()).precios_producto,before.precios_producto);});
 await t.test('sobrante 5 se asigna al último lote real con costo propio',async()=>{wb=await excel();const s=wb.getWorksheet('Conteo físico');s.getCell('E2').value=100;s.getCell('J2').value=999;assert.equal((await commit(wb)).status,201);const ls=(await db.query('select id,cantidad_disponible,costo_unitario from lotes where producto_id=$1 order by id',[product])).rows;assert.equal(Number(ls.find(l=>l.id===recent).cantidad_disponible),55);assert.equal(Number(ls.find(l=>l.id===recent).costo_unitario),1.65);assert.equal(Number(ls.find(l=>l.id===old).costo_unitario),1.57);});
 await t.test('E vacío no ajusta stock ni costos; rechazo explícito sin filas de conteo',async()=>{const book=await excel();const previous=await snapshot();const result=await commit(book);assert.equal(result.status,400);assert.match(result.data.error,/Complete Stock físico/);assert.deepEqual(await snapshot(),previous);});
 await t.test('E=0 permitido con PostgreSQL/RLS; J/K no alteran costos ni precios',async()=>{const book=await excel(),sheet=book.getWorksheet('Conteo físico');sheet.getCell('E2').value=0;sheet.getCell('J2').value=777;sheet.getCell('K2').value=888;const previous=await snapshot();const result=await commit(book);assert.equal(result.status,201,JSON.stringify(result));const now=await snapshot();assert.equal(now.lotes.filter(l=>l.producto_id===product).reduce((n,l)=>n+Number(l.cantidad_disponible),0),0);for(const l of previous.lotes)assert.equal(now.lotes.find(x=>x.id===l.id).costo_unitario,l.costo_unitario);assert.deepEqual(now.precios_producto,previous.precios_producto);});
 await t.test('44 FORCE RLS, precios/compras/ventas históricos sin cambios',async()=>{assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and relforcerowsecurity")).rows[0].n,44);const now=await snapshot();for(const k of ['productos','precios_producto','compras','compra_detalles','ventas','venta_detalles'])assert.deepEqual(now[k],before[k]);});
});
