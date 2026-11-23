import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionTiming,subscriptionNotice,SUBSCRIPTION_DAY_MS as DAY} from '../server/src/subscription-policy.js';
import {assertCompanyAccess} from '../server/src/company-access.js';

const end=Date.parse('2026-12-01T00:00:00-05:00');
const access={empresa_activa:true,estado:'ACTIVO',suscripcion_requerida:true,suscripcion_id:'paid',estado_suscripcion:'ACTIVA',fecha_inicio:'2026-11-01T00:00:00-05:00',fecha_vencimiento:new Date(end).toISOString(),auth_version:'1'};
test('Avisos 3, 2 y 1 días antes, sin aviso anticipado fuera de ventana',()=>{
 assert.equal(subscriptionNotice(access,end-4*DAY),null);
 for(const days of [3,2,1]){const notice=subscriptionNotice(access,end-days*DAY);assert.equal(notice.tipo,'POR_VENCER');assert.equal(notice.dias_restantes,days);assert.doesNotThrow(()=>assertCompanyAccess(access,{now:end-days*DAY}));}
});
test('Gracia de 72 horas: días 1, 2 y 3 con acceso normal y misma sesión',()=>{
 for(const days of [1,2,3]){const now=end+(days-1)*DAY,notice=subscriptionNotice(access,now);assert.equal(notice.tipo,'GRACIA');assert.equal(notice.dias_vencidos,days);assert.doesNotThrow(()=>assertCompanyAccess(access,{now,authVersion:'1'}));}
 assert.doesNotThrow(()=>assertCompanyAccess(access,{now:end+3*DAY-1}));
 assert.throws(()=>assertCompanyAccess(access,{now:end+3*DAY}),e=>e.code==='EMPRESA_VENCIDO');
 assert.equal(subscriptionNotice(access,end+3*DAY),null);
 assert.equal(subscriptionTiming(access.fecha_vencimiento,end).fin_gracia,'2026-12-04T05:00:00.000Z');
});
test('La gracia no levanta suspensión, cancelación, desactivación ni sesión revocada',()=>{
 for(const estado of ['SUSPENDIDO','CANCELADO','PENDIENTE','VENCIDO'])assert.throws(()=>assertCompanyAccess({...access,estado},{now:end+DAY}));
 for(const estado_suscripcion of ['SUSPENDIDA','CANCELADA','PENDIENTE','VENCIDA'])assert.throws(()=>assertCompanyAccess({...access,estado_suscripcion},{now:end+DAY}));
 assert.throws(()=>assertCompanyAccess({...access,empresa_activa:false},{now:end+DAY}));
 assert.throws(()=>assertCompanyAccess(access,{now:end+DAY,authVersion:'2'}),e=>e.code==='SESION_REVOCADA');
 assert.equal(subscriptionNotice({...access,estado:'SUSPENDIDO'},end+DAY),null);
 assert.equal(subscriptionNotice({...access,fecha_vencimiento:null},end),null);
});
