// Invoked only for a NEW sale inside its transaction, before payments/commit.
// PostgreSQL numeric performs the comparison; no client-supplied cost or profit is trusted.
export async function validateSalePresentation(db,empresaId,branch,item){
 const scale=(value,digits,label)=>{
  if(value!==Number(value.toFixed(digits)))throw Object.assign(Error(label+' tiene demasiados decimales.'),{status:400,code:'VENTA_PRECISION_INVALIDA'});
 };
 scale(item.cantidad,3,'Cantidad');scale(item.precio,2,'Precio');scale(item.factor,3,'Equivalencia');
 if(item.factor<1)throw Object.assign(Error('Presentación de venta inválida.'),{status:400,code:'PRESENTACION_INVALIDA'});
 const result=await db.query(
  "select p.id from productos p where p.id=$1 and p.empresa_id=$2 and (( $4::numeric=1 and upper(coalesce(nullif(btrim(p.unidad_medida),''),'UNIDAD'))=$5) or exists(select 1 from precios_producto pp where pp.producto_id=p.id and (pp.sucursal_id=$3 or pp.sucursal_id is null) and pp.vigente_hasta is null and pp.factor_unidades=$4 and upper(btrim(pp.tipo))=$5))",
  [item.producto_id,empresaId,branch,item.factor,item.tipo_venta]);
 if(!result.rowCount)throw Object.assign(Error('La presentación y su equivalencia no corresponden al producto.'),{status:400,code:'PRESENTACION_INVALIDA'});
}

export async function assertSaleProfitability(db,saleId,empresaId){
 const {rows}=await db.query(String.raw`
  with priced as (
   select vd.*,p.nombre,
    coalesce(
     (select l.costo_unitario from lotes l where l.id=vd.lote_id and l.producto_id=vd.producto_id and l.sucursal_id=v.sucursal_id and l.costo_unitario>0),
     case when vd.costo_snapshot>0 then vd.costo_snapshot/coalesce(nullif(vd.factor_unidades,0),1) end,
     coalesce(
     (select cd.costo_unitario from lotes actual join compra_detalles cd on cd.id=actual.compra_detalle_id
       join compras purchase on purchase.id=cd.compra_id
       where actual.id=vd.lote_id and cd.producto_id=vd.producto_id and purchase.empresa_id=v.empresa_id and purchase.sucursal_id=v.sucursal_id limit 1),
     (select cd.costo_unitario from compra_detalles cd join compras purchase on purchase.id=cd.compra_id
       where cd.producto_id=vd.producto_id and purchase.empresa_id=v.empresa_id and purchase.sucursal_id=v.sucursal_id
       and purchase.created_at<=v.created_at order by purchase.fecha desc,purchase.created_at desc,cd.id desc limit 1),
     (select mi.costo_unitario from movimientos_inventario mi where mi.producto_id=vd.producto_id and mi.empresa_id=v.empresa_id
       and mi.sucursal_id=v.sucursal_id and mi.costo_unitario>0 and mi.created_at<=v.created_at
       and mi.tipo not in ('VENTA','AJUSTE_EXCEL_STOCK') order by mi.created_at desc,mi.id desc limit 1),
     (select l.costo_unitario from lotes l where l.producto_id=vd.producto_id and l.sucursal_id=v.sucursal_id
       and l.costo_unitario>0 order by case when l.numero_lote='AJUSTE-EXCEL' then 1 else 0 end,l.id desc limit 1)
    )) coste_base
   from venta_detalles vd join ventas v on v.id=vd.venta_id join productos p on p.id=vd.producto_id and p.empresa_id=v.empresa_id
   where vd.venta_id=$1 and v.empresa_id=$2
  ), grouped as (
   select producto_id,nombre producto,presentacion_venta presentacion,factor_unidades,precio_unitario precio_venta,
    sum(cantidad_base)/factor_unidades cantidad,sum(importe_neto) ingreso_neto,sum(cantidad_base*coste_base) costo_total,
    bool_and(coste_base is not null) costo_verificable
   from priced group by producto_id,nombre,presentacion_venta,factor_unidades,precio_unitario
  )
  select *,round(ingreso_neto/nullif(cantidad,0),7) precio_venta_neto,
   case when costo_verificable then round(costo_total/nullif(cantidad,0),7) end costo,
   case when costo_verificable then round((ingreso_neto-costo_total)/nullif(cantidad,0),7) end utilidad,
   case when costo_verificable then ingreso_neto-costo_total end utilidad_total,
   case when not costo_verificable then 'COSTO_NO_VERIFICABLE' else 'UTILIDAD_NO_POSITIVA' end motivo
  from grouped where not costo_verificable or ingreso_neto<=costo_total
  order by producto,producto_id,precio_venta
`,[saleId,empresaId]);
 if(!rows.length)return;
 const missing=rows.some(x=>!x.costo_verificable);
 const error=Error(missing?'Venta no permitida. No existe un costo verificable para uno o más productos. Registre o revise el costo antes de continuar.':'Venta no permitida. El precio de venta es igual o menor al costo del producto. Modifique el precio antes de continuar.');
 error.status=422;error.code=missing?'VENTA_COSTO_NO_VERIFICABLE':'VENTA_SIN_RENTABILIDAD';
 error.productos=rows;throw error;
}
