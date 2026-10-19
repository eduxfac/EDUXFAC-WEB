import fs from 'node:fs';import pg from '/home/eduxadmin/eduxfac/releases/phase12b_20261013_0625/web/node_modules/pg/lib/index.js';
const s=JSON.parse(fs.readFileSync('/home/eduxadmin/.config/eduxfac/pilot/SECRETS_PRIVATE.json','utf8'));
const db=new pg.Client({host:'vmi3635195.contaboserver.net',database:'eduxfac_web_piloto',user:'eduxfac_web_migrator',password:s.roles.eduxfac_web_migrator,ssl:{rejectUnauthorized:true,ca:fs.readFileSync('/etc/ssl/certs/ssl-cert-snakeoil.pem','utf8')},options:'-c default_transaction_read_only=on -c statement_timeout=10000'});



await db.connect();try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const id=(await db.query("select p.id,p.empresa_id from productos p join empresas e on e.id=p.empresa_id where e.ruc='10460023039' and p.codigo_interno='P000004' and p.nombre='ABRILAR JARABE 120ML'")).rows[0];if(!id)throw Error('PRODUCT_SCOPE_CHANGED');
 const params=[id.id,id.empresa_id];
 const simulation=(await db.query(`with balances as (
 select l.id,l.numero_lote,l.fecha_vencimiento::text vencimiento,l.cantidad_disponible stock,l.costo_unitario costo_lote,
 coalesce(m.q,0) cantidad_movimientos,coalesce(m.v,0) valor_movimientos,
 coalesce(l.valor_base_costos,(l.cantidad_disponible-coalesce(m.q,0))*l.costo_unitario) apertura,
 coalesce(l.valor_base_costos,(l.cantidad_disponible-coalesce(m.q,0))*l.costo_unitario)+coalesce(m.v,0) valor_usado,
 s.codigo sucursal
 from lotes l join sucursales s on s.id=l.sucursal_id and s.empresa_id=$2
 left join lateral(select sum(mi.cantidad) q,sum(mi.cantidad*coalesce(mi.costo_unitario,0)) v from movimientos_inventario mi where mi.lote_id=l.id and mi.producto_id=l.producto_id and mi.sucursal_id=l.sucursal_id and mi.empresa_id=$2) m on true
 where l.producto_id=$1 and l.cantidad_disponible>0 and s.codigo='PRINCIPAL'
 ), ordered as(select *,coalesce(sum(stock) over(order by vencimiento asc nulls last,id rows between unbounded preceding and 1 preceding),0) anteriores from balances), consumed as (
 select *,greatest(least(stock,8::numeric-anteriores),0) tomar,
 case when stock>0 and valor_usado>0 then valor_usado/stock else costo_lote end costo_snapshot_simulado
 from ordered
 ) select *,tomar*costo_snapshot_simulado costo_consumido_sistema,tomar*costo_lote costo_consumido_lote from consumed order by vencimiento asc nulls last,id`,params)).rows;
 const lookup=(await db.query(`select s.codigo sucursal,
 coalesce((select cd.costo_unitario from compra_detalles cd join compras c on c.id=cd.compra_id where cd.producto_id=p.id and c.sucursal_id=s.id order by c.created_at desc,cd.id desc limit 1),
 (select l2.costo_unitario from lotes l2 where l2.producto_id=p.id and l2.sucursal_id=s.id and l2.costo_unitario>0 order by l2.fecha_vencimiento desc nulls last,l2.id desc limit 1),0)::numeric(14,4) costo_buscador,
 (select l2.numero_lote from lotes l2 where l2.producto_id=p.id and l2.sucursal_id=s.id and l2.costo_unitario>0 order by l2.fecha_vencimiento desc nulls last,l2.id desc limit 1) lote_fallback_buscador
 from productos p join producto_sucursal ps on ps.producto_id=p.id join sucursales s on s.id=ps.sucursal_id where p.id=$1 and p.empresa_id=$2`,params)).rows;
 const scopeRisk=(await db.query(`select p.id,p.nombre,count(*)::int lotes_iniciales,
 sum(l.valor_base_costos)::text apertura_guardada,sum(init.valor)::text valor_movimientos_iniciales,
 sum(l.cantidad_disponible)::text stock_actual,
 count(*) filter(where l.valor_base_costos=init.valor and init.valor>0)::int lotes_con_apertura_duplicada
 from lotes l join productos p on p.id=l.producto_id
 join lateral(select sum(mi.cantidad*mi.costo_unitario) valor from movimientos_inventario mi where mi.lote_id=l.id and mi.producto_id=l.producto_id and mi.sucursal_id=l.sucursal_id and mi.empresa_id=$1 and mi.tipo='INVENTARIO_INICIAL') init on init.valor is not null
 where p.empresa_id=$1 group by p.id,p.nombre order by p.nombre`,[id.empresa_id])).rows;
 const guard=(await db.query("select current_database() db,current_setting('transaction_read_only') read_only,now() snapshot")).rows[0];
 await db.query('ROLLBACK');console.log(JSON.stringify({guard,simulation,lookup,scopeRisk,executed_sale:false,writes:false},null,2));
}finally{await db.end()}
