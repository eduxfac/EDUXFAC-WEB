// Read-only additional sales view. The caller supplies the existing document filters and historical cost expression.
export async function salesProductReport(pool,{where,costExpr,params,query={}}){
 const page=Number(query.page??1),size=Number(query.page_size??100),all=query.all==='1';
 if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(size)||size<1||size>250)throw Object.assign(Error('Paginación inválida.'),{status:400});
 const c=await pool.connect();
 try{
  await c.query('begin isolation level repeatable read read only');
  await c.query('set local jit=off');
  const cte=`with matching as (select v.id,v.total from reporte_ventas_netas v left join clientes c on c.id=v.cliente_id where ${where}),
   payments as materialized (select vp.venta_id,string_agg(vp.metodo,', ' order by vp.metodo) metodo_pago
    from reporte_pagos_netos vp group by vp.venta_id),
   lines as (select min(vd.id::text) id,v.id venta_id,v.created_at,
    to_char(v.created_at at time zone 'America/Lima','DD/MM/YYYY HH24:MI') fecha,
    coalesce(v.numero,'') numero,v.tipo_comprobante,v.serie,
    coalesce(c.nombres,'Público en general') cliente,u.nombre cajero,s.nombre sucursal,
    coalesce(pay.metodo_pago,'') metodo_pago,p.id producto_id,p.codigo_interno,p.nombre producto,
    coalesce(vd.presentacion_venta,p.unidad_medida,'UNIDAD') unidad_medida,
    sum(vd.cantidad) cantidad,vd.precio_unitario,sum(vd.total) total,
    sum(vd.cantidad*${costExpr}) costo_total,
    sum(vd.total)-sum(vd.cantidad*${costExpr}) utilidad
   from matching m join reporte_ventas_netas v on v.id=m.id
    join reporte_detalles_netos vd on vd.venta_id=v.id
    join productos p on p.id=vd.producto_id join usuarios u on u.id=v.usuario_id
    join sucursales s on s.id=v.sucursal_id left join clientes c on c.id=v.cliente_id
    left join payments pay on pay.venta_id=v.id
   where vd.cantidad<>0 or vd.total<>0
   group by v.id,v.created_at,v.numero,v.tipo_comprobante,v.serie,c.nombres,u.nombre,s.nombre,pay.metodo_pago,
    p.id,p.codigo_interno,p.nombre,p.unidad_medida,vd.presentacion_venta,vd.precio_unitario)`;
  const summary=(await c.query(cte+` select count(*)::int detalles,count(distinct producto_id)::int productos,
   coalesce(sum(total),0)::numeric(14,2) ventas,coalesce(sum(cantidad),0) unidades,
   coalesce(sum(costo_total),0)::numeric(14,2) costo,coalesce(sum(utilidad),0)::numeric(14,2) utilidad,
   (select coalesce(sum(total),0)::numeric(14,2) from matching) ventas_documentos from lines`,params)).rows[0];
  const pages=Math.max(1,Math.ceil(summary.detalles/size)),current=Math.min(page,pages);
  const rows=(await c.query(cte+` select * from lines order by created_at desc,venta_id desc,producto,id`+(all?'':' limit $7 offset $8'),all?params:[...params,size,(current-1)*size])).rows;
  await c.query('commit');
  return {view:'products',descripcion:'Productos de ventas netas. La búsqueda selecciona documentos; se muestran todos sus productos.',summary,rows,
   pagination:{page:current,page_size:size,total:summary.detalles,pages},export_filters:{sucursal_id:params[1]||'',desde:params[2],hasta:params[3],q:params[4],usuario_id:params[5]||'',view:'products'}};
 }catch(e){await c.query('rollback').catch(()=>{});throw e;}finally{c.release();}
}
