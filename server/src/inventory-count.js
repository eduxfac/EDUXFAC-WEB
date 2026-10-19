import ExcelJS from 'exceljs';

const stockQuery = `select p.id,p.codigo_interno,p.codigo_barras,p.nombre,ps.stock_minimo,
  coalesce(sum(l.cantidad_disponible),0) stock,
  coalesce(sum(l.cantidad_disponible*l.costo_unitario),0) valor
  from producto_sucursal ps join productos p on p.id=ps.producto_id
  left join lotes l on l.producto_id=p.id and l.sucursal_id=ps.sucursal_id
  where p.empresa_id=$1 and ps.sucursal_id=$2 and ps.activo
  group by p.id,ps.stock_minimo`;

export async function inventorySummary(db, company, branch) {
  return (await db.query(`with inventory as (${stockQuery}) select count(*)::int total,
    count(*) filter(where stock>0)::int con_stock,
    count(*) filter(where stock>0 and stock<=stock_minimo)::int stock_bajo,
    count(*) filter(where stock<=0)::int sin_stock,coalesce(sum(valor),0) valor
    from inventory`,[company,branch])).rows[0];
}

// The export is informational: no cost reconciliation or product/price updates.
async function countExportRows(db,company,branch){
 const rows=(await db.query(`select inventory.*,
   (select pp.precio_venta from precios_producto pp
     where pp.producto_id=inventory.id and (pp.sucursal_id=$2 or pp.sucursal_id is null)
       and pp.vigente_hasta is null and pp.factor_unidades=1
     order by pp.sucursal_id nulls last,pp.vigente_desde desc,pp.id desc limit 1) precio
   from (${stockQuery}) inventory order by inventory.nombre,inventory.id`,[company,branch])).rows;
 const lots=(await db.query(`select l.id,l.producto_id,l.numero_lote,l.fecha_vencimiento::text fecha_vencimiento,
    l.cantidad_disponible,l.costo_unitario,
    (l.costo_unitario>0 or (l.costo_unitario=0 and (
      exists(select 1 from compra_detalles cd join compras c on c.id=cd.compra_id
        where cd.id=l.compra_detalle_id and cd.producto_id=l.producto_id
          and c.empresa_id=$1 and c.sucursal_id=$2 and cd.costo_unitario=0)
      or exists(select 1 from movimientos_inventario mi
        where mi.empresa_id=$1 and mi.sucursal_id=$2 and mi.producto_id=l.producto_id and mi.lote_id=l.id
          and mi.cantidad>0 and mi.tipo='INVENTARIO_INICIAL' and mi.costo_unitario=0)
    ))) costo_verificable
   from lotes l join productos p on p.id=l.producto_id
   join producto_sucursal ps on ps.producto_id=p.id and ps.sucursal_id=l.sucursal_id
   where p.empresa_id=$1 and l.sucursal_id=$2 and ps.activo
   order by l.producto_id,l.id`,[company,branch])).rows;
 const grouped=new Map();for(const lot of lots){if(!grouped.has(lot.producto_id))grouped.set(lot.producto_id,[]);grouped.get(lot.producto_id).push(lot);}
 for(const row of rows){
  const balances=grouped.get(row.id)||[],stock=Number(row.stock),value=Number(row.valor);
  row.costo_referencia=null;row.criterio_costo='Sin costo verificable; importación no toma costos del Excel.';
  if(stock>0){
   if(balances.filter(l=>Number(l.cantidad_disponible)!==0).every(l=>l.costo_verificable===true)&&value>=0){
    row.costo_referencia=value/stock;
    row.criterio_costo='Costo ponderado: valor actual de lotes / stock actual. Importes estimados; ajustes usan costos de sus lotes.';
   }
  }else{
   // Reuse the EXISTING surplus allocation policy. No invented date or lot order.
   const plan=await countPlan(db,row.id,branch,{lots:balances,total:stock},Math.max(0,stock)+1,stock);
   if(plan.lot?.costo_verificable===true){
    row.costo_referencia=Number(plan.lot.costo_unitario);
    row.criterio_costo='Sin stock positivo: costo verificable del lote que recibiría un sobrante según la regla vigente.';
   }
  }
 }
 return rows;
}
export async function countWorkbook(db, company, branch) {
 const rows=await countExportRows(db,company,branch);
 const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Conteo físico');
 wb.creator='EDUXFAC';wb.calcProperties.fullCalcOnLoad=true;
 ws.columns=[['Código interno',22],['Código de barras',24],['Producto',48],['Stock del sistema',20],
  ['Stock físico',20],['Falta',14],['Sobra',14],['Precio falta',20],['Precio sobra',20],
  ['Costo',20],['Precio venta',20],['Valorizado',22]].map(([header,width])=>({header,width}));
 ws.getRow(1).height=32;
 ws.getRow(1).eachCell((cell,column)=>{
  cell.font={bold:true,color:{argb:'FFFFFFFF'},size:11};
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:column===5?'FF926000':'FF0B376D'}};
  cell.alignment={vertical:'middle',wrapText:true};
 });
 for(const p of rows){
  const r=ws.addRow([p.codigo_interno,p.codigo_barras,p.nombre,Number(p.stock),null,null,null,null,null,
   p.costo_referencia,p.precio==null?null:Number(p.precio),null]),i=r.number;
  const e=r.getCell(5);e.protection={locked:false};
  e.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF2CC'}};
  e.dataValidation={type:'decimal',operator:'greaterThanOrEqual',formulae:[0],allowBlank:true,
   showErrorMessage:true,errorTitle:'Stock físico',error:'Ingrese una cantidad mayor o igual a cero (hasta 3 decimales).'};
  e.note='Única columna editable. Vacío = omitir; 0 = sin existencias. Unidades base; hasta 3 decimales.';
  const formulas={
   6:'IF(E'+i+'="","",ROUND(MAX(D'+i+'-E'+i+',0),3))',
   7:'IF(E'+i+'="","",ROUND(MAX(E'+i+'-D'+i+',0),3))',
   8:'IF(OR(E'+i+'="",NOT(ISNUMBER(J'+i+'))),"",ROUND(F'+i+'*J'+i+',2))',
   9:'IF(OR(E'+i+'="",NOT(ISNUMBER(J'+i+'))),"",ROUND(G'+i+'*J'+i+',2))',
   12:'IF(OR(E'+i+'="",NOT(ISNUMBER(J'+i+'))),"",ROUND(E'+i+'*J'+i+',2))'
  };
  for(const [column,formula]of Object.entries(formulas)){
   const c=r.getCell(Number(column));c.value={formula,result:''};c.protection={locked:true};
  }
  r.getCell(10).note=p.criterio_costo;
  if(p.costo_referencia===null)r.getCell(10).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFE4CC'}};
  if(p.precio==null)r.getCell(11).note='Sin precio de venta vigente para esta sucursal. No se importa ni modifica.';
 }
 ws.getColumn(1).numFmt='@';ws.getColumn(2).numFmt='@';
 for(const c of [4,5,6,7])ws.getColumn(c).numFmt='0.000';
 for(const c of [8,9,11,12])ws.getColumn(c).numFmt='"S/ " #,##0.00';
 ws.getColumn(10).numFmt='"S/ " #,##0.0000';
 ws.views=[{state:'frozen',xSplit:3,ySplit:1}];ws.autoFilter='A1:L1';
 if(rows.length){
  ws.addConditionalFormatting({ref:'F2:F'+ws.rowCount,rules:[{type:'cellIs',operator:'greaterThan',formulae:[0],
   style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFFFE4CC'}},font:{color:{argb:'FF9C5700'}}}}]});
  ws.addConditionalFormatting({ref:'G2:G'+ws.rowCount,rules:[{type:'cellIs',operator:'greaterThan',formulae:[0],
   style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFDCFCE7'}},font:{color:{argb:'FF166534'}}}}]});
 }
 await ws.protect('eduxfac-conteo',{selectLockedCells:true,selectUnlockedCells:true,autoFilter:true});
 const info=wb.addWorksheet('Información');
 const name=(await db.query('select nombre from sucursales where id=$1',[branch])).rows[0].nombre;
 info.addRows([['Formato','EDUXFAC_CONTEO_V1'],['Sucursal ID',branch],['Sucursal',name],['Generado',new Date()],
  ['Instrucciones','Modifique únicamente E: Stock físico. Vacío = omitir; cero = sin existencias. Cantidades en unidades base, hasta 3 decimales.'],
  ['Validación','Si el stock del sistema cambió, descargue un nuevo conteo. No mezcle sucursales.'],
  ['Faltantes','Se descuentan de los lotes reales más antiguos; después, del stock sin lote o automático heredado, sin saldos negativos.'],
  ['Sobrantes','Se agregan al último lote real de esta sucursal. Si no existe, se registran como stock sin lote, sin número ni vencimiento.'],
  ['Columnas informativas','A–D, J (Costo) y K (Precio venta): datos del sistema, no se importan como costos ni precios.'],
  ['Columnas automáticas','F: Falta; G: Sobra; H: Precio falta; I: Precio sobra; L: Valorizado. Excel recalcula; no digite estas columnas.'],
  ['Falta / Sobra','MAX(Stock sistema - Stock físico, 0) / MAX(Stock físico - Stock sistema, 0). Sin Stock físico, permanecen vacías.'],
  ['Importes','Precio falta = Falta × Costo; Precio sobra = Sobra × Costo; Valorizado = Stock físico × Costo. Redondeo monetario: 2 decimales.'],
  ['Costo con varios lotes','Costo ponderado del stock actual: suma(stock de lote × costo de lote) / stock total. No es promedio simple.'],
  ['Sin stock positivo','Se informa el costo verificable del lote destino que seleccionaría la regla vigente de sobrantes. Si no existe costo verificable, J e importes quedan vacíos.'],
  ['Costo no verificable','J vacío resaltado: revisar el costo en el sistema. No se inventan costos ni se recuperan automáticamente costos históricos para exportar.'],
  ['Estimación','H, I y L son estimaciones con un costo único. La valorización real del ajuste depende de los lotes asignados; el conteo conserva sus reglas vigentes.'],
  ['Precio venta','Precio vigente por unidad en la sucursal; en su defecto, precio general vigente del producto. K es informativo.'],
  ['Protección','E es la única columna desbloqueada. Aunque se altere J o K, la importación ignora esos valores y utiliza los datos de la base.']]);
 info.columns=[{width:25},{width:115}];info.getColumn(2).alignment={wrapText:true,vertical:'top'};
 info.getRows(5,14).forEach(r=>r.height=32);
 return Buffer.from(await wb.xlsx.writeBuffer());
}

export function validateCount(lots, current, target, baseline) {
  if(!Number.isFinite(target)||target<0||Math.abs(target*1000-Math.round(target*1000))>0.00001)throw new Error('Stock físico inválido: use hasta 3 decimales y valores no negativos.');
  if(!Number.isFinite(baseline)||Math.abs(current-baseline)>0.0001)throw new Error('El stock cambió desde la exportación. Descargue un nuevo conteo y revise las cantidades.');
  const diff=Number((target-current).toFixed(3));
  return diff;
}

// Reserved placeholders generated by the existing import, adjustment and migration paths.
export function isRealCountLot(lot) {
  const name=String(lot.numero_lote||'').trim().toUpperCase();
  return !!name&&!/^(AJUSTE(?:[-_\s]|$)|INVENTARIO[-_\s]*EXCEL(?:[-_\s]|$)|STOCK[-_\s]*INICIAL[-_\s]*MIGRADO(?:[-_\s]|$)|LEGACY(?:[-_\s]|$)|SIN[-_\s]*LOTE(?:[-_\s]|$)|S\/?N$)/.test(name);
}

// Preserve exact 0.001-unit arithmetic through planning and splitting.
const units=value=>Math.round(Number(value)*1000);
async function chronologicalLots(db,productId,branchId,lots,newest=false){
  if(lots.length<2)return {lots:[...lots],warning:''};
  const history=(await db.query(`select l.id,
    (extract(epoch from min(events.entered_at))*1000000)::bigint::text first_at,
    (extract(epoch from max(events.entered_at))*1000000)::bigint::text last_at,
    (select (extract(epoch from min(mi.created_at))*1000000)::bigint::text from movimientos_inventario mi
      where mi.lote_id=l.id and mi.producto_id=l.producto_id and mi.sucursal_id=l.sucursal_id) observed_at
    from lotes l left join lateral (
      select mi.created_at entered_at from movimientos_inventario mi
      where mi.lote_id=l.id and mi.producto_id=l.producto_id and mi.sucursal_id=l.sucursal_id
        and mi.cantidad>0 and mi.tipo in ('COMPRA','TRANSFERENCIA_ENTRADA','IMPORTACION_EXCEL')
      union all
      select c.created_at from compra_detalles cd join compras c on c.id=cd.compra_id
      where cd.producto_id=l.producto_id and c.sucursal_id=l.sucursal_id and cd.cantidad>0
        and (cd.id=l.compra_detalle_id or cd.numero_lote=l.numero_lote)
    ) events on true
    where l.producto_id=$1 and l.sucursal_id=$2 and l.id=any($3::uuid[]) group by l.id`,[productId,branchId,lots.map(l=>l.id)])).rows;
  const dates=new Map(history.map(h=>[h.id,h[newest?'last_at':'first_at']||h.observed_at]));
  // Missing dates cannot be reconstructed. Make the deterministic fallback explicit,
  // without fabricating a historical date or using expiry as registration chronology.
  const missing=lots.some(l=>!dates.get(l.id));
  const ordered=[...lots].sort((a,b)=>{
    const da=dates.get(a.id),db=dates.get(b.id);
    if(!da||!db)return da?-1:db?1:String(a.id).localeCompare(String(b.id));
    const cmp=BigInt(da)<BigInt(db)?-1:BigInt(da)>BigInt(db)?1:0;
    return (newest?-cmp:cmp)||String(a.id).localeCompare(String(b.id));
  });
  const duplicate=new Set([...dates.values()].filter(Boolean)).size<[...dates.values()].filter(Boolean).length;
  return {lots:ordered,warning:missing?' Algunos lotes carecen de cronología: se priorizan los fechados y luego se usa un orden interno estable.':duplicate?' Ingresos con la misma fecha y hora: desempate por identificador interno.':''};
}

export async function countPlan(db,productId,branchId,inv,target,baseline) {
  const diff=validateCount(inv.lots,inv.total,target,baseline);
  if(!diff)return {diff,lot:null,allocations:[],observation:'Sin cambio'};
  const real=inv.lots.filter(isRealCountLot);
  if(diff>0){
    const ordered=await chronologicalLots(db,productId,branchId,real,true);
    const lot=ordered.lots[0]||inv.lots.find(l=>l.numero_lote===null)||null;
    const observation=real.length
      ?'Agregar '+diff+' al último lote existente: '+lot.numero_lote+(lot.fecha_vencimiento?' (vencimiento '+lot.fecha_vencimiento.split('-').reverse().join('/')+')':'')+ordered.warning
      :'Agregar '+diff+' al stock sin lote (sin número ni vencimiento).';
    return {diff,lot,allocations:[{lot,quantity:diff}],observation};
  }
  const ordered=await chronologicalLots(db,productId,branchId,real.filter(l=>units(l.cantidad_disponible)>0));
  const other=await chronologicalLots(db,productId,branchId,inv.lots.filter(l=>!isRealCountLot(l)&&units(l.cantidad_disponible)>0));
  let remaining=-units(diff);const allocations=[];
  for(const lot of [...ordered.lots,...other.lots]){
    if(!remaining)break;
    const take=Math.min(remaining,units(lot.cantidad_disponible));
    if(take){allocations.push({lot,quantity:-take/1000});remaining-=take;}
  }
  if(remaining)throw new Error('Stock insuficiente para completar el conteo sin saldos negativos.');
  return {diff,lot:allocations[0]?.lot||null,allocations,
    observation:'Descontar '+(-diff)+' de lotes más antiguos.'+(allocations.some(a=>!isRealCountLot(a.lot))?' Incluye saldo sin lote o automático heredado.':'')+ordered.warning+other.warning};
}
