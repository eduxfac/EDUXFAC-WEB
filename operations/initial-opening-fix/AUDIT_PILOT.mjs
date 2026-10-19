import fs from 'node:fs';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js';
const s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json','utf8'));
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_web_piloto',user:'eduxfac_web_migrator',password:s.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c default_transaction_read_only=on -c statement_timeout=10000'});


import assert from 'node:assert/strict';
import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
export const PILOT={database:'eduxfac_web_piloto',empresaId:'8678361e-91ec-4bb2-877f-42ea2893d39e',sucursalId:'11b36867-46b5-40a1-9d0a-8a773b318d8d',productoId:'d0cd1f3b-cdc1-4e8f-aef6-939f5debc8fe',lotIds:['c77e5814-875d-4b7f-a818-82ba4140922f','16a942c2-9776-4a80-8251-1187421adb6f','b1dedd3b-54b2-44f7-aa88-19bca8d64e04']};
export const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
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
 for(const expected of p.lots){const l=s.data.lots.find(l=>l.id===expected.id);need(!!l,'LOT_MISSING');for(const k of ['numero_lote','cantidad_inicial','cantidad_disponible','costo_unitario','valor_base_costos'])need(String(l[k])===String(expected[k]),'LOT_BASELINE_CHANGED');
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
  const identity=(await db.query("select current_database() database,current_setting('transaction_read_only') read_only")).rows[0];scope(p,identity.database);
  if(apply){await db.query('select producto_id from producto_sucursal where producto_id=$1 and sucursal_id=$2 for update',[p.productoId,p.sucursalId]);await db.query('select id from lotes where producto_id=$1 and sucursal_id=$2 order by id for update',[p.productoId,p.sucursalId]);}
  const before=await capture(db,p);validate(p,before);const planHash=sha(p);
  const changes=p.lots.map(l=>({lote_id:l.id,lote:l.numero_lote,antes:l.valor_base_costos,despues:'0',stock:l.cantidad_disponible,costo:l.costo_unitario}));
  if(!apply){await db.query('ROLLBACK');return {dry_run:true,plan_sha256:planHash,changes,before,stock_total:11};}
  need(backup&&backup.plan_sha256===planHash&&backup.snapshot_sha256===sha(backup.snapshot)&&JSON.stringify(backup.snapshot)===JSON.stringify(before),'VERIFIED_BACKUP_REQUIRED');
  const cols=ls=>ls.map(({valor_base_costos,...rest})=>rest);
  for(const l of p.lots){const r=await db.query('update lotes set valor_base_costos=0 where id=$1 and producto_id=$2 and sucursal_id=$3 and valor_base_costos=$4 returning id',[l.id,p.productoId,p.sucursalId,l.valor_base_costos]);need(r.rowCount===1,'CONDITIONAL_UPDATE_FAILED');}
  const audit=(await db.query("insert into auditoria(empresa_id,usuario_id,accion,entidad,entidad_id,detalle) values($1,null,'REPARAR_APERTURA_INICIAL','productos',$2,$3::jsonb) returning id",[p.empresaId,p.productoId,JSON.stringify({plan_sha256:planHash,changes,motivo:'Eliminar apertura duplicada ya representada por INVENTARIO_INICIAL; stock e históricos intactos',stock_total:11,backup_sha256:backup.snapshot_sha256})])).rows[0];
  const after=await capture(db,p);need(JSON.stringify(cols(before.data.lots))===JSON.stringify(cols(after.data.lots)),'PHYSICAL_LOTS_CHANGED');
  for(const k of Object.keys(before.fingerprints).filter(k=>!['lots','audit'].includes(k)))need(before.fingerprints[k]===after.fingerprints[k],'PROTECTED_HISTORY_CHANGED');
  need(after.data.audit.length===before.data.audit.length+1&&after.data.audit.some(a=>String(a.id)===String(audit.id)),'AUDIT_INVALID');
  need(JSON.stringify(before.data.audit)===JSON.stringify(after.data.audit.filter(a=>String(a.id)!==String(audit.id))),'OLD_AUDIT_CHANGED');
  need(after.data.lots.every(l=>Number(l.valor_base_costos)===0),'OPENING_NOT_ZERO');
  await db.query('COMMIT');return {applied:true,stock_total:11,changes,audit_id:audit.id,plan_sha256:planHash};
 }catch(e){await db.query('ROLLBACK');throw e;}
}

await db.connect();try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const identity=(await db.query("select current_database() db,current_setting('transaction_read_only') read_only")).rows[0];need(identity.db==='eduxfac_web_piloto'&&identity.read_only==='on','READONLY_REQUIRED');
 const company=(await db.query("select id from empresas where ruc='10460023039'")).rows;need(company.length===1&&company[0].id===PILOT.empresaId,'COMPANY_SCOPE_CHANGED');
 const audited=(await db.query(`select p.id producto_id,p.codigo_interno,p.nombre,s.codigo sucursal,l.id lote_id,l.numero_lote,l.cantidad_disponible,l.costo_unitario,l.valor_base_costos,
 init.n movimientos_iniciales,init.qty stock_inicial_movimiento,init.value valor_movimiento_inicial,
 (l.valor_base_costos>0 and init.value>0) apertura_mas_movimiento,
 (l.valor_base_costos=init.value and init.value>0) coincidencia_exacta,
 case when l.valor_base_costos>0 and init.value>0 then least(l.valor_base_costos,init.value) else 0 end valor_potencial_duplicado,
 allm.value valor_neto_movimientos,l.valor_base_costos+allm.value valor_ledger_con_apertura,
 (l.cantidad_disponible*l.costo_unitario)::text valor_lote_actual
 from productos p join lotes l on l.producto_id=p.id join sucursales s on s.id=l.sucursal_id and s.empresa_id=p.empresa_id
 join lateral(select count(*)::int n,sum(m.cantidad) qty,sum(m.cantidad*m.costo_unitario) value from movimientos_inventario m where m.producto_id=p.id and m.lote_id=l.id and m.sucursal_id=l.sucursal_id and m.empresa_id=p.empresa_id and m.tipo='INVENTARIO_INICIAL') init on init.n>0
 left join lateral(select coalesce(sum(m.cantidad*coalesce(m.costo_unitario,0)),0) value from movimientos_inventario m where m.producto_id=p.id and m.lote_id=l.id and m.sucursal_id=l.sucursal_id and m.empresa_id=p.empresa_id) allm on true
 where p.empresa_id=$1 order by p.codigo_interno,s.codigo,l.numero_lote`,[PILOT.empresaId])).rows;
 const counts=(await db.query('select count(*)::int productos from productos where empresa_id=$1',[PILOT.empresaId])).rows[0];
 const snap=await capture(db,PILOT),lots=snap.data.lots;
 const plan={...PILOT,productName:'ABRILAR JARABE 120ML',lots:lots.map(l=>Object.fromEntries(['id','numero_lote','cantidad_inicial','cantidad_disponible','costo_unitario','valor_base_costos'].map(k=>[k,l[k]]))),expectedFingerprints:snap.fingerprints};delete plan.lotIds;validate(plan,snap);
 await db.query('ROLLBACK');console.log(JSON.stringify({identity,company_product_count:counts.productos,initial_inventory_lots:audited,plan,plan_sha256:sha(plan),read_only:true},null,2));
}finally{await db.end()}
