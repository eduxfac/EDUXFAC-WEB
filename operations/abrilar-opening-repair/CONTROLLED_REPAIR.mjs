import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {repairOpening,capture,sha} from './repair-abrilar-opening.mjs';
import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js';
const W=path.dirname(fileURLToPath(import.meta.url)),need=(ok,code)=>{if(!ok)throw Error(code)},read=n=>JSON.parse(fs.readFileSync(path.join(W,n),'utf8'));
const plan=read('PLAN_ABRILAR.json');
need(sha(fs.readFileSync(path.join(W,'PLAN_ABRILAR.json')))==='836713a40abbac2323c90b150afbb8dffe8b6a985829244c4b801fc95d6fd030','PLAN_FILE_CHANGED');
need(sha(fs.readFileSync(path.join(W,'repair-abrilar-opening.mjs')))==='60ac4b2e867374dd11260e2d54658d9c5ca4e5d0cfb0898b67b00de794711295','VALIDATED_REPAIR_CHANGED');
let appliedThisRun=false;
const planHash=sha(plan),mode=process.argv[2];need(['--prepare','--apply','--verify','--undo'].includes(mode),'INVALID_MODE');
const save=(n,d)=>fs.writeFileSync(path.join(W,n),JSON.stringify(d,null,2),{mode:0o600});
const config=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json','utf8'));
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_web_piloto',user:'eduxfac_web_migrator',password:config.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c statement_timeout=15000 -c lock_timeout=5000'});
function importer(){need(sha(fs.readFileSync('/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/server/src/initial-inventory.js'))==='6509028c9ab0d4a39a2671d87637fb99b8c6584ed407f6099b3e1c39971f8ccd','STAGE1_IMPORTER_NOT_DEPLOYED')}
async function health(){
 const results=[];for(const url of ['http://127.0.0.1:3001/api/health','https://app.eduxfac.com/api/health','https://app.eduxfac.com/','https://admin.eduxfac.com/']){
  const started=Date.now(),r=await fetch(url,{signal:AbortSignal.timeout(6000)});need(r.status===200,'HEALTH_HTTP_'+r.status);const b=Buffer.from(await r.arrayBuffer());if(url.endsWith('/api/health')){const j=JSON.parse(b);need(j.ok===true&&j.database===true&&j.data_mode==='PILOTO','PILOT_HEALTH_INVALID')}results.push({url,http:r.status,ms:Date.now()-started,body_sha256:sha(b)});
 }return results;
}
async function globalState(){
 const identity=(await db.query('select current_database() name')).rows[0];need(identity.name===plan.database,'DATABASE_SCOPE');
 const tables=(await db.query("select c.relname,c.relrowsecurity rls,c.relforcerowsecurity force_rls,pg_get_userbyid(c.relowner) owner,c.relacl::text acl from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by c.relname")).rows;need(tables.filter(t=>t.force_rls).length===44,'RLS_CHANGED');
 const schemas=(await db.query("select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
 const policies=(await db.query("select c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles::text roles,pg_get_expr(p.polqual,p.polrelid) qual,pg_get_expr(p.polwithcheck,p.polrelid) checked from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace='public'::regnamespace order by c.relname,p.polname")).rows;
 const roles=(await db.query("select rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolcanlogin from pg_roles where rolname like 'eduxfac%' order by rolname")).rows;
 const fingerprints={};
 for(const t of tables){const quoted='"'+t.relname.replaceAll('"','""')+'"';let where='',args=[];
  if(t.relname==='lotes'){where=' where not (id=any($1::uuid[]))';args=[plan.lots.map(l=>l.id)]}
  if(t.relname==='auditoria'){where=" where not (empresa_id=$1 and entidad_id=$2 and accion in ('REPARAR_APERTURA_INICIAL','REVERTIR_APERTURA_INICIAL') and detalle->>'plan_sha256'=$3)";args=[plan.empresaId,plan.productoId,planHash]}
  fingerprints[t.relname]=(await db.query("select count(*)::int rows,md5(coalesce(string_agg(h,',' order by h),'')) digest from (select md5(to_jsonb(t)::text) h from public."+quoted+' t'+where+') q',args)).rows[0];
 }return {tables,schemas_sha256:sha(schemas),policies_sha256:sha(policies),roles_sha256:sha(roles),fingerprints};
}
async function simulation(){
 const rows=(await db.query(`with actual as(select l.id,l.numero_lote,l.fecha_vencimiento,l.cantidad_disponible stock,l.costo_unitario,l.valor_base_costos,
 l.valor_base_costos+coalesce((select sum(m.cantidad*coalesce(m.costo_unitario,0)) from movimientos_inventario m where m.lote_id=l.id and m.producto_id=l.producto_id and m.sucursal_id=l.sucursal_id and m.empresa_id=$3),0) valor
 from lotes l join productos p on p.id=l.producto_id where l.producto_id=$1 and l.sucursal_id=$2 and p.empresa_id=$3 and l.cantidad_disponible>0),picked as(select *,greatest(least(stock,8-coalesce(sum(stock) over(order by fecha_vencimiento asc nulls last,id rows between unbounded preceding and 1 preceding),0)),0) tomar from actual)
 select id,numero_lote,stock,costo_unitario,valor_base_costos,valor,valor/stock costo_venta,tomar,tomar*valor/stock costo_consumido from picked order by fecha_vencimiento asc nulls last,id`,[plan.productoId,plan.sucursalId,plan.empresaId])).rows;
 need(rows.length===3,'THREE_LOTS_REQUIRED');const expected={EDU1:[3,3],EDU2:[3,3],EDU3:[5,2]};
 for(const r of rows){const x=expected[r.numero_lote];need(x&&Number(r.stock)===x[0]&&Number(r.tomar)===x[1]&&Number(r.costo_unitario)===15&&Number(r.valor_base_costos)===0&&Number(r.costo_venta)===15,'REPAIR_FINAL_VALUE_INVALID')}
 const total=rows.reduce((v,r)=>v+Number(r.costo_consumido),0),value=rows.reduce((v,r)=>v+Number(r.valor),0);need(total===120&&value===165,'SIMULATION_NOT_120_OR_165');return {rows,stock_total:11,inventory_value:165,quantity:8,cost:120,revenue:200,profit:80,SELECT_only:true};
}
async function prepare(){
 need(!fs.existsSync(path.join(W,'REPAIR_READY.json'))&&!fs.existsSync(path.join(W,'APPLIED.json')),'ALREADY_PREPARED');importer();const h=await health();
 const backup=read('ABRILAR_BEFORE.json');need(backup.plan_sha256===planHash&&backup.snapshot_sha256===sha(backup.snapshot),'BACKUP_INVALID');
 const dry=await repairOpening(db,plan);need(JSON.stringify(dry.before)===JSON.stringify(backup.snapshot),'BACKUP_BASELINE_CHANGED');
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{const g=await globalState();await db.query('ROLLBACK');save('REPAIR_READY.json',{global:g,backup_sha256:sha(fs.readFileSync(path.join(W,'ABRILAR_BEFORE.json'))),plan_sha256:planHash,health:h,utc:new Date().toISOString()});save('DRY_RUN.json',{...dry,before:undefined});console.log(JSON.stringify({result:'REPAIR_READY',stock_total:11,changes:dry.changes,backup_sha256:sha(fs.readFileSync(path.join(W,'ABRILAR_BEFORE.json'))),force_rls:44}));}catch(e){await db.query('ROLLBACK');throw e;}
}
async function apply(){
 need(!fs.existsSync(path.join(W,'APPLIED.json'))&&!fs.existsSync(path.join(W,'FAILED.json')),'APPLY_ALREADY_USED');const ready=read('REPAIR_READY.json'),backup=read('ABRILAR_BEFORE.json');importer();need(ready.backup_sha256===sha(fs.readFileSync(path.join(W,'ABRILAR_BEFORE.json'))),'BACKUP_FILE_CHANGED');let checks;
 const guarded={query:async(sql,args)=>{
  if(sql==='BEGIN ISOLATION LEVEL SERIALIZABLE'){const r=await db.query(sql,args);need(JSON.stringify(await globalState())===JSON.stringify(ready.global),'GLOBAL_BASELINE_CHANGED');return r}
  if(sql==='COMMIT'){importer();checks={simulation:await simulation(),health:await health()};need(JSON.stringify(await globalState())===JSON.stringify(ready.global),'PROTECTED_DATA_OR_RLS_CHANGED');save('BEFORE_COMMIT_VALIDATIONS.json',checks)}
  return db.query(sql,args);
 }};
 const result=await repairOpening(guarded,plan,{apply:true,backup});appliedThisRun=true;const after=await capture(db,plan);save('APPLIED.json',{...result,checks,after,utc:new Date().toISOString()});console.log(JSON.stringify({result:'ABRILAR_REPAIR_OK',...result,simulation:checks.simulation,force_rls:44,protected_data_unchanged:true}));
}
async function verify(){
 importer();const a=read('APPLIED.json'),ready=read('REPAIR_READY.json');await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{need(JSON.stringify(await capture(db,plan))===JSON.stringify(a.after),'REPAIRED_BASELINE_CHANGED');const sim=await simulation();need(JSON.stringify(await globalState())===JSON.stringify(ready.global),'PROTECTED_DATA_OR_RLS_CHANGED');await db.query('ROLLBACK');const h=await health();save('VERIFIED.json',{result:'ABRILAR_VERIFIED',simulation:sim,health:h,audit_id:a.audit_id,all_protected_tables_unchanged:true,force_rls:44});console.log(JSON.stringify({result:'ABRILAR_VERIFIED',audit_id:a.audit_id,inventory_value:165,stock:11,cost_8:120,profit_8:80,force_rls:44}));}catch(e){await db.query('ROLLBACK');throw e;}
}
async function undo(){
 const a=read('APPLIED.json'),ready=read('REPAIR_READY.json'),backup=read('ABRILAR_BEFORE.json');need(!fs.existsSync(path.join(W,'UNDONE.json')),'ALREADY_UNDONE');await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');try{
  await db.query('select producto_id from producto_sucursal where producto_id=$1 and sucursal_id=$2 for update',[plan.productoId,plan.sucursalId]);await db.query('select id from lotes where producto_id=$1 and sucursal_id=$2 order by id for update',[plan.productoId,plan.sucursalId]);need(JSON.stringify(await capture(db,plan))===JSON.stringify(a.after),'EXTERNAL_CHANGE_UNDO_BLOCKED');
  for(const l of plan.lots){const r=await db.query('update lotes set valor_base_costos=$4 where id=$1 and producto_id=$2 and sucursal_id=$3 and valor_base_costos=0 returning id',[l.id,plan.productoId,plan.sucursalId,l.valor_base_costos]);need(r.rowCount===1,'UNDO_CONDITIONAL_UPDATE_FAILED')}
  const audit=(await db.query("insert into auditoria(empresa_id,usuario_id,accion,entidad,entidad_id,detalle) values($1,null,'REVERTIR_APERTURA_INICIAL','productos',$2,$3::jsonb) returning id",[plan.empresaId,plan.productoId,JSON.stringify({plan_sha256:planHash,reparacion_audit_id:a.audit_id,motivo:'Rollback por validacion posterior fallida',stock_intacto:11})])).rows[0];
  const now=await capture(db,plan);for(const key of Object.keys(backup.snapshot.fingerprints).filter(k=>k!=='audit'))need(now.fingerprints[key]===backup.snapshot.fingerprints[key],'UNDO_NOT_IDENTICAL');need(JSON.stringify(await globalState())===JSON.stringify(ready.global),'UNDO_PROTECTED_DATA_CHANGED');await db.query('COMMIT');save('UNDONE.json',{result:'ABRILAR_UNDO_OK',audit_id:audit.id,opening_restored:true});console.log('ABRILAR_UNDO_OK');
 }catch(e){await db.query('ROLLBACK');throw e;}
}
await db.connect();try{await ({'--prepare':prepare,'--apply':apply,'--verify':verify,'--undo':undo}[mode])();}catch(e){const failure={result:'STOP',mode,code:e.message,utc:new Date().toISOString()};save('FAILED.json',failure);console.error(JSON.stringify(failure));if(fs.existsSync(path.join(W,'APPLIED.json'))&&!fs.existsSync(path.join(W,'UNDONE.json'))&&(mode==='--verify'||appliedThisRun)&&mode!=='--undo'){try{await undo()}catch(re){save('UNDO_FAILED.json',{code:re.message});console.error(JSON.stringify({undo:'STOP',code:re.message}))}}process.exitCode=1;}finally{await db.end()}
