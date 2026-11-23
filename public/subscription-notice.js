(()=>{
 window.showSubscriptionNotice=notice=>{
  if(!notice||!['POR_VENCER','GRACIA'].includes(notice.tipo))return Promise.resolve();
  const overdue=notice.tipo==='GRACIA',days=Number(overdue?notice.dias_vencidos:notice.dias_restantes);
  if(!Number.isInteger(days)||days<0||days>3)return Promise.resolve();
  return new Promise(resolve=>{
   const previous=document.activeElement,dialog=document.createElement('dialog');
   dialog.className='subscription-notice'+(overdue?' subscription-notice-grace':'');
   dialog.setAttribute('aria-labelledby','subscriptionNoticeTitle');dialog.setAttribute('aria-describedby','subscriptionNoticeDescription');
   dialog.innerHTML='<div class="sn-brand"><span class="sn-brand-mark">+</span><b>EDUXFAC</b><span>AVISO DE TU SERVICIO</span></div><div class="sn-body"><div class="sn-heading"><span class="sn-calendar" aria-hidden="true">◷</span><span class="sn-tag"></span></div><h2 id="subscriptionNoticeTitle"></h2><p id="subscriptionNoticeDescription"></p><div class="sn-period"><div><span>Vencimiento de tu periodo</span><strong class="sn-due"></strong></div><div><span class="sn-extra-label"></span><strong class="sn-extra"></strong></div></div><div class="sn-reassurance"><span aria-hidden="true">✓</span><p></p></div><button type="button" class="sn-continue">Entendido, continuar <span aria-hidden="true">→</span></button><small class="sn-footer">Un recordatorio de EDUXFAC, siempre contigo.</small></div>';
   const date=value=>new Date(value).toLocaleString('es-PE',{timeZone:'America/Lima',dateStyle:'medium',timeStyle:'short'});
   dialog.querySelector('.sn-tag').textContent=overdue?(days===3?'ÚLTIMO DÍA DE GRACIA':'PERIODO DE GRACIA'):'RECORDATORIO DE PAGO';
   dialog.querySelector('h2').textContent=overdue?'Tu periodo venció hace '+days+' '+(days===1?'día':'días'):days===0?'Tu periodo vence hoy':'Tu periodo vence en '+days+' '+(days===1?'día':'días');
   dialog.querySelector('#subscriptionNoticeDescription').textContent=overdue?'Llevas '+days+' '+(days===1?'día vencido':'días vencidos')+'. Coordina tu renovación y evita el bloqueo de tu servicio al finalizar los 3 días de gracia.':'Recuerda coordinar el pago de tu próximo periodo para seguir trabajando con tranquilidad.';
   dialog.querySelector('.sn-due').textContent=date(notice.fecha_vencimiento);
   dialog.querySelector('.sn-extra-label').textContent=overdue?'Acceso disponible hasta':'Después del vencimiento';
   dialog.querySelector('.sn-extra').textContent=overdue?date(notice.fin_gracia):'3 días de gracia';
   dialog.querySelector('.sn-reassurance p').textContent='Tu acceso continúa disponible. Puedes abrir caja y trabajar con normalidad.';
   const close=()=>{dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();resolve();};
   dialog.querySelector('button').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
   document.body.append(dialog);dialog.showModal();dialog.querySelector('button').focus();
  });
 };
})();
