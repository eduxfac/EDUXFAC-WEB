export function diagnoseAccess(user,company={},now=Date.now()){
 const reasons=[];
 if(user.activo!==true)reasons.push('USER_INACTIVE');
 if(company.empresa_activa!==true)reasons.push('COMPANY_INACTIVE');
 if(company.estado!=='ACTIVO')reasons.push(company.estado==='PENDIENTE'?'COMPANY_PENDING':'COMPANY_INACTIVE');
 if(company.suscripcion_requerida){
  if(!company.suscripcion_id||company.estado_suscripcion==='PENDIENTE')reasons.push('SUBSCRIPTION_PENDING');
  else if(company.estado_suscripcion==='VENCIDA')reasons.push('SUBSCRIPTION_EXPIRED');
  else if(company.estado_suscripcion!=='ACTIVA')reasons.push('SUBSCRIPTION_INACTIVE');
 }
 if(company.fecha_inicio&&new Date(company.fecha_inicio).getTime()>now)reasons.push('COMPANY_PENDING');
 if(company.fecha_vencimiento&&new Date(company.fecha_vencimiento).getTime()<=now)reasons.push('SUBSCRIPTION_EXPIRED');
 if(!user.sucursales?.some(s=>s.activo===true))reasons.push('NO_ACTIVE_BRANCH');
 if(!/^\d+$/.test(String(company.auth_version))||BigInt(company.auth_version||0)<1n)reasons.push('COMPANY_INACTIVE');
 return {login_ready:reasons.length===0,reasons:[...new Set(reasons.length?reasons:['READY'])]};
}
