// Prepared only. No connection or execution on import. Client is supplied by
// a future authorized operator; all mutations are enclosed in one transaction.
import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {prepareStockCosts,reconcileStockCosts} from '../../server/src/stock-cost.js';
export async function repairApronax(client,plan,{apply=false,backupVerified=false,physicalLotConfirmed=false}={}){
 if(apply&&(backupVerified!==true||physicalLotConfirmed!==true))throw Error('BACKUP_AND_PHYSICAL_BATCH_CONFIRMATION_REQUIRED');
 const database=(await client.query('select current_database() name')).rows[0].name;
 if(database!=='eduxfac_web_piloto'&&!(plan.laboratory===true&&process.platform==='linux'&&existsSync('/.dockerenv')&&process.env.EDUXFAC_PROFIT_NATIVE==='yes'))throw Error('REPAIR_ONLY_PILOT_OR_ISOLATED_LAB');
 const {empresaId,sucursalId,productoId,saldoSinLoteId,loteRealId}=plan;
 let usuarioId=plan.usuarioId;
 if(!usuarioId){
  const actor=(await client.query('select id from usuarios where empresa_id=$1 and usuario=$2 and activo=true',[empresaId,plan.usuario||'edwinpiloto'])).rows;
  if(actor.length!==1)throw Error('REPAIR_ACTOR_REQUIRED');usuarioId=actor[0].id;
 }
 const qty='120',cost='1.57',reference=randomUUID();
 await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");
  const scope=(await client.query('select p.empresa_id,s.empresa_id branch_company,u.empresa_id actor_company from productos p join sucursales s on s.id=$2 join usuarios u on u.id=$3 where p.id=$1',[productoId,sucursalId,usuarioId])).rows[0];
  if(!scope||[scope.empresa_id,scope.branch_company,scope.actor_company].some(x=>x!==empresaId))throw Error('REPAIR_SCOPE_CHANGED');
  await client.query('select producto_id from producto_sucursal where producto_id=$1 and sucursal_id=$2 for update',[productoId,sucursalId]);
  const lots=(await client.query('select * from lotes where producto_id=$1 and sucursal_id=$2 order by id for update',[productoId,sucursalId])).rows;
  const from=lots.find(l=>l.id===saldoSinLoteId),to=lots.find(l=>l.id===loteRealId);
  if(lots.length!==2||!from||!to||from.numero_lote!==null||from.fecha_vencimiento!==null||Number(from.cantidad_disponible)!==120||Number(from.costo_unitario)!==0||to.numero_lote!=='DFDF'||Number(to.cantidad_disponible)!==0||Number(to.costo_unitario)!==1.57)throw Error('REPAIR_BASELINE_CHANGED_STOP');
  const purchase=(await client.query('select cd.cantidad,cd.costo_unitario,cd.total,c.empresa_id,c.sucursal_id from compra_detalles cd join compras c on c.id=cd.compra_id where cd.id=$1 and cd.producto_id=$2',[to.compra_detalle_id,productoId])).rows[0];
  if(!purchase||purchase.empresa_id!==empresaId||purchase.sucursal_id!==sucursalId||Number(purchase.cantidad)!==120||Number(purchase.costo_unitario)!==1.57||Number(purchase.total)!==188.4)throw Error('REPAIR_PURCHASE_PROOF_FAILED');
  const trace=(await client.query('select count(distinct v.id)::int sales,bool_and(v.estado=$2) cancelled from ventas v join venta_detalles vd on vd.venta_id=v.id where vd.producto_id=$1 and v.empresa_id=$3 and v.sucursal_id=$4',[productoId,'ANULADA',empresaId,sucursalId])).rows[0];
  if(trace.sales!==3||!trace.cancelled)throw Error('REPAIR_SALES_CHANGED_STOP');
  const ledger=(await client.query('select coalesce(sum(cantidad),0) qty,coalesce(sum(cantidad*coalesce(costo_unitario,0)),0) value from movimientos_inventario where lote_id=$1 and producto_id=$2 and sucursal_id=$3 and empresa_id=$4',[saldoSinLoteId,productoId,sucursalId,empresaId])).rows[0];
  if(Number(ledger.qty)!==120||Number(ledger.value)!==188.4)throw Error('REPAIR_LEDGER_CHANGED_STOP');
  await prepareStockCosts(client,{empresaId,sucursalId,productoId});
  await client.query('update lotes set cantidad_disponible=cantidad_disponible-$2::numeric where id=$1',[saldoSinLoteId,qty]);
  await client.query('update lotes set cantidad_disponible=cantidad_disponible+$2::numeric where id=$1',[loteRealId,qty]);
  for(const [lot,quantity]of [[saldoSinLoteId,'-120'],[loteRealId,'120']])await client.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id,usuario_id)
   values($1,$2,$3,$4,'RECLASIFICACION_COSTO',$5,$6,'REPARACION_COSTO',$7,$8)`,[empresaId,sucursalId,productoId,lot,quantity,cost,reference,usuarioId]);
  await reconcileStockCosts(client,{empresaId,sucursalId,productoId,usuarioId,referenciaTipo:'REPARACION_COSTO',referenciaId:reference});
  await client.query(`insert into auditoria(empresa_id,usuario_id,accion,entidad,entidad_id,detalle) values($1,$2,'REPARAR_VALORIZACION_APRONAX','productos',$3,$4::jsonb)`,[empresaId,usuarioId,productoId,JSON.stringify({reference,from:saldoSinLoteId,to:loteRealId,cantidad:qty,costo:cost,stock_total_antes:'120',stock_total_despues:'120',valor_despues:'188.40',historia_preservada:true})]);
  const final=(await client.query('select sum(cantidad_disponible) qty,sum(cantidad_disponible*costo_unitario) value from lotes where producto_id=$1 and sucursal_id=$2',[productoId,sucursalId])).rows[0];
  if(Number(final.qty)!==120||Math.abs(Number(final.value)-188.4)>1e-8)throw Error('REPAIR_POSTCHECK_FAILED');
  await client.query(apply?'COMMIT':'ROLLBACK');
  return {applied:apply,dry_run:!apply,reference,stock:'120',value:'188.40',quantity_delta:'0',historical_business_rows_updated:false};
 }catch(e){await client.query('ROLLBACK');throw e;}
}
