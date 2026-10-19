import fs from 'node:fs';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js';
const s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json','utf8'));
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_web_piloto',user:'eduxfac_web_migrator',password:s.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c statement_timeout=60000'});

import path from 'node:path';
import {createHash} from 'node:crypto';
import {repairApronax} from './operations/repair-costs/repair-apronax.mjs';
const work=path.dirname(new URL(import.meta.url).pathname);
const plan=JSON.parse(fs.readFileSync(path.join(work,'operations/repair-costs/PLAN_APRONAX.json'),'utf8'));
const expected=JSON.parse(fs.readFileSync(path.join(work,'PRECHECK.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(work,'MANIFEST.json'),'utf8'));
const mode=process.argv[2];if(!['--dry-run','--apply'].includes(mode))throw Error('MODE_INVALID');
function need(ok,code){if(!ok)throw Error(code);}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function save(n,v){fs.writeFileSync(path.join(work,n),JSON.stringify(v,null,2),{mode:0o600});}
for(const [n,h] of Object.entries(manifest.tools)){
 need(createHash('sha256').update(fs.readFileSync(path.join(work,n))).digest('hex')===h,'REPAIR_TOOLS_HASH_MISMATCH');
}
const backup=JSON.parse(fs.readFileSync(path.join(work,'BACKUP_VERIFIED.json'),'utf8'));
need(createHash('sha256').update(fs.readFileSync(backup.path)).digest('hex')===backup.sha256&&backup.archive_parse_valid&&backup.rows_verified,'BACKUP_NOT_VERIFIED');
need(!fs.existsSync(path.join(work,'REPAIR_DONE.json')),'REPAIR_ALREADY_APPLIED_STOP');
if(mode==='--apply')need(fs.existsSync(path.join(work,'DRY_RUN_DONE.json')),'DRY_RUN_REQUIRED');

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

const realQuery=db.query.bind(db);
let reference=null,validated=null,committed=false;
async function healthy(){
 verifySource();
 for(const url of ['http://127.0.0.1:3001/api/health','https://app.eduxfac.com/api/health','https://app.eduxfac.com/','https://admin.eduxfac.com/','https://eduxfac.com/']){
  const started=new Date().toISOString(),t=performance.now();
  const res=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'manual',headers:{'Cache-Control':'no-cache'}});
  need(res.status===200,'HEALTH_HTTP_NOT_200');
  const body=Buffer.from(await res.arrayBuffer());
  if(url.endsWith('/api/health')){const d=JSON.parse(body);need(d.ok===true&&d.database===true&&d.data_mode==='PILOTO','HEALTH_MODE_FAILED');}
  if(url==='https://app.eduxfac.com/')need(createHash('sha256').update(body).digest('hex')===expected.source_hashes['public/index.html'],'HTTP_SOURCE_CHANGED');
  healthEvents.push({url,started_utc:started,http:res.status,duration_ms:Math.round((performance.now()-t)*100)/100});
 }
}
const healthEvents=[];
function verifySource(){const base='/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web';for(const [n,h] of Object.entries(expected.source_hashes))need(createHash('sha256').update(fs.readFileSync(path.join(base,n))).digest('hex')===h,'DEPLOYED_SOURCE_CHANGED');}
verifySource();
async function checkAfter(){
 const after=await snapshot(),before=expected.snapshot;
 for(const key of ['tables','policies','views','grants','columns','migrations','account'])need(same(after[key],before[key]),'SECURITY_SCHEMA_OR_ACCOUNT_CHANGED_'+key);
 for(const [table,digest] of Object.entries(before.fingerprints)){
  if(!['lotes','movimientos_inventario','auditoria'].includes(table))need(same(after.fingerprints[table],digest),'HISTORY_CHANGED_'+table);
 }
 const data=(await realQuery("select to_jsonb(l) row from lotes l order by id")).rows.map(r=>r.row);
 const ids=[plan.saldoSinLoteId,plan.loteRealId];
 const beforeLots=JSON.parse(fs.readFileSync(path.join(work,'AFFECTED_BEFORE.json'),'utf8')).lots;
 for(const l of data){
  const old=beforeLots.find(x=>x.id===l.id);need(!!old,'UNEXPECTED_LOT_CREATED');
  if(ids.includes(l.id)){
   for(const k of Object.keys(old).filter(k=>!['cantidad_disponible','costo_unitario','valor_base_costos'].includes(k)))need(same(l[k],old[k]),'LOT_METADATA_CHANGED_'+k);
  }else need(same(l,old),'OTHER_PRODUCT_OR_LOT_CHANGED');
 }
 need(data.length===beforeLots.length,'LOT_COUNT_CHANGED');
 const from=data.find(l=>l.id===plan.saldoSinLoteId),to=data.find(l=>l.id===plan.loteRealId);
 need(Number(from.cantidad_disponible)===0&&Number(to.cantidad_disponible)===120&&Number(to.costo_unitario)===1.57&&to.numero_lote==='DFDF','LOT_POSTCHECK_FAILED');
 const summary=(await realQuery("select p.id,p.nombre,sum(l.cantidad_disponible)::numeric(14,3)::text stock,sum(l.cantidad_disponible*l.costo_unitario)::numeric(14,2)::text value from productos p join lotes l on l.producto_id=p.id where p.empresa_id=$1 group by p.id order by p.id",[plan.empresaId])).rows;
 const apr=summary.find(p=>p.id===plan.productoId),para=summary.find(p=>p.id==='6b714b36-a45e-4a0d-a9d8-05d70f93a439');
 need(apr.stock==='120.000'&&apr.value==='188.40','APRONAX_VALUE_FAILED');
 need(para.stock==='390.000'&&para.value==='31.20','PARACETAMOL_CHANGED');
 const total=(await realQuery("select sum(l.cantidad_disponible*l.costo_unitario)::numeric(14,2)::text value from lotes l join productos p on p.id=l.producto_id where p.empresa_id=$1",[plan.empresaId])).rows[0].value;
 need(total==='219.60','INVENTORY_VALUE_FAILED');
 const moves=(await realQuery("select id,lote_id,tipo,cantidad::text,costo_unitario::text,(cantidad*costo_unitario)::numeric(14,2)::text value,referencia_tipo,referencia_id,created_at from movimientos_inventario where referencia_id=$1 order by cantidad",[reference])).rows;
 need(moves.length===2,'MOVEMENT_COUNT_FAILED');
 need(moves[0].lote_id===plan.saldoSinLoteId&&Number(moves[0].cantidad)===-120&&moves[0].value==='-188.40'&&moves[1].lote_id===plan.loteRealId&&Number(moves[1].cantidad)===120&&moves[1].value==='188.40','MOVEMENTS_FAILED');
 need(moves.every(m=>m.tipo==='RECLASIFICACION_COSTO'&&m.referencia_tipo==='REPARACION_COSTO'&&Number(m.costo_unitario)===1.57),'MOVEMENT_TRACE_FAILED');
 const audits=(await realQuery("select id,accion,entidad,entidad_id,detalle,created_at from auditoria where detalle->>'reference'=$1 or detalle->>'referencia_id'=$1 order by accion",[reference])).rows;
 need(audits.length===2&&audits.some(a=>a.accion==='REPARAR_VALORIZACION_APRONAX')&&audits.some(a=>a.accion==='CONCILIAR_COSTO_STOCK'),'AUDIT_FAILED');
 for(const table of ['movimientos_inventario','auditoria']){
  const clause=table==='movimientos_inventario'?'where referencia_id is distinct from $1::uuid':"where (detalle->>'reference') is distinct from $1 and (detalle->>'referencia_id') is distinct from $1";
  const old=(await realQuery("select count(*)::int rows,md5(coalesce(string_agg(h,',' order by h),'')) digest from (select md5((to_jsonb(t)-'valor_base_costos')::text) h from "+table+" t "+clause+") q",[reference])).rows[0];
  need(same(old,before.fingerprints[table]),'EXISTING_KARDEX_OR_AUDIT_CHANGED');
 }
 await healthy();
 return {utc:new Date().toISOString(),reference,products:summary,inventory_total:total,movements:moves,audits,stock_total_before:'120',stock_total_after:'120',stock_quantity_delta:'0',historical_tables_unchanged:45,old_movements_and_audits_unchanged:true,other_lots_unchanged:true,lot_metadata_unchanged:true,RLS_force_tables:44,permissions_unchanged:true,health:healthEvents};
}
const guarded={
 async query(sql,params){
  const text=typeof sql==='string'?sql:sql.text;
  if(text==='BEGIN ISOLATION LEVEL SERIALIZABLE'){
   const r=await realQuery(sql,params);
   await realQuery("SET LOCAL lock_timeout='5s'");
   await realQuery('select producto_id from producto_sucursal where producto_id=$1 and sucursal_id=$2 for update',[plan.productoId,plan.sucursalId]);
   await realQuery('select id from lotes where producto_id=$1 and sucursal_id=$2 order by id for update',[plan.productoId,plan.sucursalId]);
   await realQuery("select id from lotes where producto_id='6b714b36-a45e-4a0d-a9d8-05d70f93a439' order by id for share");
   const current=await snapshot();
   for(const key of ['fingerprints','tables','policies','views','grants','columns','migrations','apronax','account'])need(same(current[key],expected.snapshot[key]),'PRE_TRANSACTION_CHANGED_'+key);
   return r;
  }
  if(text.includes('insert into movimientos_inventario(')){
   need(!reference||reference===params[6],'REFERENCE_CHANGED');reference=params[6];
  }
  if((text==='COMMIT'||text==='ROLLBACK')&&reference){
   validated=await checkAfter();
   const r=await realQuery(sql,params);committed=text==='COMMIT';return r;
  }
  return realQuery(sql,params);
 }
};
await db.connect();
try{
 const result=await repairApronax(guarded,plan,{apply:mode==='--apply',backupVerified:true,physicalLotConfirmed:true});
 need(validated!==null,'EXTENDED_POSTCHECK_NOT_EXECUTED');
 if(mode==='--dry-run'){
  await realQuery('BEGIN READ ONLY');const current=await snapshot();await realQuery('ROLLBACK');
  need(same(current,expected.snapshot),'DRY_RUN_DID_NOT_ROLL_BACK');
 }
 const report={...validated,...result,committed,backup:backup.path,backup_sha256:backup.sha256,physical_batch_confirmed:'DFDF',all_checks_before_commit:true};
 save(mode==='--apply'?'REPAIR_DONE.json':'DRY_RUN_DONE.json',report);
 console.log(JSON.stringify(report));
}catch(e){
 if(!committed){try{await realQuery('ROLLBACK');}catch{}}
 const code=/^[A-Z0-9_]+$/.test(e.message)?e.message:(e.code||'CONTROLLED_ERROR');
 save('REPAIR_FAILURE.json',{mode,code,committed,rolled_back:!committed,utc:new Date().toISOString()});
 console.log(JSON.stringify({result:'STOP',code,committed,rolled_back:!committed}));process.exitCode=1;
}finally{await db.end();}
