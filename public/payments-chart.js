(()=>{
 const colors={Efectivo:'#19a85a',Yape:'#8d35b5',Plin:'#06b6c5',Tarjeta:'#2778e8',Transferencia:'#f4a528',Otro:'#74869b'};
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(value);
 window.renderPaymentDonut=(box,rows)=>{
  const data=rows.map(row=>({...row,value:Number(row.total||0)}));
  if(data.some(row=>!Number.isFinite(row.value)))throw Error('Importes de pago inválidos.');
  const total=data.reduce((sum,row)=>sum+row.value,0),positive=data.reduce((sum,row)=>sum+Math.max(0,row.value),0);
  const negative=data.some(row=>row.value<0);let offset=0;
  const entries=data.map(row=>{
   const percent=positive?Math.max(0,row.value)*100/positive:0,color=colors[row.metodo]||colors.Otro;
   const circle=percent?'<circle class="payment-donut-sector" cx="60" cy="60" r="45" pathLength="100" fill="none" stroke="'+color+'" stroke-width="17" stroke-dasharray="'+percent+' '+(100-percent)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 60 60)"><title>'+esc(row.metodo)+': '+esc(money(row.value))+' · '+percent.toFixed(1)+'%</title></circle>':'';
   offset+=percent;
   const share=row.value<0?'Importe negativo':(percent.toLocaleString('es-PE',{maximumFractionDigits:1})+'%');
   return {circle,legend:'<li><span class="payment-legend-dot" style="background:'+color+'"></span><div><b>'+esc(row.metodo)+'</b><small>'+esc(share)+'</small></div><strong>'+esc(money(row.value))+'</strong></li>'};
  });
  box.innerHTML='<div class="payment-donut-layout"><div class="payment-donut"><svg viewBox="0 0 120 120" role="img" aria-label="'+esc('Distribución de pagos de hoy. Total '+money(total))+'"><circle cx="60" cy="60" r="45" fill="none" stroke="#eaf0f7" stroke-width="17"/>'+entries.map(row=>row.circle).join('')+'</svg><div class="payment-donut-total"><small>Total de hoy</small><b>'+esc(money(total))+'</b></div></div><ul class="payment-donut-legend">'+(entries.map(row=>row.legend).join('')||'<li class="payment-donut-empty">Sin pagos registrados hoy.</li>')+'</ul></div>'+(negative?'<p class="payment-donut-note">El gráfico representa los importes positivos; el total incluye los importes negativos.</p>':'');
 };
})();
