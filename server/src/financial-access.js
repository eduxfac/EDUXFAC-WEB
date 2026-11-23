// Financial access is resolved for the effective branch, never from a role in another branch.
export function redactFinancial(value,{cost=false,profit=false}={}) {
 if(Array.isArray(value))return value.map(v=>redactFinancial(v,{cost,profit}));
 if(!value||typeof value!=='object')return value;
 if(value instanceof Date||Buffer.isBuffer(value))return value;
 const out={};for(const[k,v]of Object.entries(value)){
  if(!profit&&/utilidad|margen|ganancia|profit|margin/i.test(k))continue;
  if(!cost&&/costo|cost|^(valor|valor_total|valor_stock|valorizacion|valorizado|inversion)$/i.test(k))continue;
  out[k]=redactFinancial(v,{cost,profit});
 }return out;
}
// Generic exporters only render data supplied by the caller; strip unauthorized columns and KPI labels again on the server.
export function sanitizeFinancialExport(payload,access={}){
 const forbidden=label=>!access.profit&&/utilidad|margen|ganancia|profit|margin/i.test(String(label))||!access.cost&&/costo|cost|valor stock|valoriz|inversi[oó]n/i.test(String(label));
 const block=b=>{if(!b||typeof b!=='object')return b;const out={...b};if(Array.isArray(b.headers)){const keep=b.headers.map((h,i)=>({i,label:h&&typeof h==='object'?h.label||h.title||h.header:h})).filter(x=>!forbidden(x.label));out.headers=keep.map(x=>b.headers[x.i]);if(Array.isArray(b.rows))out.rows=b.rows.filter(row=>!Array.isArray(row)||!/^Indicador$|^Métrica$/i.test(String(b.headers[0]))||!forbidden(row[0])).map(row=>Array.isArray(row)?keep.map(x=>row[x.i]):row);}return out;};
 const out=block(payload);if(Array.isArray(payload.blocks))out.blocks=payload.blocks.map(block);if(Array.isArray(payload.kpis))out.kpis=payload.kpis.filter(k=>!forbidden(Array.isArray(k)?k[0]:k?.label||k?.title||k?.name));return out;
}
export async function financialAccess(db,user,branch=null) {
 const {rows}=await db.query(`select s.id,r.nombre rol,exists(select 1 from usuario_permisos p where p.usuario_id=us.usuario_id and p.modulo='financialCost' and p.puede_ver=true) cost_granted,exists(select 1 from usuario_permisos p where p.usuario_id=us.usuario_id and p.modulo='financialProfit' and p.puede_ver=true) profit_granted from usuario_sucursal us join sucursales s on s.id=us.sucursal_id join roles r on r.id=us.rol_id where us.usuario_id=$1 and s.empresa_id=$2 and (s.activo=true or $4::boolean) and ($3::uuid is null or s.id=$3)`,[user.sub,user.empresa_id,branch,user.readOnlyBranchAccess===true]);
 const roles=rows.map(r=>r.rol);return {cost:roles.length>0&&(roles.every(r=>['Administrador','Almacén'].includes(r))||rows.every(r=>r.cost_granted===true)),profit:roles.length>0&&(roles.every(r=>r==='Administrador')||rows.every(r=>r.profit_granted===true))};
}
export async function guardFinancial(db,req,res){
 const p=req.path;
 if(!/^\/api\/(reports|export|import|dashboard|products|purchases|inventory|purchasing|purchase-orders|sales|admin\/products)(?:\/|$)/.test(p))return true;
 let branch=req.query.sucursal_id||req.body?.sucursal_id||null;
 const receipt=/^\/api\/sales\/([a-f0-9-]{36})\/(receipt|returns|return)$/.exec(p);
 if(receipt){const q=await db.query('select sucursal_id from ventas where id=$1 and empresa_id=$2',[receipt[1],req.user.empresa_id]);branch=q.rows[0]?.sucursal_id||null;}
 const doc=/^\/api\/reports\/(purchases|cancellations)\/([a-f0-9-]{36})\/detail$/.exec(p);if(doc){const table=doc[1]==='purchases'?'compras':'devoluciones_venta';const q=await db.query('select sucursal_id from '+table+' where id=$1 and empresa_id=$2',[doc[2],req.user.empresa_id]);branch=q.rows[0]?.sucursal_id||null;}
 req.financialAccess=await financialAccess(db,req.user,branch);
 const access=req.financialAccess;
 // The module permission has already been checked by the API middleware.
 // Delegated purchasing includes its operational costs, not profit or global reporting.
 if(['purchases','replenishment'].includes(req.authorizedOperation?.[0]))access.cost=true;
 if(p.startsWith('/api/export/')&&!access.profit){req.body=sanitizeFinancialExport(req.body||{},access);const sections=req.body.blocks||[req.body];if(!sections.some(b=>Array.isArray(b.headers)&&b.headers.length)){res.status(403).json({error:'No hay columnas autorizadas para exportar.',code:'FINANCIAL_EXPORT_DENIED'});return false;}}
 if(p==='/api/inventory/export.xlsx'&&!access.cost){res.status(403).json({error:'Utilice la exportación autorizada del reporte de inventario.',code:'FINANCIAL_EXPORT_DENIED'});return false;}
 if(!access.cost&&(/^\/api\/reports\/(audit|purchases\/|center\/(purchases|suppliers|management))/.test(p)||p.startsWith('/api/purchases')||p.startsWith('/api/purchase-orders')||/^\/api\/purchasing\/(supplier-history|cost-history)/.test(p))){res.status(403).json({error:'No tiene autorización para este reporte financiero.',code:'FINANCIAL_REPORT_DENIED'});return false;}
 const send=res.json.bind(res);res.json=data=>send(redactFinancial(data,access));return true;
}
