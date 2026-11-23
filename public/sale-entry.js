(()=>{
 let dialog,revision=0,clientId=null,saving=false;
 const field=name=>dialog.querySelector('[name="'+name+'"]');
 const message=text=>dialog.querySelector('[role="status"]').textContent=text;
 function resetIdentity(){revision++;clientId=null;for(const name of ['nombres','direccion','email','telefono'])field(name).value='';message('');}
 async function consult(){
  const doc=field('nro_doc').value.trim(),type=field('tipo_doc').value;
  if(!(type==='RUC'?/^\d{11}$/:/^\d{8}$/).test(doc)){message(type==='RUC'?'Ingresa un RUC de 11 dígitos.':'Ingresa un DNI de 8 dígitos.');return;}
  const request=++revision;clientId=null;field('nombres').value='';field('direccion').value='';message('Consultando documento…');
  try{
   const result=await api('/api/admin/clients/document-preview/'+encodeURIComponent(doc));
   if(request!==revision||!dialog.open)return;
   if(!result){message('No se encontraron datos. Puedes completar el nombre manualmente.');return;}
   clientId=result.id||null;field('nombres').value=result.nombres||'';field('direccion').value=result.direccion||'';field('email').value=result.email||'';field('telefono').value=result.telefono||'';
   message(clientId?'Cliente registrado encontrado.':'Datos encontrados. Revisa y guarda el cliente.');
  }catch(error){if(request===revision&&dialog.open)message(error.message);}
 }
 function createDialog(){
  dialog=document.createElement('dialog');dialog.className='sale-customer-dialog';dialog.setAttribute('aria-labelledby','saleCustomerTitle');
  dialog.innerHTML='<form><header><h2 id="saleCustomerTitle">Cliente nuevo</h2><button type="button" data-close aria-label="Cerrar">×</button></header><p>Consulta por DNI o RUC y revisa los datos antes de guardar.</p><div class="sale-customer-fields"><label>Tipo de documento<select name="tipo_doc" class="input"><option>DNI</option><option>RUC</option></select></label><label>Número<div class="sale-customer-lookup"><input name="nro_doc" class="input" inputmode="numeric" maxlength="11" required autocomplete="off"><button type="button" class="btn secondary" data-lookup>Consultar</button></div></label><label class="wide">Nombre / Razón social<input name="nombres" class="input" maxlength="200" required></label><label class="wide">Dirección<input name="direccion" class="input" maxlength="240"></label><label>Correo (opcional)<input name="email" class="input" type="email" maxlength="120"></label><label>Celular (opcional)<input name="telefono" class="input" maxlength="40"></label></div><p role="status" aria-live="polite"></p><footer><button type="button" class="btn secondary" data-close>Cancelar</button><button type="submit" class="btn primary">Guardar y seleccionar</button></footer></form>';
  document.body.append(dialog);
  dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!saving){revision++;dialog.close();}});
  dialog.oncancel=event=>{if(saving)event.preventDefault();else revision++;};
  dialog.querySelector('[data-lookup]').onclick=consult;
  field('nro_doc').oninput=resetIdentity;field('tipo_doc').onchange=()=>{field('nro_doc').value='';resetIdentity();};
  field('nro_doc').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void consult();}};
  dialog.querySelector('form').onsubmit=async event=>{
   event.preventDefault();if(saving)return;
   const body=Object.fromEntries(new FormData(event.target));body.nro_doc=body.nro_doc.trim();body.nombres=body.nombres.trim();
   if(!(body.tipo_doc==='RUC'?/^\d{11}$/:/^\d{8}$/).test(body.nro_doc)){message('Revisa el número de documento.');return;}
   if(!body.nombres){message('Completa el nombre o razón social.');return;}
   if($('saleDocType').value==='FACTURA'&&body.tipo_doc!=='RUC'){message('La factura requiere un cliente con RUC.');return;}
   saving=true;revision++;dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);message('Guardando cliente…');
   try{
    const result=await api('/api/admin/clients'+(clientId?'/'+encodeURIComponent(clientId):''),{method:clientId?'PUT':'POST',body:JSON.stringify(body)});
    if(!result?.id)throw Error('No se pudo confirmar el cliente guardado.');
    selectSaleClient(result);dialog.close();
   }catch(error){message(error.message);}
   finally{saving=false;dialog.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);}
  };
 }
 window.openSaleCustomerDialog=(query=String($('saleDni').value||'').trim())=>{
  if(!dialog)createDialog();if(saving)return;
  revision++;clientId=null;dialog.querySelector('form').reset();message('');
  const isDoc=/^(?:\d{8}|\d{11})$/.test(query);
  field('tipo_doc').value=$('saleDocType').value==='FACTURA'||query.length===11&&isDoc?'RUC':'DNI';
  field('nro_doc').value=isDoc?query:'';field('nombres').value=!isDoc&&query!=='CLIENTES VARIOS'?query:'';
  dialog.showModal();field('nro_doc').focus();
 };
 const sales=$('sales');sales.classList.add('sale-entry-screen');
 const workspace=sales.querySelector('.sale-workspace'),client=sales.querySelector('.sale-client-card');
 const left=sales.querySelector('.sale-left');
 left.append(client);
 const clientLine=sales.querySelector('.sale-client-line');
 const clear=document.createElement('button');clear.type='button';clear.className='btn secondary';clear.setAttribute('aria-label','Quitar cliente seleccionado');clear.textContent='×';clear.onclick=()=>clearSaleClient();clientLine.append(clear);
 const flow=sales.querySelector('.sale-doc-flow');
 left.prepend(flow);
 const toolbar=document.createElement('div');toolbar.className='sale-entry-toolbar';
 toolbar.innerHTML='<label>Tipo de comprobante<select id="saleDocumentSelect" class="input"><option value="ORDEN">Orden</option><option value="BOLETA">Boleta</option><option value="FACTURA">Factura</option><option value="NOTA DE CREDITO">Nota de crédito</option><option value="COTIZACION">Cotización</option></select></label><label>Serie / Número<input class="input" value="Automático al emitir" readonly></label><label>Moneda<input class="input" value="Soles (PEN)" readonly></label><label>Fecha<input id="saleEntryDate" class="input" readonly></label>';
 flow.append(toolbar);$('saleDocumentSelect').value=$('saleDocType').value;
 $('saleDocumentSelect').onchange=()=>setSaleDocumentType($('saleDocumentSelect').value);
 $('saleEntryDate').value=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima'}).format(new Date());
 const newButton=$('saleClientNew');newButton.textContent='＋ Cliente nuevo';newButton.onclick=()=>window.openSaleCustomerDialog();
 $('checkout').textContent='Emitir';
 const preview=document.createElement('button');preview.type='button';preview.className='btn secondary';preview.textContent='Vista previa';
 preview.onclick=()=>{
  const view=document.createElement('dialog');view.className='sale-customer-dialog';
  const heading=document.createElement('h2');heading.textContent='Vista previa de '+$('saleDocType').value.toLowerCase();
  const customer=document.createElement('p');customer.textContent=$('saleClientName').value||'Selecciona el cliente';
  const items=$('cart').cloneNode(true);items.removeAttribute('id');items.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  items.querySelectorAll('button').forEach(el=>el.remove());items.querySelectorAll('input,select,textarea').forEach(el=>{const value=document.createElement('span');value.textContent=el.value;el.replaceWith(value);});
  const total=document.createElement('h3');total.textContent='Total: '+$('total').textContent;
  const note=document.createElement('p');note.textContent='Vista previa. El número definitivo se asignará al emitir.';
  const close=document.createElement('button');close.type='button';close.className='btn secondary';close.textContent='Volver a la venta';close.onclick=()=>{view.close();view.remove();};view.oncancel=()=>view.remove();
  view.append(heading,customer,items,total,note,close);document.body.append(view);view.showModal();
 };
 $('checkout').before(preview);
 if(!$('saleClientId').value&&!$('saleDni').value)clearSaleClient();
})();
