// Única política de cálculo mensual. Panel usa las fechas confirmadas por WEB.
const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export const RENEWAL_MONTHS=Object.freeze([1,2,3,6,12]);
const monthDays=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
export function authorizedInstant(value){
 if(typeof value!=='string')throw Error('Fecha autorizada obligatoria.');
 const match=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2}))?$/);
 if(!match)throw Error('Usa fecha YYYY-MM-DD o instante ISO con zona explícita.');
 const [,ys,ms,ds,h='00',min='00',sec='00']=match,y=Number(ys),m=Number(ms),d=Number(ds);
 if(y<1900||y>9998||m<1||m>12||d<1||d>monthDays(y,m)||Number(h)>23||Number(min)>59||Number(sec)>59)throw Error('Fecha inválida.');
 const date=new Date(value.length===10?value+'T00:00:00-05:00':value);
 if(!Number.isFinite(date.getTime()))throw Error('Instante inválido.');
 return date.toISOString();
}
export function addMonthlyCycles(instant,months=1){
 if(!RENEWAL_MONTHS.includes(months))throw Error('Meses permitidos: 1, 2, 3, 6 o 12.');
 let date=new Date(authorizedInstant(instant));
 for(let i=0;i<months;i++){
  const p=Object.fromEntries(parts.formatToParts(date).map(x=>[x.type,x.value]));
  let y=Number(p.year),m=Number(p.month)+1;if(m>12){m=1;y++;}
  if(y>9998)throw Error('Vigencia fuera del rango admitido.');
  const d=Math.min(Number(p.day),monthDays(y,m)),pad=x=>String(x).padStart(2,'0');
  date=new Date(y+'-'+pad(m)+'-'+pad(d)+'T'+p.hour+':'+p.minute+':'+p.second+'.'+String(date.getUTCMilliseconds()).padStart(3,'0')+'-05:00');
 }
 return date.toISOString();
}
export function renewalPeriod(current,authorized,months=1){
 const at=authorizedInstant(authorized),expired=Date.parse(current.fecha_vencimiento)<=Date.parse(at);
 const start=expired?at:authorizedInstant(current.fecha_inicio);
 const end=addMonthlyCycles(expired?at:current.fecha_vencimiento,months);
 return {fecha_inicio:start,fecha_vencimiento:end,intervalo_vencido_inicio:expired?authorizedInstant(current.fecha_vencimiento):null,intervalo_vencido_fin:expired?at:null};
}

// Si vence y se renueva el mismo día, una fecha sin hora comienza en el instante de autorización, nunca antes del vencimiento.
export function renewalAuthorizedInstant(current,value,now=Date.now()){const at=authorizedInstant(value);if(value.length===10&&Date.parse(current.fecha_vencimiento)<=now&&Date.parse(at)<Date.parse(current.fecha_vencimiento)&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))===value)return new Date(now).toISOString();return at;}
