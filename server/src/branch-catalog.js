import ExcelJS from 'exceljs';

export async function linkProduct(db, productId, branchId, values={}) {
  const q=await db.query(`insert into producto_sucursal(producto_id,sucursal_id,stock_minimo,stock_maximo,activo,origen)
    select p.id,s.id,coalesce($3,0),coalesce($4,0),coalesce($5,true),'operacion'
    from productos p join sucursales s on s.empresa_id=p.empresa_id where p.id=$1 and s.id=$2
    on conflict(producto_id,sucursal_id) do update set
      stock_minimo=coalesce($3,producto_sucursal.stock_minimo),stock_maximo=coalesce($4,producto_sucursal.stock_maximo),
      activo=coalesce($5,producto_sucursal.activo) returning *`,
    [productId,branchId,values.stock_minimo??null,values.stock_maximo??null,values.activo??null]);
  if(!q.rows[0])throw new Error('Producto no disponible para esta empresa/sucursal.');
  return q.rows[0];
}

export async function inventoryWorkbook(db, companyId, branchId) {
  const rows=(await db.query(`select p.codigo_interno,p.codigo_barras,p.nombre,p.presentacion,p.unidad_medida,
    c.nombre categoria,ps.stock_minimo,ps.stock_maximo,ps.activo,
    l.numero_lote,l.fecha_vencimiento,coalesce(l.cantidad_disponible,0) stock,
    coalesce(l.costo_unitario,0) costo,coalesce(l.cantidad_disponible*l.costo_unitario,0) valor,
    (select pp.precio_venta from precios_producto pp where pp.producto_id=p.id and (pp.sucursal_id=$2 or pp.sucursal_id is null)
      and pp.vigente_hasta is null and pp.factor_unidades=1 order by pp.sucursal_id nulls last,pp.vigente_desde desc,pp.id desc limit 1) precio
    from producto_sucursal ps join productos p on p.id=ps.producto_id
    left join categorias c on c.id=p.categoria_id left join lotes l on l.producto_id=p.id and l.sucursal_id=ps.sucursal_id
    where p.empresa_id=$1 and ps.sucursal_id=$2 order by p.nombre,l.fecha_vencimiento nulls last,l.numero_lote`,[companyId,branchId])).rows;
  const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('Inventario real');
  ws.columns=[['Código interno','codigo_interno'],['Código de barras','codigo_barras'],['Producto','nombre'],['Presentación','presentacion'],['Unidad de medida','unidad_medida'],['Categoría','categoria'],['Stock del lote','stock'],['Stock mínimo del producto','stock_minimo'],['Stock máximo del producto','stock_maximo'],['Costo unitario del lote','costo'],['Precio de venta unidad','precio'],['Lote','numero_lote'],['Vencimiento','fecha_vencimiento'],['Valor del stock','valor'],['Activo en sucursal','activo']].map(([header,key])=>({header,key,width:key==='nombre'?45:24}));
  for(const row of rows){for(const k of ['stock','stock_minimo','stock_maximo','costo','precio','valor'])if(row[k]!=null)row[k]=Number(row[k]);row.activo=row.activo?'Sí':'No';ws.addRow(row);}
  ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:'A1',to:'O1'};ws.getRow(1).font={bold:true};
  ws.getColumn('fecha_vencimiento').numFmt='dd/mm/yyyy';
  for(const k of ['stock','stock_minimo','stock_maximo'])ws.getColumn(k).numFmt='0.000';
  for(const k of ['costo','precio','valor'])ws.getColumn(k).numFmt='0.0000';
  const notes=wb.addWorksheet('Información');
  const branch=(await db.query('select nombre from sucursales where id=$1',[branchId])).rows[0];
  notes.addRow(['Sucursal',branch.nombre]);notes.addRow(['Generado',new Date()]);
  notes.addRow(['Criterio','Una fila por lote; productos sin lotes figuran con stock cero. Sume Stock del lote y Valor del stock.']);
  notes.addRow(['Mínimo/máximo','Son del producto en esta sucursal; se repiten por lote y no deben sumarse.']);
  notes.addRow(['Campos','Tipo y subtipo no existen como atributos de producto en la base actual.']);
  notes.columns=[{width:22},{width:110}];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
