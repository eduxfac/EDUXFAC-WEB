import fs from 'node:fs';import os from 'node:os';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
export const PILOT={database:'eduxfac_web_piloto',empresaId:'8678361e-91ec-4bb2-877f-42ea2893d39e',sucursalId:'11b36867-46b5-40a1-9d0a-8a773b318d8d',productoId:'d0cd1f3b-cdc1-4e8f-aef6-939f5debc8fe',lotIds:['c77e5814-875d-4b7f-a818-82ba4140922f','16a942c2-9776-4a80-8251-1187421adb6f','b1dedd3b-54b2-44f7-aa88-19bca8d64e04']};
export const sha=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const canonical=x=>JSON.parse(JSON.stringify(x));
const need=(ok,code)=>{if(!ok)throw Error(code)};
export async function capture(db,p){
 const args=[p.productoId,p.empresaId,p.sucursalId];
 const sets={
 product:['select * from productos where id=$1 and empresa_id=$2',args.slice(0,2)],
 branch:['select ps.* from producto_sucursal ps join productos p on p.id=ps.producto_id where ps.producto_id=$1 and p.empresa_id=$2 and ps.sucursal_id=$3',args],
 lots:['select l.* from lotes l join productos p on p.id=l.producto_id where l.producto_id=$1 and p.empresa_id=$2 and l.sucursal_id=$3 order by l.id',args],
 movements:['select * from movimientos_inventario where producto_id=$1 and empresa_id=$2 and sucursal_id=$3 order by id',args],
 purchase_details:['select cd.* from compra_detalles cd join compras c on c.id=cd.compra_id where cd.producto_id=$1 and c.empresa_id=$2 and c.sucursal_id=$3 order by cd.id',args],
 sale_details:['select vd.* from venta_detalles vd join ventas v on v.id=vd.venta_id where vd.producto_id=$1 and v.empresa_id=$2 and v.sucursal_id=$3 order by vd.id',args],
 sales:['select v.* from ventas v where v.empresa_id=$2 and v.sucursal_id=$3 and exists(select 1 from venta_detalles vd where vd.venta_id=v.id and vd.producto_id=$1) order by v.id',args],
 returns:['select dd.* from devolucion_venta_detalles dd join venta_detalles vd on vd.id=dd.venta_detalle_id join ventas v on v.id=vd.venta_id where vd.producto_id=$1 and v.empresa_id=$2 and v.sucursal_id=$3 order by dd.id',args],
 adjustments:['select * from ajustes_inventario where producto_id=$1 and empresa_id=$2 and sucursal_id=$3 order by id',args],
 prices:['select pp.* from precios_producto pp join productos p on p.id=pp.producto_id where pp.producto_id=$1 and p.empresa_id=$2 and (pp.sucursal_id=$3 or pp.sucursal_id is null) order by pp.id',args],
 audit:["select id,accion,entidad,entidad_id,detalle,created_at from auditoria where empresa_id=$2 and (entidad_id=$1 or detalle->>'producto_id'=$1::text or entidad_id in(select id from lotes where producto_id=$1 and sucursal_id=$3)) order by id",args]};
 const data={};for(const [key,[sql,params]]of Object.entries(sets))data[key]=canonical((await db.query(sql,params)).rows);
 const fingerprints=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,sha(v)]));
 return {data,fingerprints};
}
function scope(p,database){
 need(database===p.database,'DATABASE_CHANGED');
 if(p.laboratory){need(process.env.EDUXFAC_REPAIR_LAB==='yes'&&process.platform==='linux'&&fs.existsSync('/.dockerenv')&&fileURLToPath(import.meta.url).startsWith('/stage/EDUXFAC/'),'ISOLATED_LAB_REQUIRED');}
 else{for(const k of ['database','empresaId','sucursalId','productoId'])need(p[k]===PILOT[k],'PILOT_SCOPE_INVALID');need(JSON.stringify(p.lots.map(l=>l.id).sort())===JSON.stringify([...PILOT.lotIds].sort()),'THREE_LOTS_ONLY');}
}
function validate(p,s){
 need(p.lots.length===3&&s.data.lots.length===3,'THREE_LOTS_ONLY');need(s.data.product.length===1&&s.data.product[0].nombre===p.productName,'PRODUCT_CHANGED');
 need(s.data.sale_details.length===0&&s.data.purchase_details.length===0&&s.data.returns.length===0,'HISTORY_BASELINE_CHANGED');
 need(JSON.stringify(s.fingerprints)===JSON.stringify(p.expectedFingerprints),'BASELINE_CHANGED');
 const physical={EDU1:[3,3,45],EDU2:[4,3,60],EDU3:[5,5,75]};
 for(const expected of p.lots){const fixed=physical[expected.numero_lote];need(fixed&&Number(expected.cantidad_inicial)===fixed[0]&&Number(expected.cantidad_disponible)===fixed[1]&&Number(expected.valor_base_costos)===fixed[2]&&Number(expected.costo_unitario)===15,'EXACT_PHYSICAL_BASELINE_REQUIRED');const l=s.data.lots.find(l=>l.id===expected.id);need(!!l,'LOT_MISSING');for(const k of ['numero_lote','cantidad_inicial','cantidad_disponible','costo_unitario','valor_base_costos'])need(String(l[k])===String(expected[k]),'LOT_BASELINE_CHANGED');
  const ms=s.data.movements.filter(m=>m.lote_id===l.id),initial=ms.filter(m=>m.tipo==='INVENTARIO_INICIAL');
  need(initial.length===1&&Number(initial[0].cantidad)===Number(l.cantidad_inicial)&&Number(initial[0].costo_unitario)===15,'INITIAL_PROVENANCE_CHANGED');
  need(Number(l.valor_base_costos)===Number(initial[0].cantidad)*15,'DUPLICATED_OPENING_NOT_PROVEN');
  need(ms.every(m=>m.tipo==='INVENTARIO_INICIAL'||m.tipo==='AJUSTE_EXCEL_STOCK'),'UNEXPECTED_MOVEMENT');
  need(ms.reduce((a,m)=>a+Number(m.cantidad),0)===Number(l.cantidad_disponible),'STOCK_LEDGER_MISMATCH');
  need(ms.every(m=>Number(m.costo_unitario)===15),'MOVEMENT_COST_CHANGED');
 }
 need(s.data.lots.reduce((a,l)=>a+Number(l.cantidad_disponible),0)===11,'STOCK_NOT_11');
}
export async function repairOpening(db,p,{apply=false,backup=null}={}){
 await db.query(apply?'BEGIN ISOLATION LEVEL SERIALIZABLE':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  const identity=(await db.query("select current_database() database,current_setting('transaction_read_only') read_only,current_user database_role")).rows[0];scope(p,identity.database);
  if(apply){await db.query('select producto_id from producto_sucursal where producto_id=$1 and sucursal_id=$2 for update',[p.productoId,p.sucursalId]);await db.query('select id from lotes where producto_id=$1 and sucursal_id=$2 order by id for update',[p.productoId,p.sucursalId]);}
  const before=await capture(db,p);validate(p,before);const planHash=sha(p);
  const changes=p.lots.map(l=>({lote_id:l.id,lote:l.numero_lote,antes:l.valor_base_costos,despues:'0',stock:l.cantidad_disponible,costo:l.costo_unitario}));
  if(!apply){await db.query('ROLLBACK');return {dry_run:true,plan_sha256:planHash,changes,before,stock_total:11};}
  need(backup&&backup.plan_sha256===planHash&&backup.snapshot_sha256===sha(backup.snapshot)&&JSON.stringify(backup.snapshot)===JSON.stringify(before),'VERIFIED_BACKUP_REQUIRED');
  const cols=ls=>ls.map(({valor_base_costos,...rest})=>rest);
  for(const l of p.lots){const r=await db.query('update lotes set valor_base_costos=0 where id=$1 and producto_id=$2 and sucursal_id=$3 and valor_base_costos=$4 returning id',[l.id,p.productoId,p.sucursalId,l.valor_base_costos]);need(r.rowCount===1,'CONDITIONAL_UPDATE_FAILED');}
  const audit=(await db.query("insert into auditoria(empresa_id,usuario_id,accion,entidad,entidad_id,detalle) values($1,null,'REPARAR_APERTURA_INICIAL','productos',$2,$3::jsonb) returning id",[p.empresaId,p.productoId,JSON.stringify({plan_sha256:planHash,changes,operador_so:os.userInfo().username,rol_postgresql:identity.database_role,motivo:'Eliminar apertura duplicada ya representada por INVENTARIO_INICIAL; stock e históricos intactos',stock_total:11,backup_sha256:backup.snapshot_sha256})])).rows[0];
  const after=await capture(db,p);need(JSON.stringify(cols(before.data.lots))===JSON.stringify(cols(after.data.lots)),'PHYSICAL_LOTS_CHANGED');
  for(const k of Object.keys(before.fingerprints).filter(k=>!['lots','audit'].includes(k)))need(before.fingerprints[k]===after.fingerprints[k],'PROTECTED_HISTORY_CHANGED');
  need(after.data.audit.length===before.data.audit.length+1&&after.data.audit.some(a=>String(a.id)===String(audit.id)),'AUDIT_INVALID');
  need(JSON.stringify(before.data.audit)===JSON.stringify(after.data.audit.filter(a=>String(a.id)!==String(audit.id))),'OLD_AUDIT_CHANGED');
  need(after.data.lots.every(l=>Number(l.valor_base_costos)===0),'OPENING_NOT_ZERO');
  for(const l of after.data.lots){const value=after.data.movements.filter(m=>m.lote_id===l.id).reduce((v,m)=>v+Number(m.cantidad)*Number(m.costo_unitario),0);need(value===Number(l.cantidad_disponible)*15,'FINAL_VALUE_INVALID');}
  await db.query('COMMIT');return {applied:true,stock_total:11,changes,audit_id:audit.id,plan_sha256:planHash};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
// CLI uses existing private VPS configuration internally; never prints secrets.
if(process.argv[1]&&fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1])){
 const args=process.argv.slice(2);const at=n=>args[args.indexOf(n)+1];const planPath=at('--plan');
 need(args.includes('--plan')&&planPath,'PLAN_REQUIRED');const p=JSON.parse(fs.readFileSync(planPath,'utf8'));
 need(!p.laboratory,'CLI_PILOT_PLAN_ONLY');need(args.filter(x=>['--dry-run','--backup','--apply'].includes(x)).length===1,'ONE_MODE_REQUIRED');
 const [{default:pg}]=await Promise.all([import('/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js')]);
 const secrets=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json','utf8'));
 const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:PILOT.database,user:'eduxfac_web_migrator',password:secrets.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c statement_timeout=15000 -c lock_timeout=5000'+(args.includes('--apply')?'':' -c default_transaction_read_only=on')});
 await db.connect();try{
  if(args.includes('--backup')){const out=at('--backup');need(out&&out.startsWith('/home/eduxadmin/')&&!fs.existsSync(out),'NEW_PRIVATE_BACKUP_PATH_REQUIRED');const dry=await repairOpening(db,p);const data={plan_sha256:sha(p),snapshot:dry.before,snapshot_sha256:sha(dry.before)};fs.writeFileSync(out,JSON.stringify(data,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({backup:out,file_sha256:sha(fs.readFileSync(out)),snapshot_sha256:data.snapshot_sha256,read_only:true}));}
  else{const backup=args.includes('--backup-file')?JSON.parse(fs.readFileSync(at('--backup-file'),'utf8')):null;const result=await repairOpening(db,p,{apply:args.includes('--apply'),backup});delete result.before;console.log(JSON.stringify(result));}
 }catch(e){console.error(JSON.stringify({result:'DETENER',code:e.message}));process.exitCode=1;}finally{await db.end();}
}
