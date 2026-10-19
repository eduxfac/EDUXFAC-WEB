import fs from 'node:fs';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js';
const s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json','utf8'));
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_web_piloto',user:'eduxfac_web_migrator',password:s.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c default_transaction_read_only=on -c statement_timeout=10000'});


import crypto from 'node:crypto';
const root='/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/';
const names=['server/src/app.js','server/src/sale-profitability.js','server/src/stock-cost.js','server/src/inventory-entry.js','server/src/initial-inventory.js','public/index.html'];
const hashes=Object.fromEntries(names.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(root+n)).digest('hex')]));
await db.connect();try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const guard=(await db.query("select current_database() db,current_setting('transaction_read_only') read_only,now() snapshot")).rows[0];if(guard.db!=='eduxfac_web_piloto'||guard.read_only!=='on')throw Error('READONLY_PILOT_REQUIRED');
 const products=(await db.query("select p.id,p.empresa_id,p.codigo_interno,p.codigo_anterior,p.nombre,p.unidad_medida,p.presentacion,p.activo from productos p join empresas e on e.id=p.empresa_id where e.ruc='10460023039' and p.nombre ilike '%ABRILAR%' order by p.nombre,p.id")).rows;
 const ids=products.map(p=>p.id);if(!ids.length)throw Error('ABRILAR_NOT_FOUND');const company=products[0].empresa_id;
 const branches=(await db.query('select ps.*,s.codigo,s.nombre from producto_sucursal ps join sucursales s on s.id=ps.sucursal_id where ps.producto_id=any($1::uuid[]) order by s.codigo',[ids])).rows;
 const lots=(await db.query("select l.*,coalesce((select sum(m.cantidad) from movimientos_inventario m where m.lote_id=l.id and m.producto_id=l.producto_id and m.sucursal_id=l.sucursal_id and m.empresa_id=$2),0)::text cantidad_movimientos,coalesce((select sum(m.cantidad*coalesce(m.costo_unitario,0)) from movimientos_inventario m where m.lote_id=l.id and m.producto_id=l.producto_id and m.sucursal_id=l.sucursal_id and m.empresa_id=$2),0)::text valor_movimientos from lotes l where l.producto_id=any($1::uuid[]) order by l.sucursal_id,l.fecha_vencimiento asc nulls last,l.id",[ids,company])).rows;
 const movements=(await db.query('select id,producto_id,sucursal_id,lote_id,tipo,cantidad,costo_unitario,(cantidad*coalesce(costo_unitario,0))::text valor,referencia_tipo,referencia_id,created_at from movimientos_inventario where producto_id=any($1::uuid[]) and empresa_id=$2 order by created_at,id',[ids,company])).rows;
 const purchases=(await db.query('select c.id compra_id,c.sucursal_id,c.fecha,c.created_at,c.tipo_documento,c.serie,c.numero,c.total total_compra,c.moneda,cd.* from compra_detalles cd join compras c on c.id=cd.compra_id where cd.producto_id=any($1::uuid[]) and c.empresa_id=$2 order by c.created_at,cd.id',[ids,company])).rows;
 const sales=(await db.query('select v.id venta_id,v.sucursal_id,v.created_at,v.estado,v.numero,v.tipo_comprobante,v.subtotal,v.descuento descuento_venta,v.total total_venta,vd.* from venta_detalles vd join ventas v on v.id=vd.venta_id where vd.producto_id=any($1::uuid[]) and v.empresa_id=$2 order by v.created_at,vd.id',[ids,company])).rows;
 const returns=(await db.query('select d.id devolucion_id,d.venta_id,d.sucursal_id,d.tipo,d.monto monto_devolucion,d.created_at,dd.venta_detalle_id,dd.cantidad,dd.monto from devoluciones_venta d join devolucion_venta_detalles dd on dd.devolucion_id=d.id join venta_detalles vd on vd.id=dd.venta_detalle_id where vd.producto_id=any($1::uuid[]) and d.empresa_id=$2 order by d.created_at,dd.id',[ids,company])).rows;
 const prices=(await db.query('select * from precios_producto where producto_id=any($1::uuid[]) order by producto_id,vigente_desde,id',[ids])).rows;
 const relevantIds=[...ids,...lots.map(l=>l.id)];
 const audit=(await db.query("select id,accion,entidad,entidad_id,detalle,created_at from auditoria where empresa_id=$2 and ((accion='CONCILIAR_COSTO_STOCK' and (entidad_id=any($1::uuid[]) or detalle->>'producto_id'=any($3::text[]))) or (accion='IMPORTAR_INVENTARIO_INICIAL' and detalle->>'batch_id'=any($4::text[]))) order by created_at,id",[relevantIds,company,ids,movements.filter(m=>m.tipo==='INVENTARIO_INICIAL').map(m=>m.referencia_id)])).rows;
 const rls=(await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r' and relforcerowsecurity")).rows[0].n;
 await db.query('ROLLBACK');console.log(JSON.stringify({guard,hashes,products,branches,lots,movements,purchases,sales,returns,prices,audit,force_rls:rls},null,2));
}finally{await db.end()}
