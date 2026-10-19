import test from 'node:test';import assert from 'node:assert/strict';
import {createProfitNativeCluster} from './helpers/profit-native-cluster.js';
import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';
import {readFileSync,readdirSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import pg from 'pg';import bcrypt from 'bcryptjs';import net from 'node:net';
import {planGlobalRLS} from '../server/scripts/global-rls.js';
const run=promisify(execFile),SECRET='FAKE_NATIVE_PROFIT_SESSION_ONLY_000000000000',PASS='FAKE_NATIVE_PROFIT_PASSWORD_ONLY';
test('Rentabilidad Linux: servidor sin adaptador, roles mínimos y 44 FORCE RLS',{skip:process.platform!=='linux'||process.env.EDUXFAC_PROFIT_NATIVE!=='yes'},async t=>{
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
 const cashA=(await request('/api/cash/open',{token:tokenA,method:'POST',body:{sucursal_id:branchA,monto_apertura:100}})).data;
 const cashC=(await request('/api/cash/open',{token:tokenCash,method:'POST',body:{sucursal_id:branchA,monto_apertura:100}})).data;
 const item=(id,price,factor=1,kind='UNIDAD')=>({producto_id:id,precio_unitario:price,cantidad:1,factor_unidades:factor,tipo_venta:kind});
 const sale=(items,discount=0,token=tokenA,cash=cashA)=>request('/api/sales',{token,method:'POST',body:{sucursal_id:branchA,sesion_caja_id:cash.id,items,descuento:discount,pagos:[{metodo:'Efectivo',monto:items.reduce((s,x)=>s+x.precio_unitario*x.cantidad,0)-discount}]}});
 const snapshot=async()=>{const out={};for(const table of ['ventas','venta_detalles','venta_pagos','lotes','producto_sucursal','movimientos_inventario','movimientos_caja','sesiones_caja','auditoria'])out[table]=(await db.query('SELECT * FROM '+table)).rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return out;};
 await t.test('49 tablas, 44 FORCE RLS y roles runtime sin superusuario/BYPASS/ownership',async()=>{
  const flags=(await db.query("SELECT count(*)::int tables,count(*) FILTER(WHERE relrowsecurity AND relforcerowsecurity)::int force FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'")).rows[0];assert.equal(flags.tables,49);assert.equal(flags.force,44);
  const runtime=(await db.query('SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=ANY($1)',[[roles.tenant,roles.auth,roles.service]])).rows;assert.ok(runtime.every(r=>!r.rolsuper&&!r.rolbypassrls));
  assert.equal((await request('/api/health')).data.data_mode,'DEMO');
 });
 let positive;
 await t.test('venta positiva RLS: stock/caja/utilidad exactos',async()=>{
  positive=await sale([item(p,11)]);assert.equal(positive.status,201,JSON.stringify(positive.data));
  const q=(await db.query('SELECT vd.importe_neto-vd.cantidad_base*l.costo_unitario pnl,l.cantidad_disponible FROM venta_detalles vd JOIN lotes l ON l.id=vd.lote_id WHERE vd.venta_id=$1',[positive.data.id])).rows[0];assert.equal(Number(q.pnl),1);assert.equal(Number(q.cantidad_disponible),99);
  assert.equal(Number((await db.query("SELECT sum(monto) amount FROM movimientos_caja WHERE sesion_caja_id=$1 AND tipo='INGRESO'",[cashA.id])).rows[0].amount),11);
 });
 for(const[name,items,discount,code]of [
  ['utilidad cero',[item(p,10)],0,'VENTA_SIN_RENTABILIDAD'],
  ['utilidad negativa',[item(p,9)],0,'VENTA_SIN_RENTABILIDAD'],
  ['carrito mixto',[item(p,30),item(p,9)],0,'VENTA_SIN_RENTABILIDAD'],
  ['descuento neto',[item(p,11)],1,'VENTA_SIN_RENTABILIDAD'],
  ['costo no verificable',[item(unknown,20)],0,'VENTA_COSTO_NO_VERIFICABLE'],
  ['BLISTER',[item(p,60,6,'BLISTER')],0,'VENTA_SIN_RENTABILIDAD'],
  ['CAJA',[item(p,120,12,'CAJA')],0,'VENTA_SIN_RENTABILIDAD']]){
  await t.test(name+' bloqueado con RLS y rollback',async()=>{const before=await snapshot(),r=await sale(items,discount);assert.equal(r.status,422,JSON.stringify(r.data));assert.equal(r.data.code,code);assert.deepEqual(await snapshot(),before);});
 }
 await t.test('cajero tampoco tiene excepción',async()=>{const before=await snapshot(),r=await sale([item(p,10)],0,tokenCash,cashC);assert.equal(r.status,422,JSON.stringify(r.data));assert.deepEqual(await snapshot(),before);});
 await t.test('equivalencia manipulada y empresa/sucursal B: sin bypass RLS',async()=>{
  const before=await snapshot();assert.equal((await sale([item(p,1,0.1,'CAJA')])).status,400);
  const mismatch=await request('/api/sales',{token:tokenA,method:'POST',body:{empresa_id:B,sucursal_id:branchA,items:[item(p,11)],pagos:[{metodo:'Efectivo',monto:11}]}});
  assert.equal(mismatch.status,403);
  assert.equal((await request('/api/products?sucursal_id='+branchB,{token:tokenA})).status,403);
  assert.ok(!(await request('/api/products?sucursal_id='+branchA,{token:tokenA})).data.some(x=>x.id===bProduct));
  assert.deepEqual(await snapshot(),before);
 });
 await t.test('SQL directo tenant no puede leer/escribir B y el contexto se limpia',async()=>{
  const client=new pg.Client({connectionString:url(roles.tenant)});await client.connect();
  try{
   await client.query('BEGIN');
   await client.query("SELECT set_config('app.empresa_id',$1,true),set_config('app.sucursal_ids',$2,true)",[A,branchA]);
   assert.equal((await client.query('SELECT id FROM productos WHERE id=$1',[bProduct])).rowCount,0);
   await client.query('SAVEPOINT denied');
   await assert.rejects(()=>client.query('INSERT INTO categorias(empresa_id,nombre) VALUES($1,$2)',[B,'No autorizado ficticio']),e=>e.code==='42501');
   await client.query('ROLLBACK TO SAVEPOINT denied');await client.query('ROLLBACK');
   assert.equal((await client.query("SELECT nullif(current_setting('app.empresa_id',true),'') tenant")).rows[0].tenant,null);
  }finally{await client.end();}
 });
 await t.test('concurrencia RLS: dos requests, una venta rentable y un rollback',async()=>{
  const results=await Promise.all([sale([item(racing,5)]),sale([item(racing,5)])]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,422],JSON.stringify(results));
  const rows=(await db.query('SELECT costo_unitario,cantidad_disponible FROM lotes WHERE producto_id=$1 ORDER BY costo_unitario',[racing])).rows;
  assert.deepEqual(rows.map(x=>[Number(x.costo_unitario),Number(x.cantidad_disponible)]),[[1,0],[10,1]]);
 });
 await t.test('compras normales siguen operativas bajo RLS',async()=>{
  const provider=(await request('/api/admin/suppliers',{token:tokenA,method:'POST',body:{razon_social:'Proveedor ficticio RLS',ruc:'20909999991'}})).data;
  assert.ok(provider.id);
  const r=await request('/api/purchases',{token:tokenA,method:'POST',body:{sucursal_id:branchA,proveedor_id:provider.id,tipo_documento:'FACTURA',serie:'F001',numero:'NATIVE',fecha:'2026-10-13',tipo_compra:'Mercadería',moneda:'PEN',items:[{producto_id:p,cantidad:2,costo_unitario:10,numero_lote:'PURCHASE-NATIVE',precio_venta:11}]}});
  assert.equal(r.status,201,JSON.stringify(r.data));
 });
 await t.test('anulación RLS del ticket positivo sigue funcionando',async()=>{
  const r=await request('/api/sales/'+positive.data.id+'/return',{token:tokenA,method:'POST',body:{tipo:'TOTAL',motivo:'Prueba ficticia RLS',metodo_reembolso:'Efectivo',sesion_caja_id:cashA.id}});
  assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.estado_venta,'ANULADA');
 });
});
