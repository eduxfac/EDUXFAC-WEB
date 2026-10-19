(()=>{
 const MONTHS=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
 const format=new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',minimumFractionDigits:2,maximumFractionDigits:2});
 window.createMonthlySales=({api,getBranchId})=>{
  const year=document.getElementById('dashMonthlyYear'),chart=document.getElementById('dashMonthlyChart'),total=document.getElementById('dashMonthlyTotal'),status=document.getElementById('dashMonthlyStatus');
  let selectedYear,sequence=0;
  async function load(){
   const branch=getBranchId(),request=++sequence;if(!branch){selectedYear=undefined;chart.innerHTML='';chart.classList.toggle('monthly-has-negative',false);chart.setAttribute('aria-busy','false');total.textContent='—';status.textContent='Seleccione una sucursal.';year.innerHTML='';year.value='';year.disabled=true;return}
   chart.setAttribute('aria-busy','true');chart.innerHTML='<div class="monthly-loading">Consultando ventas mensuales...</div>';total.textContent='—';status.textContent='';year.disabled=true;
   try{
    const query=new URLSearchParams({sucursal_id:branch,...(selectedYear?{year:String(selectedYear)}:{})}),data=await api('/api/dashboard/monthly-sales?'+query);
    if(request!==sequence||branch!==getBranchId())return;
    if(!Number.isInteger(data.year)||data.year<1900||data.year>9998||!Array.isArray(data.months)||data.months.length!==12||data.months.some((m,i)=>Number(m.month)!==i+1||!Number.isFinite(Number(m.total)))||!Number.isFinite(Number(data.total_year)))throw Error('Respuesta mensual inválida.');
    selectedYear=data.year;const years=[...new Set([...(data.years||[]),data.year])].filter(y=>Number.isInteger(y)&&y>=1900&&y<=9998).sort((a,b)=>b-a);
    year.innerHTML=years.map(y=>'<option value="'+y+'"'+(y===selectedYear?' selected':'')+'>'+y+'</option>').join('');year.value=String(selectedYear);
    const negative=data.months.some(m=>Number(m.total)<0);chart.classList.toggle('monthly-has-negative',negative);const max=Math.max(1,...data.months.map(m=>Math.abs(Number(m.total))));
    chart.innerHTML=data.months.map((m,i)=>{const value=Number(m.total),label=MONTHS[i],amount=format.format(value),height=value!==0?Math.max(1,Math.abs(value)/max*(negative?50:100)):0,position=negative?(value<0?'top:50%;':'bottom:50%;'):'';return '<div class="monthly-bar-col" role="listitem" aria-label="'+label+': '+amount+'"><span class="monthly-bar-value" title="'+amount+'">'+amount+'</span><div class="monthly-bar-track" aria-hidden="true"><i style="height:'+height+'%;'+position+'"></i></div><b>'+label+'</b></div>'}).join('');
    total.textContent=format.format(Number(data.total_year));status.textContent=data.months.every(m=>Number(m.total)===0)?'Sin ventas netas en el año seleccionado.':'Ventas netas según la fecha de venta · Sucursal activa';
   }catch(e){if(request===sequence&&branch===getBranchId()){chart.innerHTML='<div class="monthly-loading">No se pudieron cargar las ventas mensuales.</div>';total.textContent='—';status.textContent=e.message||'Intente nuevamente.'}}
   finally{if(request===sequence){chart.setAttribute('aria-busy','false');year.disabled=false}}
  }
  year.onchange=()=>{selectedYear=Number(year.value);void load()};return{load};
 };
})();
