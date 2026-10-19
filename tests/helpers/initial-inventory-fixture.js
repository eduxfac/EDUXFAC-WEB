import {PGlite} from '@electric-sql/pglite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
export const TEST_SESSION='FAKE_TEST_ONLY_WEB_SESSION_0000000000000000';
export const TEST_SERVICE='FAKE_TEST_ONLY_PANEL_SERVICE_111111111111111';
export const PASSWORD='FAKE_PASSWORD_ONLY_FOR_ISOLATED_TESTS';
export const ids={};for(const name of ['empresaA','empresaB','usuarioA','usuarioB','sucursalA','sucursalA2','sucursalB','productoA','productoB','solicitudB'])ids[name]=randomUUID();
export function serviceToken(scopes=['health:read','empresas:read','empresas:suspender','empresas:reactivar'],extra={}){
 return jwt.sign({type:'panel_service',scopes,...extra},TEST_SERVICE,{algorithm:'HS256',issuer:'panel-test',audience:'web-admin-test',subject:'panel-eduxfac',expiresIn:'2m',jwtid:randomUUID()});
}
export async function createFixture(){
 process.env.NODE_ENV='test';process.env.SESSION_SECRET=TEST_SESSION;
 delete process.env.DATABASE_URL;delete process.env.JWT_SECRET;
 process.env.PANEL_WEB_SERVICE_SECRET=TEST_SERVICE;process.env.PANEL_WEB_SERVICE_ISSUER='panel-test';process.env.PANEL_WEB_SERVICE_AUDIENCE='web-admin-test';
 const db=await PGlite.create('memory://');
 let server;
 try {
 let tail=Promise.resolve();
 async function acquire(){const previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});await previous;return release;}
 const normalize=result=>({rows:result.rows||[],rowCount:result.affectedRows||result.rows?.length||0});
 const raw=async(sql,params)=>normalize(params?.length?await db.query(sql,params):(await db.exec(sql)).at(-1)||{});
 const adapter={isolatedTestDatabase:true,
  async query(sql,params){const release=await acquire();try{return await raw(sql,params);}finally{release();}},
  async connect(){const release=await acquire();return {query:raw,release};},end:()=>db.close()};
 const {installTestDatabase}=await import('../../server/src/db.js');installTestDatabase(adapter);
 const root=fileURLToPath(new URL('../../',import.meta.url));
 // gen_random_uuid está en PostgreSQL core. Se omite únicamente la extensión no necesaria en WASM.
 await db.exec((await readFile(path.join(root,'database/schema.sql'),'utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
 const {app,initializeDatabase}=await import('../../server/src/app.js');await initializeDatabase();
 await db.exec(await readFile(path.join(root,'database/migrations/001_empresa_acceso.sql'),'utf8'));
 const query=adapter.query.bind(adapter);
 const hash=await bcrypt.hash(PASSWORD,4);
 const role=(await query("select id from roles where nombre='Administrador'")).rows[0].id;
 for(const letter of ['A','B']){
  await query('insert into empresas(id,ruc,razon_social,nombre_comercial,empresa_codigo) values($1,$2,$3,$3,$4)',[ids['empresa'+letter],letter==='A'?'20111111111':'20222222222','Empresa '+letter,'EMPRESA-'+letter]);
  await query('insert into empresa_acceso(empresa_id,estado) values($1,$2)',[ids['empresa'+letter],'ACTIVO']);
  await query('insert into sucursales(id,empresa_id,codigo,nombre) values($1,$2,$3,$4)',[ids['sucursal'+letter],ids['empresa'+letter],'PRINCIPAL','Sucursal '+letter]);
  await query('insert into usuarios(id,empresa_id,nombre,usuario,password_hash) values($1,$2,$3,$4,$5)',[ids['usuario'+letter],ids['empresa'+letter],'Usuario '+letter,'admin',hash]);
  await query('insert into usuario_sucursal(usuario_id,sucursal_id,rol_id) values($1,$2,$3)',[ids['usuario'+letter],ids['sucursal'+letter],role]);
  await query('insert into productos(id,empresa_id,codigo_interno,nombre) values($1,$2,$3,$4)',[ids['producto'+letter],ids['empresa'+letter],'P-'+letter,'Producto exclusivo '+letter]);
  await query("insert into producto_sucursal(producto_id,sucursal_id,origen) values($1,$2,'operacion')",[ids['producto'+letter],ids['sucursal'+letter]]);
  await query('insert into lotes(producto_id,sucursal_id,numero_lote,cantidad_inicial,cantidad_disponible) values($1,$2,$3,10,10)',[ids['producto'+letter],ids['sucursal'+letter],'LOTE-'+letter]);
 }
 await query('insert into sucursales(id,empresa_id,codigo,nombre) values($1,$2,$3,$4)',[ids.sucursalA2,ids.empresaA,'SEGUNDA','Sucursal A2']);
 await query('insert into usuario_sucursal(usuario_id,sucursal_id,rol_id) values($1,$2,$3)',[ids.usuarioA,ids.sucursalA2,role]);
 await query("insert into producto_sucursal(producto_id,sucursal_id,origen) values($1,$2,'operacion')",[ids.productoA,ids.sucursalA2]);
 await query('insert into solicitudes_internas(id,empresa_id,sucursal_solicitante_id,usuario_solicita_id) values($1,$2,$3,$4)',[ids.solicitudB,ids.empresaB,ids.sucursalB,ids.usuarioB]);
 await query('insert into solicitud_interna_detalles(solicitud_id,producto_id,cantidad) values($1,$2,2)',[ids.solicitudB,ids.productoB]);
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 async function request(route,{token,method='GET',body}={}){
  const response=await fetch(base+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  return {status:response.status,data};
 }
 async function login(letter,extra={}){return request('/api/auth/login',{method:'POST',body:{usuario:'admin',password:PASSWORD,empresa_codigo:'EMPRESA-'+letter,...extra}});}
 const tokenA=(await login('A')).data.token,tokenB=(await login('B')).data.token;
 if(!tokenA||!tokenB)throw Error('Falló login de las fixtures');
 async function snapshotB(){return (await query(`select json_build_object('empresa',(select to_jsonb(e) from empresas e where id=$1),'acceso',(select to_jsonb(a) from empresa_acceso a where empresa_id=$1),'productos',(select jsonb_agg(p) from productos p where empresa_id=$1),'usuarios',(select jsonb_agg(u) from usuarios u where empresa_id=$1),'solicitud',(select to_jsonb(s) from solicitudes_internas s where id=$2),'detalles',(select jsonb_agg(d) from solicitud_interna_detalles d where solicitud_id=$2),'lotes',(select jsonb_agg(l) from lotes l join productos p on p.id=l.producto_id where p.empresa_id=$1)) data`,[ids.empresaB,ids.solicitudB])).rows[0].data;}
 return {db,query,request,login,tokenA,tokenB,snapshotB,close:async()=>{await new Promise(resolve=>server.close(resolve));await db.close();}};
 }catch(error){console.error('Fixture falló:',error.message);if(server)await new Promise(resolve=>server.close(resolve));await db.close();throw error;}
}
