import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import {TEST_SERVICE,TEST_SESSION,PASSWORD} from './isolated-web.js';
const run=promisify(execFile),root=fileURLToPath(new URL('../../',import.meta.url));
const tools=process.platform==='win32'?'C:/Program Files (x86)/EDUXFAC/PostgreSQL/bin':'/usr/lib/postgresql/16/bin';
const nativeName=name=>process.platform==='win32'?name:name.replace('.exe',''); // Solo ejecutables del sistema; jamás sus bases instaladas.
export async function createNativePlanFixture(){
 if(process.env.NODE_ENV!=='test')throw Error('Solo entorno de prueba explícito.');
 for(const name of ['initdb.exe','pg_ctl.exe','postgres.exe'])if(!existsSync(path.join(tools,nativeName(name))))throw Error('Herramientas PostgreSQL nativas no disponibles.');
 const base=path.resolve(root,'tests/.native-fase4'),directory=path.join(base,randomUUID()),data=path.join(directory,'cluster');
 if(!directory.startsWith(base+path.sep)||!(process.platform==='win32'?root.startsWith('D:'):process.env.EDUXFAC_F9_ISOLATED==='yes'&&root.startsWith('/stage/EDUXFAC/')))throw Error('Ruta de prueba debe permanecer en D:.');
 mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,'SOLO_PRUEBAS.json'),JSON.stringify({purpose:'FASE4_ISOLATED_TEST',data}));
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const options={cwd:root,windowsHide:true,timeout:60000,maxBuffer:1024*1024};
 let started=false,server,native;
 async function close(){if(server){await new Promise(r=>server.close(r));server=null;}if(native){await native.end();native=null;}if(started){await run(path.join(tools,nativeName('pg_ctl.exe')),['-D',data,'stop','-m','fast','-w'],options);started=false;}}
 try{
  await run(path.join(tools,nativeName('initdb.exe')),['-D',data,'-A','trust','-U','eduxfac_test','-E','UTF8','--locale=C'],options);
  await run(path.join(tools,nativeName('pg_ctl.exe')),['-D',data,'-l',path.join(directory,'postgres-test.log'),'-w','start','-o','-h 127.0.0.1 -p '+port+(process.platform==='win32'?'':' -k /tmp')+' -F -c max_connections=30 -c shared_buffers=16MB -c autovacuum=off'],options);started=true;
  native=new pg.Pool({host:'127.0.0.1',port,user:'eduxfac_test',database:'postgres',max:12});
  const normal=r=>Array.isArray(r)?r.at(-1):r;
  const query=async(sql,p)=>normal(await native.query(sql,p));
  const adapter={isolatedTestDatabase:true,query,async connect(){const c=await native.connect();return {query:async(sql,p)=>normal(await c.query(sql,p)),release:()=>c.release()};}};
  process.env.SESSION_SECRET=TEST_SESSION;delete process.env.DATABASE_URL;delete process.env.JWT_SECRET;
  process.env.PANEL_WEB_SERVICE_SECRET=TEST_SERVICE;process.env.PANEL_WEB_SERVICE_ISSUER='panel-test';process.env.PANEL_WEB_SERVICE_AUDIENCE='web-admin-test';
  const {installTestDatabase}=await import('../../server/src/db.js');installTestDatabase(adapter);
  await query(readFileSync(path.join(root,'database/schema.sql'),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
  const {app,initializeDatabase}=await import('../../server/src/app.js');await initializeDatabase();
  for(const name of ['001_empresa_acceso','002_alta_clientes_empresas','003_estados_empresa','004_planes_limites'])await query(readFileSync(path.join(root,'database/migrations',name+'.sql'),'utf8'));
  const company=randomUUID(),branch=randomUUID(),user=randomUUID(),role=(await query("select id from roles where nombre='Administrador'")).rows[0].id;
  await query("insert into empresas(id,ruc,razon_social,empresa_codigo) values($1,'20999999991','Empresa nativa aislada','NATIVA-FASE4')",[company]);
  await query("insert into empresa_acceso(empresa_id,estado) values($1,'PENDIENTE')",[company]);
  await query("insert into sucursales(id,empresa_id,codigo,nombre) values($1,$2,'PRINCIPAL','Principal prueba')",[branch,company]);
  await query("insert into usuarios(id,empresa_id,nombre,usuario,password_hash) values($1,$2,'Administrador prueba','admin',$3)",[user,company,await bcrypt.hash(PASSWORD,4)]);
  await query('insert into usuario_sucursal(usuario_id,sucursal_id,rol_id) values($1,$2,$3)',[user,branch,role]);
  // Solo la fixture cambia el estado inicial; todas las pruebas posteriores usan API/SQL reales.
  await query("update empresa_acceso set estado='ACTIVO' where empresa_id=$1",[company]);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
  const request=async(route,{token,method='GET',body}={})=>{const r=await fetch(url+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
  const {createWebApiClient}=await import(pathToFileURL(path.resolve(root,'../../../PANEL EDUXFAC/01_TRABAJO_ACTUAL/PANEL_EDUXFAC_ACTUAL/server/web-api-client.mjs')));
  const panel=createWebApiClient({environment:{NODE_ENV:'test',PANEL_WEB_SERVICE_BASE_URL:url,PANEL_WEB_SERVICE_SECRET:TEST_SERVICE,PANEL_WEB_SERVICE_ISSUER:'panel-test',PANEL_WEB_SERVICE_AUDIENCE:'web-admin-test'}});
  const login=await request('/api/auth/login',{method:'POST',body:{empresa_codigo:'NATIVA-FASE4',usuario:'admin',password:PASSWORD}});
  if(login.status!==200)throw Error('Login aislado no disponible.');
  return {query,connect:()=>native.connect(),request,panel,company,branch,user,role,token:login.data.token,directory,port,close};
 }catch(error){await close();throw error;}
}
