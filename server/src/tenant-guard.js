import { accessError, UUID_PATTERN } from './company-access.js';
export async function ensureCompanyProduct(db,user,productId) {
 if(!UUID_PATTERN.test(String(productId||'')))throw accessError(400,'PRODUCTO_INVALIDO','Producto inválido.');
 const q=await db.query('select id from productos where id=$1 and empresa_id=$2 for share',[productId,user.empresa_id]);
 if(!q.rows[0])throw accessError(403,'PRODUCTO_AJENO','Producto no disponible para esta empresa.');
 return q.rows[0];
}
export async function ensureCompanyRequest(db,user,requestId,originId,destinationId) {
 if(!UUID_PATTERN.test(String(requestId||'')))throw accessError(400,'SOLICITUD_INVALIDA','Solicitud inválida.');
 const q=await db.query(`select id from solicitudes_internas where id=$1 and empresa_id=$2
 and sucursal_solicitante_id=$3 and (sucursal_origen_id is null or sucursal_origen_id=$4) for update`,[requestId,user.empresa_id,destinationId,originId]);
 if(!q.rows[0])throw accessError(403,'SOLICITUD_AJENA','Solicitud no disponible para esta empresa y sucursales.');
 return q.rows[0];
}
