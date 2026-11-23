(()=>{
 window.showSubscriptionNotice=notice=>{
  if(!notice||!['POR_VENCER','GRACIA'].includes(notice.tipo))return Promise.resolve();
  const overdue=notice.tipo==='GRACIA',days=Number(overdue?notice.dias_vencidos:notice.dias_restantes);
  if(!Number.isInteger(days)||days<0||days>3)return Promise.resolve();
  return new Promise(resolve=>{
   const previous=document.activeElement,dialog=document.createElement('dialog');
   dialog.className='subscription-notice'+(overdue?' subscription-notice-grace':'');
   dialog.setAttribute('aria-labelledby','subscriptionNoticeTitle');dialog.setAttribute('aria-describedby','subscriptionNoticeDescription');
   dialog.innerHTML='<div class="sn-hero"><div class="sn-brand"><span class="sn-brand-mark">+</span><b>EDUXFAC</b><span>AVISO DE TU SERVICIO</span></div><div class="sn-heading"><div class="sn-heading-copy"><span class="sn-calendar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4M12 2V1"/></svg></span><span class="sn-tag"></span></div><div class="sn-count" aria-hidden="true"><strong></strong><span></span></div></div></div><div class="sn-body"><h2 id="subscriptionNoticeTitle"></h2><p id="subscriptionNoticeDescription"></p><div class="sn-period"><div><span>Vencimiento de tu periodo</span><strong class="sn-due"></strong></div><div><span class="sn-extra-label"></span><strong class="sn-extra"></strong></div></div><div class="sn-reassurance"><span aria-hidden="true">✓</span><p></p></div><section class="sn-payments" aria-label="Contacto y medios de pago"><div class="sn-payment-title"><b>Renueva tu servicio</b><span>EDUXFAC</span></div><div class="sn-payment-row"><span class="sn-method sn-bcp"><img class="sn-logo-bcp" src="/assets/payment-brands/bcp.svg" alt="BCP" width="60" height="22"><span>Soles</span></span><strong class="sn-account">28578124980086</strong></div><div class="sn-payment-row"><span class="sn-method sn-wallets"><img src="/assets/payment-brands/yape.png" alt="Yape" width="36" height="36"><span aria-hidden="true">/</span><img src="/assets/payment-brands/plin.png" alt="Plin" width="36" height="36"></span><strong class="sn-account">935 379 202</strong></div><p class="sn-owner">Titular: <b>Edwin Castillo Gonzales</b></p><a class="sn-whatsapp" target="_blank" rel="noopener noreferrer"><img src="/assets/payment-brands/whatsapp.svg" alt="" width="23" height="23"><span>WhatsApp · 913 238 002</span><span aria-hidden="true">↗</span></a><small>Coordina tu renovación o envía tu comprobante por WhatsApp.</small></section><button type="button" class="sn-continue">Entendido, continuar <span aria-hidden="true">→</span></button><small class="sn-footer">Un recordatorio de EDUXFAC, siempre contigo.</small></div>';
   dialog.querySelector('.sn-count strong').textContent=days===0?'Hoy':String(days).padStart(2,'0');
   dialog.querySelector('.sn-count span').textContent=overdue?'DÍA DE GRACIA':days===0?'VENCIMIENTO':days===1?'DÍA RESTANTE':'DÍAS RESTANTES';
   dialog.querySelector('.sn-whatsapp').href='https://wa.me/51913238002?text='+encodeURIComponent('Hola Edwin, quiero coordinar la renovación de mi servicio EDUXFAC.');
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
})();
