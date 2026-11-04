import pg from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {planIndexes,applyIndexes,validateIndexManifest} from '../src/online-indexes.js';

export async function main(args=process.argv.slice(2)){
 const {values}=parseArgs({args,options:{manifest:{type:'string'},database:{type:'string'},plan:{type:'boolean'},apply:{type:'boolean'},verify:{type:'boolean'},report:{type:'string'},'statement-timeout-ms':{type:'string',default:'7200000'}}});
 if(!values.manifest||!values.database||[values.plan,values.apply,values.verify].filter(Boolean).length!==1)throw Error('Uso: node server/scripts/optimize-indexes.mjs --manifest=archivo.json --database=nombre --plan|--apply|--verify [--report=archivo.json]. Conexión mediante PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSFILE.');
 const timeout=Number(values['statement-timeout-ms']);if(!Number.isSafeInteger(timeout)||timeout<1000||timeout>86400000)throw Error('Tiempo máximo inválido.');
 const manifest=validateIndexManifest(JSON.parse(await readFile(resolve(values.manifest),'utf8')));
 // No dotenv and no fallback to application DATABASE_URL: target must be explicit.
 const client=new pg.Client({database:values.database,connectionTimeoutMillis:10000,application_name:'eduxfac-online-indexes',options:'-c lock_timeout=5000 -c statement_timeout='+timeout+' -c search_path=pg_catalog,public'});
 try{
  await client.connect();
  const result=values.apply?await applyIndexes(client,manifest,values.database,{onProgress:p=>console.log(JSON.stringify(p))}):await planIndexes(client,manifest,values.database);
  const report={...result,mode:values.apply?'apply':values.verify?'verify':'plan',at:new Date().toISOString()};
  if(values.report)await writeFile(resolve(values.report),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify(report,null,2));
  if(values.verify&&result.indexes.some(i=>i.status!=='covered'))process.exitCode=2;
 }finally{await client.end().catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.code||'INDEX_PATCH_ERROR',error.message);process.exitCode=1;});
