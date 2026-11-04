import {createHash} from 'node:crypto';

const identifier=/^[a-z][a-z0-9_]{0,62}$/;
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const normalized=value=>String(value||'').replace(/[\s"()]/g,'').toLowerCase();
const error=(code,message)=>Object.assign(Error(message),{code});

export function validateIndexManifest(manifest){
 if(manifest.version!==1||!['web','cpe'].includes(manifest.component)||!Array.isArray(manifest.indexes)||!manifest.indexes.length)throw error('MANIFEST_INVALID','Manifiesto de índices inválido.');
 const names=new Set();
 for(const index of manifest.indexes){
  if(!identifier.test(index.name)||!identifier.test(index.table)||names.has(index.name)||!Array.isArray(index.keys)||!index.keys.length||!Array.isArray(index.columns)||!index.columns.length||index.columns.some(c=>!identifier.test(c)))throw error('MANIFEST_INVALID','Nombre, columnas o claves inválidas.');
  names.add(index.name);
  // Only reviewed column keys/expressions are accepted; never arbitrary statements.
  for(const sql of [...index.keys,index.where||''])if(typeof sql!=='string'||/[;]|--|\/\*|\*\/|\b(select|insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(sql))throw error('MANIFEST_INVALID','Expresión SQL no permitida.');
 }
 return manifest;
}

export async function planIndexes(client,manifest,expectedDatabase){
 validateIndexManifest(manifest);
 const actual=(await client.query('SELECT current_database() db,current_user role,current_setting(\'server_version_num\')::int version,pg_database_size(current_database())::text bytes,inet_server_addr()::text server_address,inet_server_port() server_port,pg_is_in_recovery() replica')).rows[0];
 if(!expectedDatabase||actual.db!==expectedDatabase)throw error('DATABASE_MISMATCH','La base conectada no coincide con --database.');
 if(actual.version<140000)throw error('VERSION_UNSUPPORTED','Se requiere PostgreSQL 14 o posterior.');
 const output=[];
 for(const index of manifest.indexes){
  const table=(await client.query(`SELECT c.oid,c.relkind,pg_table_size(c.oid)::text bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1`,[index.table])).rows[0];
  if(!table||table.relkind!=='r')throw error('SCHEMA_REVIEW_REQUIRED','Falta la tabla public.'+index.table+' o no es una tabla ordinaria. Revisa el esquema antes de aplicar.');
  const columns=(await client.query('SELECT attname FROM pg_attribute WHERE attrelid=$1 AND attnum>0 AND NOT attisdropped',[table.oid])).rows.map(c=>c.attname);
  if(index.columns.some(c=>!columns.includes(c)))throw error('SCHEMA_REVIEW_REQUIRED','Faltan columnas para '+index.name+'. No se aplicó este plan.');
  const existing=(await client.query(`SELECT ci.relname name,am.amname method,i.indisvalid valid,i.indisready ready,i.indnkeyatts,i.indnatts,pg_get_expr(i.indpred,i.indrelid) predicate,
    ARRAY(SELECT pg_get_indexdef(i.indexrelid,k,true)
      ||CASE WHEN (i.indoption[k-1]&1)=1 THEN ' DESC' ELSE '' END
      ||CASE WHEN (i.indoption[k-1]&1)=1 AND (i.indoption[k-1]&2)=0 THEN ' NULLS LAST'
             WHEN (i.indoption[k-1]&1)=0 AND (i.indoption[k-1]&2)=2 THEN ' NULLS FIRST' ELSE '' END
      FROM generate_series(1,i.indnkeyatts) k) keys
    FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_am am ON am.oid=ci.relam WHERE i.indrelid=$1`,[table.oid])).rows;
  const predicate=normalized(index.where);
  const covers=c=>c.valid&&c.ready&&c.method==='btree'&&(!c.predicate||normalized(c.predicate)===predicate)&&c.keys.length>=index.keys.length&&index.keys.every((k,i)=>normalized(k)===normalized(c.keys[i]));
  const named=(await client.query('SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=\'public\' AND c.relname=$1',[index.name])).rows[0];
  if(named){const same=existing.find(c=>c.name===index.name);if(!same||!covers(same))throw error('INDEX_REVIEW_REQUIRED','El índice '+index.name+' existe con otra definición o está inválido. No se elimina automáticamente.');}
  const covered=existing.find(covers);
  output.push({...index,status:covered?'covered':'missing',covered_by:covered?.name||null,table_bytes:table.bytes});
 }
 return {component:manifest.component,database:actual.db,role:actual.role,server_address:actual.server_address,server_port:actual.server_port,replica:actual.replica,database_bytes:actual.bytes,manifest_sha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),indexes:output};
}

export async function applyIndexes(client,manifest,expectedDatabase,{onProgress=()=>{}}={}){
 // Session lock: CREATE INDEX CONCURRENTLY must run outside a transaction.
 const lock=(await client.query("SELECT pg_try_advisory_lock(hashtextextended(current_database()||':eduxfac-online-indexes',0)) locked")).rows[0].locked;
 if(!lock)throw error('MIGRATION_BUSY','Otro proceso de índices está trabajando en esta base.');
 const created=[];
 try{
  const plan=await planIndexes(client,manifest,expectedDatabase); // Full preflight before the first CREATE.
  if(plan.replica)throw error('REPLICA_READ_ONLY','No se aplica el parche en una réplica de solo lectura.');
  for(const index of plan.indexes){
   if(index.status==='covered'){onProgress({name:index.name,status:'covered',covered_by:index.covered_by});continue;}
   const statement='CREATE INDEX CONCURRENTLY '+quote(index.name)+' ON public.'+quote(index.table)+' USING btree ('+index.keys.join(', ')+')'+(index.where?' WHERE '+index.where:'');
   onProgress({name:index.name,status:'creating'});
   try{await client.query(statement);}catch(e){throw error(e.code||'INDEX_BUILD_FAILED','Falló '+index.name+'. Los índices anteriores se conservan. Revisa pg_index antes de reintentar; no se borra automáticamente un índice inválido.');}
   created.push(index.name);onProgress({name:index.name,status:'created'});
  }
  const verified=await planIndexes(client,manifest,expectedDatabase);
  if(verified.indexes.some(i=>i.status!=='covered'))throw error('INDEX_VERIFY_FAILED','La verificación final detectó índices pendientes.');
  return {...verified,created};
 }finally{await client.query("SELECT pg_advisory_unlock(hashtextextended(current_database()||':eduxfac-online-indexes',0))").catch(()=>{});}
}
