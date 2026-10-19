const roundedQuantity = value => Number(Number(value).toFixed(3));

export async function applyPositiveStockEntry(db, {
  empresaId, sucursalId, productoId, loteId, cantidad, costoUnitario=0,
  tipo, referenciaTipo, referenciaId=null, usuarioId=null, increaseInitial=false
}) {
  const quantity=roundedQuantity(cantidad);
  if(!Number.isFinite(quantity)||quantity<=0)throw new Error('La entrada de stock debe ser positiva.');

  const linked=await db.query(`select 1 from producto_sucursal ps join productos p on p.id=ps.producto_id join sucursales s on s.id=ps.sucursal_id and s.empresa_id=p.empresa_id
    where ps.producto_id=$1 and ps.sucursal_id=$2 and p.empresa_id=$3 for update of ps`,[productoId,sucursalId,empresaId]);
  if(!linked.rowCount)throw new Error('El producto no está vinculado a la sucursal.');

  // Lock every balance for the product/branch. This serializes purchases, sales,
  // returns and adjustments, and makes debt settlement part of the same transaction.
  const balances=await db.query(`select id,numero_lote,fecha_vencimiento,cantidad_disponible
    from lotes where producto_id=$1 and sucursal_id=$2 order by id for update`,[productoId,sucursalId]);
  const target=balances.rows.find(row=>row.id===loteId);
  if(!target)throw new Error('El lote de entrada no pertenece al producto y sucursal.');

  await db.query(`update lotes set cantidad_disponible=cantidad_disponible+$2,
    cantidad_inicial=cantidad_inicial+case when $3::boolean then $2 else 0 end where id=$1`,[loteId,quantity,increaseInitial]);
  await db.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id,usuario_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[empresaId,sucursalId,productoId,loteId,tipo,quantity,costoUnitario||0,referenciaTipo,referenciaId,usuarioId]);

  let available=quantity;
  let compensated=0;
  const debts=balances.rows.filter(row=>row.id!==loteId&&row.numero_lote===null&&row.fecha_vencimiento===null&&Number(row.cantidad_disponible)<0);
  for(const debt of debts){
    if(available<=0)break;
    const applied=roundedQuantity(Math.min(available,-Number(debt.cantidad_disponible)));
    if(applied<=0)continue;
    await db.query('update lotes set cantidad_disponible=cantidad_disponible+$2 where id=$1',[debt.id,applied]);
    await db.query('update lotes set cantidad_disponible=cantidad_disponible-$2 where id=$1',[loteId,applied]);
    await db.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id,usuario_id)
      values($1,$2,$3,$4,'COMPENSACION_DEUDA',$5,$6,$7,$8,$9)`,[empresaId,sucursalId,productoId,debt.id,applied,costoUnitario||0,referenciaTipo,referenciaId,usuarioId]);
    await db.query(`insert into movimientos_inventario(empresa_id,sucursal_id,producto_id,lote_id,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id,usuario_id)
      values($1,$2,$3,$4,'COMPENSACION_DEUDA',$5,$6,$7,$8,$9)`,[empresaId,sucursalId,productoId,loteId,-applied,costoUnitario||0,referenciaTipo,referenciaId,usuarioId]);
    available=roundedQuantity(available-applied);
    compensated=roundedQuantity(compensated+applied);
  }
  return {cantidad:quantity,compensada:compensated,remanente:available};
}
