import fs from 'node:fs';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js';
const s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json','utf8'));
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_web_piloto',user:'eduxfac_web_migrator',password:s.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c statement_timeout=60000'});

import {createHash} from 'node:crypto';
import path from 'node:path';
const work=path.dirname(new URL(import.meta.url).pathname);
const mode=process.argv[2];
if(!['--snapshot','--apply','--verify'].includes(mode))throw Error('MODE_INVALID');
const manifest=JSON.parse(fs.readFileSync(path.join(work,'MANIFEST.json'),'utf8'));
const file='database/migrations/007_consistencia_costos.sql';
const sql=fs.readFileSync(path.join(work,'payload',file));
if(createHash('sha256').update(sql).digest('hex')!==manifest.after[file])throw Error('MIGRATION_HASH_MISMATCH');
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function need(ok,code){if(!ok)throw Error(code);}
function save(name,data){fs.writeFileSync(path.join(work,name),JSON.stringify(data,null,2),{mode:0o600});}

async function snapshot(){
 const tables=(await db.query("select c.relname,c.relrowsecurity rls,c.relforcerowsecurity force_rls,pg_get_userbyid(c.relowner) owner from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by c.relname")).rows;
 const fingerprints={};
 for(const t of tables.filter(t=>t.relname!=='web_schema_migrations')){
  const name='"'+t.relname.replaceAll('"','""')+'"';
  fingerprints[t.relname]=(await db.query("select count(*)::int rows,md5(coalesce(string_agg(h,',' order by h),'')) digest from (select md5((to_jsonb(t)-'valor_base_costos')::text) h from public."+name+" t) q")).rows[0];
 }
 const policies=(await db.query("select c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles::text roles,pg_get_expr(p.polqual,p.polrelid) qual,pg_get_expr(p.polwithcheck,p.polrelid) check_expr from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace order by c.relname,p.polname")).rows;
 const views=(await db.query("select c.relname,pg_get_userbyid(c.relowner) owner,c.reloptions,md5(pg_get_viewdef(c.oid,true)) definition_md5 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v' order by c.relname")).rows;
 const grants=(await db.query("select c.relname,pg_get_userbyid(a.grantor) grantor,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee,a.privilege_type,a.is_grantable from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.relnamespace='public'::regnamespace and c.relkind in ('r','v') order by 1,2,3,4,5")).rows;
 const columns=(await db.query("select table_name,column_name,data_type,numeric_precision,numeric_scale,is_nullable,column_default from information_schema.columns where table_schema='public' and ((table_name='lotes' and column_name in ('costo_unitario','valor_base_costos')) or (table_name='venta_detalles' and column_name='costo_snapshot') or (table_name='movimientos_inventario' and column_name='costo_unitario')) order by 1,2")).rows;
 const migrations=(await db.query('select version from web_schema_migrations order by version')).rows;
 const apronax=(await db.query("select id::text,cantidad_disponible::text,costo_unitario::text from lotes where producto_id='dfade78c-7cd3-4fc0-8660-ae7e608cdf79' order by id")).rows;
 const account=(await db.query("select e.ruc,e.empresa_codigo,e.activo empresa_activa,u.usuario,u.activo usuario_activo,u.debe_cambiar_password,a.estado,a.auth_version::text,a.estado_suscripcion,(a.fecha_inicio<=now() and a.fecha_vencimiento>now()) vigente from empresas e join usuarios u on u.empresa_id=e.id join empresa_acceso a on a.empresa_id=e.id where e.ruc='10460023039' and u.usuario='edwinpiloto'")).rows;
 return {tables,fingerprints,policies,views,grants,columns,migrations,apronax,account};
}

await db.connect();
let commit=false;
try{
 await db.query(mode==='--apply'?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await db.query("SET LOCAL lock_timeout='5s'");
 const identity=(await db.query('select current_database() db,current_user role')).rows[0];
 need(identity.db==='eduxfac_web_piloto'&&identity.role==='eduxfac_web_migrator','DB_ROLE_SCOPE_FAILED');
 const before=await snapshot();
 need(before.tables.filter(t=>t.force_rls&&t.rls).length===44,'RLS_COUNT_CHANGED');
 if(mode==='--snapshot'){
  need(!before.columns.some(c=>c.column_name==='valor_base_costos'),'MIGRATION_ALREADY_PRESENT');
  need(before.columns.length===3&&before.columns.every(c=>c.numeric_precision===14&&c.numeric_scale===4),'COLUMN_BASELINE_CHANGED');
  need(!before.migrations.some(m=>m.version==='007_consistencia_costos'),'MIGRATION_ALREADY_TRACKED');
  const view=before.views.find(v=>v.relname==='reporte_detalles_netos');
  need(view.owner===identity.role&&view.reloptions.includes('security_invoker=true'),'VIEW_BASELINE_CHANGED');
  need(before.tables.filter(t=>t.force_rls).every(t=>before.policies.some(p=>p.relname===t.relname&&p.polname==='f10_migrator'&&p.qual==='true'&&p.check_expr==='true')),'BACKUP_RLS_VISIBILITY_FAILED');
  await db.query('ROLLBACK');save('DB_BEFORE.json',before);console.log(JSON.stringify({snapshot:true,tables:before.tables.length,force_rls:44,apronax_untouched:before.apronax,account:before.account}));
 }else if(mode==='--apply'){
  const baseline=JSON.parse(fs.readFileSync(path.join(work,'DB_BEFORE.json'),'utf8'));
  for(const key of ['fingerprints','tables','policies','views','grants','columns','migrations','apronax','account'])need(same(before[key],baseline[key]),'DB_BASELINE_CHANGED_'+key);
  await db.query(sql.toString('utf8'));
  const after=await snapshot();
  for(const key of ['fingerprints','tables','policies','views','grants','apronax','account'])need(same(before[key],after[key]),'HISTORICAL_OR_SECURITY_CHANGE_'+key);
  need(after.columns.length===4&&after.columns.every(c=>c.data_type==='numeric'&&c.numeric_precision===null&&c.numeric_scale===null),'NEW_COLUMN_TYPES_FAILED');
  need(after.columns.find(c=>c.column_name==='valor_base_costos').is_nullable==='YES','OPENING_COLUMN_NOT_NULLABLE');
  need((await db.query('select count(*)::int n from lotes where valor_base_costos is not null')).rows[0].n===0,'UNAUTHORIZED_BACKFILL');
  await db.query("INSERT INTO web_schema_migrations(version) VALUES('007_consistencia_costos')");
  await db.query('COMMIT');commit=true;
  save('MIGRATION_DONE.json',{utc:new Date().toISOString(),migration:file,sha256:manifest.after[file],database:identity.db,transaction_committed:true,historical_rows_unchanged:true,security_unchanged:true,apronax_untouched:true,metadata_version:'007_consistencia_costos',after:{...after,migrations:[...after.migrations,{version:'007_consistencia_costos'}]}});
  console.log(JSON.stringify({migration:'007_consistencia_costos',committed:true,historical_rows_unchanged:true,force_rls:44}));
 }else{
  const baseline=JSON.parse(fs.readFileSync(path.join(work,'DB_BEFORE.json'),'utf8'));
  const migrated=JSON.parse(fs.readFileSync(path.join(work,'MIGRATION_DONE.json'),'utf8'));
  for(const key of ['fingerprints','tables','policies','views','grants','apronax','account'])need(same(before[key],baseline[key]),'POST_DEPLOY_DB_CHANGED_'+key);
  need(same(before.columns,migrated.after.columns),'POST_COLUMN_CHANGED');
  need(before.migrations.some(m=>m.version==='007_consistencia_costos'),'007_METADATA_MISSING');
  need((await db.query('select count(*)::int n from lotes where valor_base_costos is not null')).rows[0].n===0,'APR_OR_HISTORICAL_BACKFILL');
  const reportRows=(await db.query('select count(*)::int n from reporte_detalles_netos')).rows[0].n;
  const inventory=(await db.query("select sum(l.cantidad_disponible*l.costo_unitario)::numeric(14,2)::text value from lotes l join productos p on p.id=l.producto_id where p.empresa_id='8678361e-91ec-4bb2-877f-42ea2893d39e'")).rows[0].value;
  await db.query('ROLLBACK');
  const result={utc:new Date().toISOString(),read_only:true,historical_tables_unchanged:Object.keys(before.fingerprints).length,force_rls:44,policies_unchanged:true,view_grants_unchanged:true,account:before.account,apronax_unchanged:before.apronax,inventory_value:inventory,report_view_readable:true,report_rows:reportRows,real_transactions_executed:false};
  save('DB_POST_VERIFY.json',result);console.log(JSON.stringify(result));
 }
}catch(e){
 if(!commit){try{await db.query('ROLLBACK');}catch{}}
 const code=/^[A-Z0-9_]+$/.test(e.message)?e.message:(e.code||'CONTROLLED_ERROR');
 save('DB_FAILURE.json',{utc:new Date().toISOString(),mode,code,committed:commit,rolled_back:!commit});
 console.log(JSON.stringify({result:'DB_FAILED_STOP',code,committed:commit,rolled_back:!commit}));process.exitCode=1;
}finally{await db.end();}
