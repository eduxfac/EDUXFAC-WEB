(() => {
 const currency=value=>value==null?'No verificable':'S/ '+new Intl.NumberFormat('es-PE',{minimumFractionDigits:2,maximumFractionDigits:7}).format(Number(value));
 window.eduxfacShowSaleProfitability=async error=>{
  const missing=error.code==='VENTA_COSTO_NO_VERIFICABLE';
  const message=missing?'Venta no permitida.\nNo existe un costo verificable para uno o más productos.\nRegistre o revise el costo antes de continuar.':'Venta no permitida.\nEl precio de venta es igual o menor al costo del producto.\nModifique el precio antes de continuar.';
  const details=(error.productos||[]).map(p=>[
   String(p.producto||'Producto')+' — '+String(p.presentacion||'UNIDAD')+' × '+String(p.factor_unidades||1),
   'Cantidad: '+new Intl.NumberFormat('es-PE',{maximumFractionDigits:7}).format(Number(p.cantidad)),
   'Precio de venta: '+currency(p.precio_venta),
   'Precio neto por presentación: '+currency(p.precio_venta_neto),
   'Costo por presentación: '+currency(p.costo),
   'Utilidad estimada por presentación: '+currency(p.utilidad),
   'Utilidad estimada total: '+currency(p.utilidad_total),
   ...(p.motivo==='COSTO_NO_VERIFICABLE'?['Registre o revise el costo de este producto.']:[])
  ].join('\n')).join('\n\n');
  // showAppNotice renders textContent, never HTML from product names/API.
  await window.showAppNotice(message+(details?'\n\n'+details:''),{title:'Venta no permitida',acceptLabel:missing?'Revisar costo':'Revisar precios'});
 };
})();
