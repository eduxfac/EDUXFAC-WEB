export const UUID_PATTERN=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const accessError=(status,code,message)=>Object.assign(new Error(message),{status,code});
export async function getCompanyAccess(db,empresaId,{lock=false}={}) {
 if(!UUID_PATTERN.test(String(empresaId||'')))throw accessError(401,'EMPRESA_INVALIDA','Empresa inválida.');
 try {
  const {rows}=await db.query(`select e.id empresa_id,e.activo empresa_activa,a.estado,a.fecha_inicio,a.fecha_vencimiento,a.limite_sucursales,a.limite_usuarios,a.auth_version,a.updated_at,coalesce((to_jsonb(a)->>'suscripcion_requerida')::boolean,false) suscripcion_requerida,to_jsonb(a)->>'suscripcion_id' suscripcion_id,to_jsonb(a)->>'estado_suscripcion' estado_suscripcion
   from empresas e left join empresa_acceso a on a.empresa_id=e.id where e.id=$1`+(lock?' for share of e':''),[empresaId]);
  if(!rows[0])throw accessError(403,'EMPRESA_NO_DISPONIBLE','Empresa no disponible.');
  return rows[0];
 } catch(error) {
  if(error.code==='42P01'||error.code==='42703')throw accessError(503,'ESQUEMA_ACCESO_PENDIENTE','Falta aplicar la migración de acceso WEB.');
  throw error;
 }
}
export function assertCompanyAccess(access,{authVersion,now=Date.now()}={}) {
 if(access.empresa_activa!==true)throw accessError(403,'EMPRESA_INACTIVA','Empresa desactivada.');
 const messages={PENDIENTE:'Empresa pendiente de activación.',SUSPENDIDO:'Empresa suspendida.',VENCIDO:'Suscripción vencida.',CANCELADO:'Acceso cancelado.'};
 if(access.estado!=='ACTIVO')throw accessError(403,'EMPRESA_'+(messages[access.estado]?access.estado:'PENDIENTE'),access.estado==='VENCIDO'&&access.suscripcion_requerida?'Tu suscripción EDUXFAC WEB ha vencido. Comunícate con soporte para renovar.':messages[access.estado]||messages.PENDIENTE);
 if(access.suscripcion_requerida){if(!access.suscripcion_id||access.estado_suscripcion==='PENDIENTE')throw accessError(403,'SUSCRIPCION_PENDIENTE','Suscripción pendiente de activación.');if(access.estado_suscripcion!=='ACTIVA')throw accessError(403,'SUSCRIPCION_'+access.estado_suscripcion,access.estado_suscripcion==='VENCIDA'?'Tu suscripción EDUXFAC WEB ha vencido. Comunícate con soporte para renovar.':'Suscripción bloqueada administrativamente.');}
 if(access.fecha_inicio && new Date(access.fecha_inicio).getTime()>now)throw accessError(403,'VIGENCIA_PENDIENTE','La vigencia todavía no ha comenzado.');
 if(access.fecha_vencimiento && new Date(access.fecha_vencimiento).getTime()<=now)throw accessError(403,'EMPRESA_VENCIDO',access.suscripcion_requerida?'Tu suscripción EDUXFAC WEB ha vencido. Comunícate con soporte para renovar.':messages.VENCIDO);
 if(!/^\d+$/.test(String(access.auth_version))||BigInt(access.auth_version)<1n)throw accessError(403,'ACCESO_INVALIDO','Configuración de acceso inválida.');
 if(authVersion!==undefined && String(authVersion)!==String(access.auth_version))throw accessError(401,'SESION_REVOCADA','Sesión revocada. Inicia sesión nuevamente.');
 return access;
}
export function sendAccessError(res,error) {
 return res.status(error.status||500).json({error:error.status?error.message:'No se pudo verificar el acceso.',code:error.status?error.code:'ACCESO_NO_DISPONIBLE'});
}
