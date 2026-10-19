import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const run=promisify(execFile);
export async function createProfitNativeCluster(){
 const root=fileURLToPath(new URL('../../',import.meta.url));
 if(process.platform!=='linux'||!existsSync('/.dockerenv')||process.env.EDUXFAC_PROFIT_NATIVE!=='yes'||!root.startsWith('/stage/EDUXFAC/'))throw Error('PROFIT_ISOLATED_LINUX_ONLY');
 const directory=path.join(root,'tests/.profit-native',randomUUID()),data=path.join(directory,'cluster');
 mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,'SOLO_PRUEBAS.json'),JSON.stringify({purpose:'PROFIT_NATIVE_FICTITIOUS',data}));
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const tools='/usr/lib/postgresql/16/bin',options={cwd:root,timeout:60000,maxBuffer:1024*1024};
 let started=false,pool;
 const close=async()=>{if(pool){await pool.end();pool=null;}if(started){await run(tools+'/pg_ctl',['-D',data,'stop','-m','fast','-w'],options);started=false;}};
 try{
  await run(tools+'/initdb',['-D',data,'-A','trust','-U','eduxfac_profit_fixture','-E','UTF8','--locale=C'],options);
  await run(tools+'/pg_ctl',['-D',data,'-l',path.join(directory,'postgres.log'),'-w','start','-o','-h 127.0.0.1 -p '+port+' -k /tmp -F -c max_connections=40 -c shared_buffers=16MB'],options);started=true;
  pool=new pg.Pool({host:'127.0.0.1',port,user:'eduxfac_profit_fixture',database:'postgres',max:12,options:'-c statement_timeout=15000 -c lock_timeout=10000'});
  const query=async(sql,args)=>{const r=await pool.query(sql,args);return Array.isArray(r)?r.at(-1):r;};
  return {pool,query,port,directory,data,close};
 }catch(e){await close();throw e;}
}
