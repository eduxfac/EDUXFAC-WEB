import test from 'node:test';import assert from 'node:assert/strict';
import {createProfitNativeCluster} from './helpers/profit-native-cluster.js';
import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';
import {readFileSync,readdirSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import {monthlyChecks} from './helpers/monthly-sales-checks.js';
import pg from 'pg';import bcrypt from 'bcryptjs';import net from 'node:net';
import {planGlobalRLS} from '../server/scripts/global-rls.js';
const run=promisify(execFile),SECRET='FAKE_NATIVE_PROFIT_SESSION_ONLY_000000000000',PASS='FAKE_NATIVE_PROFIT_PASSWORD_ONLY';
test('Ventas mensuales PostgreSQL nativo: 44 FORCE RLS',{skip:process.platform!=='linux'||process.env.EDUXFAC_PROFIT_NATIVE!=='yes'},async t=>{
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
  await db.query("INSERT INTO empresa_acceso(empresa_id,estado,plan_codigo,condiciones_version,limite_sucursales,limite_usuarios,multisucursal,suscripcion_id,estado_suscripcion,version_suscripcion,fecha_inicio,fecha_vencimiento) VALUES($1,'ACTIVO','PROFESIONAL',1,2,5,false,$2,'ACTIVA',1,now()-interval '1 day',now()+interval '1 month')",[id,randomUUID()]);
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



 const ids={empresaA:A,empresaB:B,sucursalA:branchA,sucursalB:branchB,usuarioA:admin,usuarioB:other};
 const explain=async(sql,args)=>{const c=new pg.Client({connectionString:url(roles.tenant),options:'-c statement_timeout=15000'});await c.connect();try{await c.query('BEGIN READ ONLY');const branches=(await db.query('select id from sucursales where empresa_id=$1',[A])).rows.map(x=>x.id);await c.query("select set_config('app.empresa_id',$1,true),set_config('app.usuario_id',$2,true),set_config('app.sucursal_ids',$3,true)",[A,admin,branches.join(',')]);const r=await c.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,args);await c.query('ROLLBACK');return r.rows[0]['QUERY PLAN'];}finally{await c.end()}};
 await t.test('44 FORCE RLS al iniciar',async()=>assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and relforcerowsecurity")).rows[0].n,44));
 await monthlyChecks(t,{query:db.query.bind(db),request,base,tokenA,tokenB,explain},ids,{native:true});
 await t.test('44 FORCE RLS intactas al terminar',async()=>assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and relforcerowsecurity")).rows[0].n,44));
});
