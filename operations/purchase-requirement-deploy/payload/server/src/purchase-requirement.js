import ExcelJS from 'exceljs';
export const lowStockCTE=`with balances as (
 select p.id,p.codigo_interno,p.nombre,ps.stock_minimo,s.nombre sucursal,
 coalesce(sum(l.cantidad_disponible),0)::numeric stock
 from producto_sucursal ps join productos p on p.id=ps.producto_id
 join sucursales s on s.id=ps.sucursal_id and s.empresa_id=$1
 left join lotes l on l.producto_id=p.id and l.sucursal_id=ps.sucursal_id
 where p.empresa_id=$1 and ps.sucursal_id=$2 and ps.activo=true
 group by p.id,ps.stock_minimo,s.nombre
), low_stock as (select * from balances where stock<=stock_minimo)`;
export function lowStockCount(db,company,branch){return db.query(lowStockCTE+' select count(*)::int cantidad from low_stock',[company,branch]);}
const search=`($3::text='' or nombre ilike $3 or codigo_interno ilike $3)`;
const details=`select r.*,lc.costo_unitario ultimo_costo,lc.fecha ultima_compra,lc.moneda costo_moneda,supplier.razon_social proveedor from selected r
 left join lateral (
 select cd.costo_unitario,c.fecha,c.moneda from compra_detalles cd join compras c on c.id=cd.compra_id
 where cd.producto_id=r.id and c.empresa_id=$1 and c.sucursal_id=$2 and cd.cantidad>0
 order by c.fecha desc,c.created_at desc,c.id desc,cd.id desc limit 1
 ) lc on true
 left join lateral (
 select pr.razon_social from compra_detalles cd join compras c on c.id=cd.compra_id
 join proveedores pr on pr.id=c.proveedor_id and pr.empresa_id=$1
 where cd.producto_id=r.id and c.empresa_id=$1 and c.sucursal_id=$2 and cd.cantidad>0
 order by c.fecha desc,c.created_at desc,c.id desc,cd.id desc limit 1
 ) supplier on true order by r.nombre,r.id`;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function requirementList(db,company,branch,{page=1,limit=100,q=''}={}){
 page=Number(page);limit=Number(limit);
 if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>200)throw new Error('Paginación inválida.');
 q=String(q).trim();if(q.length>100)throw new Error('Búsqueda demasiado larga.');
 const pattern=q?'%'+q.replace(/[\\%_]/g,'\\$&')+'%':'',params=[company,branch,pattern];
 const total=Number((await db.query(lowStockCTE+' select count(*)::int total from low_stock where '+search,params)).rows[0].total);
 const rows=(await db.query(lowStockCTE+', selected as (select * from low_stock where '+search+' order by nombre,id limit $4 offset $5) '+details,[...params,limit,(page-1)*limit])).rows;
 return {items:rows,total,page,limit};
}
export function requestedItems(items){
 if(!Array.isArray(items)||items.length>10000)throw new Error('Seleccione como máximo 10.000 productos.');
 const result=[],seen=new Set();
 for(const item of items){
 if(!item||!uuid.test(String(item.producto_id||'')))throw new Error('Producto inválido.');
 const id=String(item.producto_id).toLowerCase();if(seen.has(id))throw new Error('Producto repetido.');seen.add(id);
 const raw=item.cantidad;if(raw===null||raw===undefined||String(raw).trim()==='')continue;
 if(typeof raw!=='number'&&typeof raw!=='string')throw new Error('Cantidad a pedir inválida.');
 if(typeof raw==='string'&&!/^\d+(?:\.\d{1,3})?$/.test(raw.trim()))throw new Error('Cantidad a pedir: use un número no negativo, hasta 3 decimales.');
 const qty=Number(raw);
 if(!Number.isFinite(qty)||qty<0||qty>999999999.999||Math.abs(qty*1000-Math.round(qty*1000))>0.00001)throw new Error('Cantidad a pedir inválida (hasta 3 decimales).');
 if(qty>0)result.push({producto_id:id,cantidad:qty});
 }
 if(!result.length)throw new Error('Ingrese una cantidad a pedir mayor a 0.');return result;
}
export async function generateRequirement(db,company,branch,items){
 const requested=requestedItems(items),ids=requested.map(i=>i.producto_id);
 const rows=(await db.query(lowStockCTE+', selected as (select * from low_stock where id=any($3::uuid[])) '+details,[company,branch,ids])).rows;
 const quantities=new Map(requested.map(i=>[i.producto_id,i.cantidad]));
 const context=(await db.query('select e.razon_social empresa,s.nombre sucursal from empresas e join sucursales s on s.empresa_id=e.id where e.id=$1 and s.id=$2',[company,branch])).rows[0];
 if(!context)throw new Error('Sucursal inválida.');
 const included=new Set(rows.map(r=>r.id));
 return {...context,fecha:new Date().toISOString(),items:rows.map(r=>({...r,cantidad:quantities.get(r.id)})),omitidos:requested.filter(r=>!included.has(r.producto_id)).length};
}
export async function requirementWorkbook(document){
 const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Requerimiento');wb.creator='EDUXFAC';
 ws.columns=[['Código',22],['Producto',45],['Stock actual',18],['Stock mínimo',18],['Cantidad a pedir',20],['Último costo',20],['Proveedor',34],['Sucursal',25]].map(([header,width])=>({header,width}));
 for(const p of document.items){const row=ws.addRow([p.codigo_interno,p.nombre,Number(p.stock),Number(p.stock_minimo),p.cantidad,p.ultimo_costo==null?null:Number(p.ultimo_costo),p.proveedor||'',p.sucursal]);row.getCell(6).numFmt=(p.costo_moneda==='PEN'?'"S/ " ':p.costo_moneda==='USD'?'"US$ " ':/^[A-Z]{3}$/.test(p.costo_moneda||'')?'"'+p.costo_moneda+' " ':'')+'#,##0.0000';}
 ws.getColumn(1).numFmt='@';for(const c of [3,4,5])ws.getColumn(c).numFmt='0.000';
 ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B376D'}};ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter='A1:H1';
 const info=wb.addWorksheet('Información');info.addRows([['Empresa',document.empresa],['Sucursal',document.sucursal],['Generado',document.fecha],['Uso','Requerimiento informativo. No modifica stock ni crea una compra.'],['Cantidad','Elegida manualmente por el usuario; sin sugerencias automáticas.'],['Costo/proveedor','Última compra / última compra con proveedor registrado, de esta empresa y sucursal.'],['Moneda','Se conserva moneda de compra; no se realiza conversión.']]);info.getColumn(1).width=22;info.getColumn(2).width=100;info.getColumn(2).alignment={wrapText:true};
 return wb.xlsx.writeBuffer();
}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function requirementPrint(document){
 const money=p=>p.ultimo_costo==null?'':(p.costo_moneda==='PEN'?'S/ ':p.costo_moneda==='USD'?'US$ ':p.costo_moneda?p.costo_moneda+' ':'')+Number(p.ultimo_costo).toFixed(4);
 return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Requerimiento de compra</title><style>body{font:14px Arial,sans-serif;color:#123;margin:24px}h1{font-size:23px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccd;padding:8px;text-align:left}th{background:#edf3fc}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}</style><h1>Requerimiento de compra</h1><p><b>${esc(document.empresa)}</b> · Sucursal: ${esc(document.sucursal)} · Fecha: ${esc(new Date(document.fecha).toLocaleString('es-PE',{timeZone:'America/Lima'}))}</p><p>Documento informativo. Cantidades elegidas manualmente; no registra una compra.</p><table><thead><tr>${['Código','Producto','Stock actual','Stock mínimo','Cantidad a pedir','Último costo','Proveedor','Sucursal'].map(x=>'<th>'+x+'</th>').join('')}</tr></thead><tbody>${document.items.map(p=>'<tr>'+[p.codigo_interno,p.nombre,p.stock,p.stock_minimo,p.cantidad,money(p),p.proveedor||'',p.sucursal].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')}</tbody></table><p>${document.items.length} producto(s) solicitados.</p></html>`;
}
export function registerPurchaseRequirements(app,{db,auth,branchAccess}){
 const route='/api/purchasing/requirements';
 const wrap=fn=>async(req,res)=>{try{const branch=req.query.sucursal_id??req.body?.sucursal_id;if(typeof branch!=='string'||!uuid.test(branch))throw new Error('Seleccione una sucursal válida.');await branchAccess(db,req.user,branch);await fn(req,res,branch);}catch(e){res.status(e.status||400).json({error:e.message})}};
 app.get(route,auth,wrap(async(req,res,branch)=>{res.set('Cache-Control','no-store');res.json(await requirementList(db,req.user.empresa_id,branch,req.query))}));
 for(const action of ['generate','export','print'])app.post(route+'/'+action,auth,wrap(async(req,res,branch)=>{
 const doc=await generateRequirement(db,req.user.empresa_id,branch,req.body?.items);res.set('Cache-Control','no-store');
 if(!doc.items.length)throw new Error('Los productos seleccionados ya no requieren reposición. Actualice la lista.');
 if(action==='generate')return res.json(doc);
 if(action==='print')return res.json({html:requirementPrint(doc),productos:doc.items.length,omitidos:doc.omitidos});
 res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition','attachment; filename="Requerimiento_compra.xlsx"');res.send(Buffer.from(await requirementWorkbook(doc)));
 }));
}
