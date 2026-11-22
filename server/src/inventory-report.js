import ExcelJS from 'exceljs';
const base=`from productos p left join lateral (
 select coalesce(sum(cantidad_disponible),0) stock,coalesce(sum(cantidad_disponible*costo_unitario),0) valor,
 coalesce(sum(cantidad_disponible*costo_unitario)/nullif(sum(cantidad_disponible),0),0) costo
 from lotes where producto_id=p.id and ($2::uuid is null or sucursal_id=$2)
) st on true left join (
 select distinct on (pp.producto_id) pp.producto_id,pp.precio_venta from precios_producto pp
 where (pp.sucursal_id=$2 or pp.sucursal_id is null) and pp.vigente_hasta is null
 order by pp.producto_id,(pp.sucursal_id is not null) desc,pp.vigente_desde desc
) pr on pr.producto_id=p.id
where ($2::uuid is null or exists(select 1 from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2 and ps.activo=true))
and p.empresa_id=$1 and ($2::uuid is not null or p.activo=true)
and ($3='' or p.nombre ilike '%'||$3||'%' or p.codigo_interno ilike '%'||$3||'%')`;
const minimum=`coalesce((select ps.stock_minimo from producto_sucursal ps where ps.producto_id=p.id and ps.sucursal_id=$2),p.stock_minimo)`;
const columns=`p.codigo_interno,p.nombre,p.unidad_medida,${minimum} stock_minimo,coalesce(st.stock,0)::numeric(14,3) stock,
 coalesce(st.costo,0)::numeric(14,4) costo,coalesce(pr.precio_venta,0)::numeric(14,2) precio,coalesce(st.valor,0)::numeric(14,2) valor,p.id`;
const summarySql=`select count(*)::int productos,coalesce(sum(st.stock),0)::numeric(14,3) unidades,
 count(*) filter(where coalesce(st.stock,0)<=0)::int sin_stock,
 count(*) filter(where ${minimum}>0 and coalesce(st.stock,0)<=${minimum})::int stock_bajo,
 coalesce(sum(st.valor),0)::numeric(14,2) valor ${base}`;
const pageSql=`select ${columns} ${base} order by p.nombre,p.id limit $4 offset $5`;
const filter=(user,branch,q)=>[user.empresa_id,branch||null,String(q||'').trim()];
async function snapshot(pool,fn){const c=await pool.connect();try{await c.query('begin isolation level repeatable read read only');const out=await fn(c);await c.query('commit');return out;}catch(e){await c.query('rollback').catch(()=>{});throw e;}finally{c.release();}}
export async function inventoryReportPage(pool,user,branch,q,query={}) {
 const page=Number(query.page??1),size=Number(query.page_size??100);
 if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(size)||size<1||size>250)throw Object.assign(Error('Paginación de inventario inválida.'),{status:400});
 return snapshot(pool,async c=>{const params=filter(user,branch,q),summary=(await c.query(summarySql,params)).rows[0],pages=Math.max(1,Math.ceil(summary.productos/size)),current=Math.min(page,pages),rows=(await c.query(pageSql,[...params,size,(current-1)*size])).rows;
  return {descripcion:'Inventario actual y valorización de stock',summary,rows,pagination:{page:current,page_size:size,total:summary.productos,pages},export_filters:{sucursal_id:branch||'',q:String(q||'').trim()}};
 });
}
const fields=['codigo_interno','nombre','unidad_medida','stock_minimo','stock','costo','precio','valor'];
const headings=['Código','Producto','Unidad','Stock mínimo','Stock','Costo unitario','Precio venta','Valor stock'];
const inventoryExportColumns=access=>fields.map((f,i)=>[f,headings[i]]).filter(([f])=>access?.cost||!['costo','valor'].includes(f));
async function* allRows(c,params){for(let offset=0;;offset+=500){const rows=(await c.query(pageSql,[...params,500,offset])).rows;for(const row of rows)yield row;if(rows.length<500)break;}}
async function write(res,chunk){if(res.destroyed)throw Error('Descarga cancelada.');if(res.write(chunk))return;await new Promise((resolve,reject)=>{const cleanup=()=>{res.off('drain',drain);res.off('error',fail);res.off('close',closed);},drain=()=>{cleanup();resolve();},fail=e=>{cleanup();reject(e);},closed=()=>fail(Error('Descarga cancelada.'));res.once('drain',drain);res.once('error',fail);res.once('close',closed);});}
// Stream complete inventory PDFs page by page; only a 500-row DB batch and one page are held in memory.
async function inventoryPdf(c,params,summary,res,access={}){
 const selected=inventoryExportColumns(access),fields=selected.map(x=>x[0]),headings=selected.map(x=>x[1]);
 const pageCount=Math.max(1,Math.ceil(summary.productos/42)),offsets=[0];let position=0;
 const emit=async value=>{const b=Buffer.isBuffer(value)?value:Buffer.from(value,'latin1');await write(res,b);position+=b.length;};
 const object=async(id,body)=>{offsets[id]=position;await emit(id+' 0 obj\n'+body+'\nendobj\n');};
 const clean=v=>String(v??'').replace(/[\r\n\t]/g,' ').replace(/[^\x20-\x7E\xA0-\xFF]/g,'?'),escape=v=>clean(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'),widths=[16,44,12,14,16,16,16,18];
 const line=values=>values.map((v,i)=>{const t=clean(v),w=widths[i];return(t.length>w?t.slice(0,w-3)+'...':t).padEnd(w);}).join(' ');
 await emit('%PDF-1.4\n');await object(1,'<< /Type /Catalog /Pages 2 0 R >>');await object(2,'<< /Type /Pages /Kids ['+Array.from({length:pageCount},(_,i)=>(4+i*2)+' 0 R').join(' ')+'] /Count '+pageCount+' >>');await object(3,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
 const iterator=allRows(c,params)[Symbol.asyncIterator]();
 for(let page=0;page<pageCount;page++){
  const lines=['EDUXFAC - Inventario completo','Productos: '+summary.productos+'   Unidades: '+summary.unidades+(access.cost?'   Valor: S/ '+summary.valor:''),'Pagina '+(page+1)+' de '+pageCount+' - Nombres resumidos; Excel conserva el texto completo.',line(headings),'-'.repeat(159)];
  for(let i=0;i<42;i++){const row=await iterator.next();if(row.done)break;lines.push(line(fields.map(k=>row.value[k])));}
  const content='BT\n/F1 7 Tf\n'+lines.map((l,i)=>`1 0 0 1 22 ${568-i*11} Tm (${escape(l)}) Tj`).join('\n')+'\nET\n',bytes=Buffer.from(content,'latin1'),pageId=4+page*2,streamId=pageId+1;
  await object(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
  await object(streamId,'<< /Length '+bytes.length+' >>\nstream\n'+content+'endstream');
 }
 const xref=position,last=3+pageCount*2;await emit('xref\n0 '+(last+1)+'\n0000000000 65535 f \n'+Array.from({length:last},(_,i)=>String(offsets[i+1]).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(last+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
}
export function registerInventoryReportExports(app,{pool,auth,branchAccess}){
 app.get('/api/reports/center/inventory/export.:format',auth,async(req,res)=>{
  try{const format=req.params.format;if(!['xlsx','pdf'].includes(format))throw Object.assign(Error('Formato no admitido.'),{status:400});const branch=req.query.sucursal_id||null;if(branch)await branchAccess(pool,req.user,branch);
   await snapshot(pool,async c=>{const params=filter(req.user,branch,req.query.q),summary=(await c.query(summarySql,params)).rows[0];res.setHeader('X-Total-Count',String(summary.productos));res.setHeader('Content-Disposition','attachment; filename="EDUXFAC_inventario_completo.'+format+'"');
    const selected=inventoryExportColumns(req.financialAccess),exportFields=selected.map(x=>x[0]),exportHeadings=selected.map(x=>x[1]);
    if(format==='xlsx'){
     res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
     const workbook=new ExcelJS.stream.xlsx.WorkbookWriter({stream:res,useStyles:true,useSharedStrings:false}),sheet=workbook.addWorksheet('Inventario');sheet.addRow(['EDUXFAC - Inventario completo']).commit();sheet.addRow(['Productos',summary.productos,'Unidades',Number(summary.unidades),...(req.financialAccess?.cost?['Valor',Number(summary.valor)]:[])]).commit();sheet.addRow(exportHeadings).commit();
     sheet.columns=exportFields.map((_,i)=>({width:i===1?48:20}));for await(const row of allRows(c,params)){sheet.addRow(exportFields.map(k=>['stock_minimo','stock','costo','precio','valor'].includes(k)?Number(row[k]):row[k]??'')).commit();}sheet.commit();await workbook.commit();
    }else{res.setHeader('Content-Type','application/pdf');await inventoryPdf(c,params,summary,res,req.financialAccess);}
   });if(!res.writableEnded)res.end();
  }catch(error){if(res.headersSent)res.destroy(error);else res.status(error.status||400).json({error:error.message,code:error.code});}
 });
}
