import {accessError} from './company-access.js';
export const COMPANY_STATES=Object.freeze(['PENDIENTE','ACTIVO','SUSPENDIDO','VENCIDO','CANCELADO']);
export const STATE_ACTIONS=Object.freeze({
 ACTIVAR:{target:'ACTIVO',from:['PENDIENTE']},
 SUSPENDER:{target:'SUSPENDIDO',from:['ACTIVO','SUSPENDIDO']},
 REACTIVAR:{target:'ACTIVO',from:['SUSPENDIDO','VENCIDO','ACTIVO']},
 VENCER:{target:'VENCIDO',from:['ACTIVO','VENCIDO']},
 CANCELAR:{target:'CANCELADO',from:['PENDIENTE','ACTIVO','SUSPENDIDO','VENCIDO','CANCELADO']}
});
// Reafirmar el mismo estado con otro comando revoca sesiones y queda auditado.
// Repetir el MISMO command_id se resuelve antes de aplicar esta política.
export function assertStateTransition(state,action){
 const rule=STATE_ACTIONS[action];
 if(state==='CANCELADO'&&action!=='CANCELAR')throw accessError(409,'EMPRESA_CANCELADA','Cancelación terminal: requiere un procedimiento especial de recuperación futuro.');
 if(action==='REACTIVAR'&&state==='PENDIENTE')throw accessError(409,'ALTA_PENDIENTE','Reactivar no permite completar un alta pendiente.');
 if(!rule||!rule.from.includes(state))throw accessError(409,'TRANSICION_INVALIDA','Transición de estado no permitida.');
 return rule.target;
}
