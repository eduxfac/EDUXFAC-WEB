export const SUBSCRIPTION_GRACE_DAYS=3;
export const SUBSCRIPTION_DAY_MS=86400000;
export const SUBSCRIPTION_GRACE_MS=SUBSCRIPTION_GRACE_DAYS*SUBSCRIPTION_DAY_MS;

// Peru has no daylight-saving changes: three complete days are 72 hours.
// Preserve the commercial due date for renewals, invoices and history.
export function subscriptionTiming(expiration,now=Date.now()){
 const end=expiration?new Date(expiration).getTime():NaN,at=new Date(now).getTime();
 if(!Number.isFinite(end)||!Number.isFinite(at))return null;
 const graceEnd=end+SUBSCRIPTION_GRACE_MS;
 return {fecha_vencimiento:new Date(end).toISOString(),fin_gracia:new Date(graceEnd).toISOString(),
  dias_restantes:Math.max(0,Math.ceil((end-at)/SUBSCRIPTION_DAY_MS)),
  dias_vencidos:at>=end?Math.floor((at-end)/SUBSCRIPTION_DAY_MS)+1:0,
  en_gracia:at>=end&&at<graceEnd,bloqueo_por_fecha:at>=graceEnd};
}
export function subscriptionNotice(access,now=Date.now()){
 if(access.estado!=='ACTIVO'||access.empresa_activa!==true)return null;
 if(access.suscripcion_requerida&&(!access.suscripcion_id||access.estado_suscripcion!=='ACTIVA'))return null;
 const timing=subscriptionTiming(access.fecha_vencimiento,now);
 if(!timing||timing.bloqueo_por_fecha||(!timing.en_gracia&&timing.dias_restantes>3))return null;
 return {...timing,tipo:timing.en_gracia?'GRACIA':'POR_VENCER',dias_gracia:SUBSCRIPTION_GRACE_DAYS};
}
