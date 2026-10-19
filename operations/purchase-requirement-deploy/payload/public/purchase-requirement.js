(function(){
'use strict';
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=x=>Number(x).toLocaleString('es-PE',{maximumFractionDigits:3});
const cost=x=>x.ultimo_costo==null?'':(x.costo_moneda==='PEN'?'S/ ':x.costo_moneda==='USD'?'US$ ':x.costo_moneda?x.costo_moneda+' ':'')+Number(x.ultimo_costo).toFixed(4);
window.createPurchaseRequirement=function({api,getBranchId,getToken,onCount}){
 const $=id=>document.getElementById(id),draft=new Map();let branch=null,page=1,sequence=0,rows=[],total=0,busy=false,generated=null,signature='',draftSequence=0;
 const visible=()=>document.getElementById('replenishment')?.classList.contains('active');
 const status=message=>{$('rqStatus').textContent=message};
 function invalidate(){generated=null;$('rqSummary').classList.add('hidden')}
 function render(){
  $('rqRows').innerHTML=rows.map(p=>`<tr><td>${escapeHtml(p.codigo_interno)}</td><td><b>${escapeHtml(p.nombre)}</b></td><td>${n(p.stock)}</td><td>${n(p.stock_minimo)}</td><td>${escapeHtml(p.sucursal)}</td><td>${escapeHtml(cost(p))}</td><td>${escapeHtml(p.proveedor||'Sin proveedor')}</td><td><input class="input rq-quantity" type="number" min="0" max="999999999.999" step="0.001" inputmode="decimal" data-request-id="${escapeHtml(p.id)}" aria-label="Cantidad a pedir de ${escapeHtml(p.nombre)}" placeholder="Sin cantidad" value="${escapeHtml(draft.get(p.id)??'')}"></td></tr>`).join('')||'<tr><td colspan="8">No hay productos con stock menor o igual al mínimo.</td></tr>';
  $('rqCount').textContent=total+' producto(s) para reposición';$('rqPage').textContent='Página '+page+' de '+Math.max(1,Math.ceil(total/100));$('rqPrevious').disabled=page<=1;$('rqNext').disabled=page*100>=total;
 }
 async function load({reset=false}={}){
  const current=getBranchId();if(!current)return;
  if(current!==branch){branch=current;page=1;draft.clear();draftSequence++;invalidate()}
  if(reset){page=1;invalidate()}
  const request=++sequence;status('Consultando existencias actuales…');
  try{
   const result=await api('/api/purchasing/requirements?'+new URLSearchParams({sucursal_id:current,page,limit:100,q:$('rqSearch').value.trim()}));
   if(request!==sequence||current!==getBranchId())return;
   rows=result.items;total=result.total;
   if(page>1&&rows.length===0){page=Math.max(1,Math.ceil(total/100));return load()}
   const nextSignature=JSON.stringify([result.total,result.items]);
   if(generated&&signature&&signature!==nextSignature)invalidate();
   const changed=signature!==nextSignature;signature=nextSignature;
   if(changed)render();onCount?.(total,$('rqSearch').value.trim()==='');status('Stock actual ≤ stock mínimo. Cantidades manuales; se actualiza cada 30 segundos.');
  }catch(e){if(request===sequence){rows=[];total=0;signature='';render();invalidate();status(e.message)}} 
 }
 function items(){return [...draft].map(([producto_id,cantidad])=>({producto_id,cantidad}))}
 async function generate(){
  if(busy)return;busy=true;const current=getBranchId(),submittedDraft=draftSequence;$('rqGenerate').disabled=true;
  try{
   const doc=await api('/api/purchasing/requirements/generate',{method:'POST',body:JSON.stringify({sucursal_id:current,items:items()})});
   if(current!==getBranchId())return;if(submittedDraft!==draftSequence){invalidate();status('Las cantidades cambiaron. Genere nuevamente el requerimiento.');return;}generated=doc;
   $('rqSummaryHeading').textContent=doc.empresa+' · '+doc.sucursal;
   $('rqSummaryRows').innerHTML=doc.items.map(p=>`<tr><td>${escapeHtml(p.codigo_interno)}</td><td>${escapeHtml(p.nombre)}</td><td>${n(p.stock)}</td><td>${n(p.stock_minimo)}</td><td><b>${n(p.cantidad)}</b></td><td>${escapeHtml(cost(p))}</td><td>${escapeHtml(p.proveedor||'Sin proveedor')}</td><td>${escapeHtml(p.sucursal)}</td></tr>`).join('');
   $('rqSummaryText').textContent=doc.items.length+' producto(s) con cantidad mayor a 0. '+(doc.omitidos?doc.omitidos+' ya no requieren reposición y fueron omitidos. ':'')+'Documento informativo: no registra compras ni modifica existencias.';
   $('rqSummary').classList.remove('hidden');status('Requerimiento generado. Puede exportarlo o imprimirlo.');
   await load();
  }catch(e){invalidate();status(e.message)}finally{busy=false;$('rqGenerate').disabled=false}
 }
 async function requestDocument(action){
  if(!generated)throw new Error('Primero genere el requerimiento.');
  const current=getBranchId(),r=await fetch('/api/purchasing/requirements/'+action,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({sucursal_id:current,items:generated.items.map(p=>({producto_id:p.id,cantidad:p.cantidad}))}),cache:'no-store'});
  if(!r.ok){const err=await r.json().catch(()=>({}));throw new Error(err.error||'No se pudo preparar el documento.')}
  if(current!==getBranchId())throw new Error('La sucursal cambió. Genere un nuevo requerimiento.');
  return r;
 }
 $('rqReload').onclick=()=>load({reset:true});let searchTimer;
 $('rqSearch').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>load({reset:true}),250)};
 $('rqPrevious').onclick=()=>{if(page>1){page--;void load()}};
 $('rqNext').onclick=()=>{if(page*100<total){page++;void load()}};
 $('rqRows').oninput=e=>{const input=e.target.closest('[data-request-id]');if(!input)return;draft.set(input.dataset.requestId,input.value);draftSequence++;invalidate()};
 $('rqGenerate').onclick=generate;
 $('rqExport').onclick=async()=>{try{const response=await requestDocument('export'),blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Requerimiento_compra.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Excel exportado. No se modificó el inventario.')}catch(e){status(e.message);invalidate()}};
 $('rqPrint').onclick=async()=>{let popup;try{if(!generated)throw new Error('Primero genere el requerimiento.');popup=window.open('','_blank');if(!popup)throw new Error('Permita abrir la ventana de impresión.');popup.opener=null;const r=await requestDocument('print'),doc=await r.json();popup.document.open();popup.document.write(doc.html);popup.document.close();setTimeout(()=>{if(!popup.closed){popup.focus();popup.print()}},250)}catch(e){if(popup&&!popup.closed)popup.close();status(e.message);invalidate()}};
 setInterval(()=>{if(visible()&&!document.hidden&&!busy)void load()},30000);
 window.addEventListener('focus',()=>{if(visible()&&!busy)void load()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&visible()&&!busy)void load()});
 return {load,generate};
};
})();
