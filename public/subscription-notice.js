(()=>{
 const paymentMarkup="<section class=\"sn-payments\" aria-label=\"Contacto y medios de pago\"><div class=\"sn-payment-title\"><b>Renueva tu servicio</b><span>EDUXFAC</span></div><div class=\"sn-payment-row\"><span class=\"sn-method sn-bcp\"><img class=\"sn-logo-bcp\" src=\"/assets/payment-brands/bcp.svg\" alt=\"BCP\" width=\"60\" height=\"22\"><span>Soles</span></span><strong class=\"sn-account\">28578124980086</strong></div><div class=\"sn-payment-row\"><span class=\"sn-method sn-wallets\"><img src=\"/assets/payment-brands/yape.png\" alt=\"Yape\" width=\"36\" height=\"36\"><span aria-hidden=\"true\">/</span><img src=\"/assets/payment-brands/plin.png\" alt=\"Plin\" width=\"36\" height=\"36\"></span><strong class=\"sn-account\">935 379 202</strong></div><p class=\"sn-owner\">Titular: <b>Edwin Castillo Gonzales</b></p><a class=\"sn-whatsapp\" target=\"_blank\" rel=\"noopener noreferrer\"><img src=\"/assets/payment-brands/whatsapp.svg\" alt=\"\" width=\"23\" height=\"23\"><span>WhatsApp · 913 238 002</span><span aria-hidden=\"true\">↗</span></a><small>Coordina tu renovación o envía tu comprobante por WhatsApp.</small></section>";
 const contact=root=>{root.querySelector('.sn-whatsapp').href='https://wa.me/51913238002?text='+encodeURIComponent('Hola Edwin, quiero coordinar la renovación de mi servicio EDUXFAC.');};
 window.showSubscriptionNotice=notice=>{
  if(!notice||!['POR_VENCER','GRACIA'].includes(notice.tipo))return Promise.resolve();
  const overdue=notice.tipo==='GRACIA',days=Number(overdue?notice.dias_vencidos:notice.dias_restantes);
  if(!Number.isInteger(days)||days<0||days>3)return Promise.resolve();
  return new Promise(resolve=>{
   const previous=document.activeElement,dialog=document.createElement('dialog');
   dialog.className='subscription-notice'+(overdue?' subscription-notice-grace':'');
   dialog.setAttribute('aria-labelledby','subscriptionNoticeTitle');dialog.setAttribute('aria-describedby','subscriptionNoticeDescription');
   dialog.innerHTML='<div class="sn-hero"><div class="sn-brand"><span class="sn-brand-mark">+</span><b>EDUXFAC</b><span>AVISO DE TU SERVICIO</span></div><div class="sn-heading"><div class="sn-heading-copy"><span class="sn-calendar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4M12 2V1"/></svg></span><span class="sn-tag"></span></div><div class="sn-count" aria-hidden="true"><strong></strong><span></span></div></div></div><div class="sn-body"><h2 id="subscriptionNoticeTitle"></h2><p id="subscriptionNoticeDescription"></p><div class="sn-period"><div><span>Vencimiento de tu periodo</span><strong class="sn-due"></strong></div><div><span class="sn-extra-label"></span><strong class="sn-extra"></strong></div></div><div class="sn-reassurance"><span aria-hidden="true">✓</span><p></p></div>'+paymentMarkup+'<button type="button" class="sn-continue">Entendido, continuar <span aria-hidden="true">→</span></button><small class="sn-footer">Un recordatorio de EDUXFAC, siempre contigo.</small></div>';
   dialog.querySelector('.sn-count strong').textContent=days===0?'Hoy':String(days).padStart(2,'0');
   dialog.querySelector('.sn-count span').textContent=overdue?'DÍA DE GRACIA':days===0?'VENCIMIENTO':days===1?'DÍA RESTANTE':'DÍAS RESTANTES';
   contact(dialog);
   const date=value=>new Date(value).toLocaleString('es-PE',{timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short'});
   dialog.querySelector('.sn-tag').textContent=overdue?(days===3?'ÚLTIMO DÍA DE GRACIA':'PERIODO DE GRACIA'):'RECORDATORIO DE PAGO';
   dialog.querySelector('h2').textContent=overdue?'Tu periodo venció hace '+days+' '+(days===1?'día':'días'):days===0?'Tu periodo vence hoy':'Tu periodo vence en '+days+' '+(days===1?'día':'días');
   dialog.querySelector('#subscriptionNoticeDescription').textContent=overdue?'Llevas '+days+' '+(days===1?'día vencido':'días vencidos')+'. Coordina tu renovación y evita el bloqueo de tu servicio al finalizar los 3 días de gracia.':'Recuerda coordinar el pago de tu próximo periodo para seguir trabajando con tranquilidad.';
   dialog.querySelector('.sn-due').textContent=date(notice.fecha_vencimiento);
   dialog.querySelector('.sn-extra-label').textContent=overdue?'Acceso disponible hasta':'Después del vencimiento';
   dialog.querySelector('.sn-extra').textContent=overdue?date(notice.fin_gracia):'3 días de gracia';
   dialog.querySelector('.sn-reassurance p').textContent='Tu acceso continúa disponible. Puedes abrir caja y trabajar con normalidad.';
   const close=()=>{dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();resolve();};
   dialog.querySelector('.sn-continue').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
   document.body.append(dialog);dialog.showModal();dialog.querySelector('.sn-continue').focus();
  });
 };
 window.showSubscriptionBlock=()=>{
  if(document.getElementById('subscriptionBlocked'))return;
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  const screen=document.createElement('section');screen.id='subscriptionBlocked';screen.className='subscription-block';screen.setAttribute('aria-labelledby','subscriptionBlockedTitle');
  screen.innerHTML='<div class="sb-shell"><div class="sb-intro"><div class="sb-brand"><span class="sn-brand-mark">+</span><b>EDUXFAC</b><span>SIEMPRE CONTIGO</span></div><div class="sb-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></div><span class="sb-status">SERVICIO POR RENOVAR</span><h1 id="subscriptionBlockedTitle">Renueva tu servicio.<br><span>Sigamos creciendo juntos.</span></h1><p class="sb-description">Tu periodo de pago y los 3 días de gracia han finalizado. El acceso al sistema está temporalmente bloqueado hasta confirmar tu renovación.</p><div class="sb-data"><span aria-hidden="true">✓</span><p>Tus datos e historial se mantienen guardados.<br>Podrás continuar trabajando cuando se reactive tu servicio.</p></div><small class="sb-signature">EDUXFAC · Tu botica, siempre contigo.</small></div><div class="sb-card"><div class="sb-card-title"><span>UN PASO PARA CONTINUAR</span><h2>Coordina tu renovación</h2><p>Realiza tu pago y envía el comprobante a nuestro WhatsApp.</p></div>'+paymentMarkup+'<button type="button" class="sn-continue sb-login">Ya renové, iniciar sesión <span aria-hidden="true">→</span></button><p class="sb-confirmation">La habilitación se confirma una vez registrada tu renovación.</p></div></div>';
  contact(screen);document.body.append(screen);
  for(const child of document.body.children)if(child!==screen)child.inert=true;
  document.getElementById('app')?.classList.add('hidden');document.getElementById('login')?.classList.add('hidden');
  const password=document.getElementById('loginPass');if(password)password.value='';
  document.body.style.overflow='hidden';
  screen.querySelector('.sb-login').onclick=()=>{localStorage.removeItem('bw_token');location.reload();};
  screen.querySelector('.sn-whatsapp').focus({preventScroll:true});
 };
 if(window.pendingSubscriptionBlock)window.showSubscriptionBlock();

})();
