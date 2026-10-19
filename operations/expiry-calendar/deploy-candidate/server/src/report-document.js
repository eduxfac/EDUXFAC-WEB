const fail=(status,message)=>Object.assign(new Error(message),{status});

// No migrations, stock lookups, recalculation or audit writes are allowed here.
export async function readReportDocument(pool,user,type,id) {
  if(!['cancellations','purchases'].includes(type)) throw fail(404,'Tipo de detalle no encontrado.');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw fail(400,'Identificador inválido.');
  const db=await pool.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const header=type==='cancellations'
      ? await db.query(`select dv.id,dv.venta_id,dv.sucursal_id,dv.created_at fecha_anulacion,dv.motivo,dv.metodo_reembolso,dv.monto,
          v.created_at fecha_venta,v.tipo_comprobante tipo_documento,v.serie,v.numero,v.subtotal,v.descuento,v.total,
          s.nombre sucursal,coalesce(cl.nombres,'Público en general') cliente,cl.nro_doc cliente_documento,
          vendedor.nombre vendedor,anulador.nombre usuario_anulacion
        from devoluciones_venta dv join ventas v on v.id=dv.venta_id and v.empresa_id=dv.empresa_id
        join sucursales s on s.id=dv.sucursal_id
        left join clientes cl on cl.id=v.cliente_id left join usuarios vendedor on vendedor.id=v.usuario_id
        left join usuarios anulador on anulador.id=dv.usuario_id
        where dv.id=$1 and dv.empresa_id=$2 and dv.tipo='TOTAL'`,[id,user.empresa_id])
      : await db.query(`select c.id,c.sucursal_id,c.fecha,c.created_at fecha_registro,c.tipo_documento,c.serie,c.numero,c.total,c.moneda,c.observacion,
          to_jsonb(c)->>'descuento' descuento,s.nombre sucursal,pr.razon_social proveedor,pr.ruc proveedor_ruc,u.nombre usuario_registro
        from compras c join sucursales s on s.id=c.sucursal_id left join proveedores pr on pr.id=c.proveedor_id
        left join usuarios u on u.id=c.usuario_id where c.id=$1 and c.empresa_id=$2`,[id,user.empresa_id]);
    const document=header.rows[0];
    if(!document) throw fail(404,'Documento no encontrado.');
    const access=await db.query(`select 1 from usuario_sucursal us join sucursales s on s.id=us.sucursal_id
      where us.usuario_id=$1 and s.id=$2 and s.empresa_id=$3`,[user.sub,document.sucursal_id,user.empresa_id]);
    if(!access.rows.length) throw fail(403,'No tienes acceso a esta sucursal.');
    const items=type==='cancellations'
      ? await db.query(`select vd.id,vd.producto_id,p.codigo_interno codigo_referencia,p.nombre descripcion_referencia,
          vd.presentacion_venta presentacion,vd.cantidad,vd.precio_unitario,vd.descuento,vd.total subtotal,
          l.numero_lote lote_referencia
        from venta_detalles vd left join productos p on p.id=vd.producto_id left join lotes l on l.id=vd.lote_id
        where vd.venta_id=$1 order by vd.id`,[document.venta_id])
      : await db.query(`select cd.id,cd.producto_id,p.codigo_interno codigo_referencia,p.nombre descripcion_referencia,
          p.unidad_medida unidad_referencia,p.presentacion presentacion_referencia,cd.numero_lote lote,cd.fecha_vencimiento::text fecha_vencimiento,
          cd.cantidad,cd.costo_unitario precio_unitario,to_jsonb(cd)->>'descuento' descuento,cd.total subtotal
        from compra_detalles cd left join productos p on p.id=cd.producto_id where cd.compra_id=$1 order by cd.id`,[id]);
    const payments=type==='cancellations'
      ? (await db.query('select metodo,monto,referencia from venta_pagos where venta_id=$1 order by id',[document.venta_id])).rows : [];
    await db.query('COMMIT');
    return {tipo:type,documento:document,productos:items.rows,pagos:payments,referencias_actuales:true};
  } catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();}
}
