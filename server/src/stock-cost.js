// Immutable movements retain value across zero/negative quantity. Legacy
// balances without movements have a fixed opening value, initialized on first use.
export async function prepareStockCosts(db,{empresaId,sucursalId,productoId}){
 const linked=await db.query('select 1 from producto_sucursal ps join productos p on p.id=ps.producto_id where ps.producto_id=$1 and ps.sucursal_id=$2 and p.empresa_id=$3 for update of ps',[productoId,sucursalId,empresaId]);
 if(!linked.rowCount)throw Error('Producto/sucursal inválidos para conciliar costo.');
 await db.query('select id from lotes where producto_id=$1 and sucursal_id=$2 order by id for update',[productoId,sucursalId]);
 await db.query(`update lotes l set valor_base_costos=(l.cantidad_disponible-coalesce(
   (select sum(mi.cantidad) from movimientos_inventario mi where mi.lote_id=l.id and mi.producto_id=l.producto_id and mi.sucursal_id=l.sucursal_id and mi.empresa_id=$3),0))*l.costo_unitario
  where l.producto_id=$1 and l.sucursal_id=$2 and l.valor_base_costos is null`,[productoId,sucursalId,empresaId]);
}
export async function reconcileStockCosts(db,{empresaId,sucursalId,productoId,usuarioId=null,referenciaTipo=null,referenciaId=null}){
 await prepareStockCosts(db,{empresaId,sucursalId,productoId});
 const {rows}=await db.query(`with totals as(
  select l.id,l.cantidad_disponible stock,l.costo_unitario costo_anterior,l.valor_base_costos+
   coalesce((select sum(mi.cantidad*coalesce(mi.costo_unitario,0)) from movimientos_inventario mi where mi.lote_id=l.id and mi.producto_id=l.producto_id and mi.sucursal_id=l.sucursal_id and mi.empresa_id=$3),0) valor,
   (select mi.costo_unitario from movimientos_inventario mi where mi.lote_id=l.id and mi.producto_id=l.producto_id and mi.sucursal_id=l.sucursal_id and mi.empresa_id=$3 and mi.costo_unitario>0 order by mi.created_at desc,mi.id desc limit 1) costo_verificable
  from lotes l where l.producto_id=$1 and l.sucursal_id=$2
 ), resolved as(
  select *,case when stock>0 and valor>0 then valor/stock
    when costo_anterior>0 then costo_anterior
    else coalesce(costo_verificable,costo_anterior,0) end costo_nuevo
  from totals
 ), updated as(
  update lotes l set costo_unitario=r.costo_nuevo from resolved r
  where l.id=r.id and l.costo_unitario is distinct from r.costo_nuevo returning l.id
 )select r.* from resolved r join updated u on u.id=r.id`,[productoId,sucursalId,empresaId]);
 for(const r of rows)await db.query(`insert into auditoria(empresa_id,usuario_id,accion,entidad,entidad_id,detalle)
  values($1,$2,'CONCILIAR_COSTO_STOCK','lotes',$3,$4::jsonb)`,[empresaId,usuarioId,r.id,JSON.stringify({
   sucursal_id:sucursalId,producto_id:productoId,stock:r.stock,costo_anterior:r.costo_anterior,costo_nuevo:r.costo_nuevo,
   valor_movimientos_y_apertura:r.valor,referencia_tipo:referenciaTipo,referencia_id:referenciaId,
   origen:'MOVIMIENTOS_INMUTABLES_Y_APERTURA',requiere_revision_valor:Number(r.stock)>0&&Number(r.valor)<=0
  })]);
 return rows;
}
