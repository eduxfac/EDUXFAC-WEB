BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='venta_detalles' AND column_name='cantidad' AND numeric_scale<>12) THEN
  ALTER TABLE venta_detalles ALTER COLUMN cantidad TYPE numeric(24,12);
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='devolucion_venta_detalles' AND column_name='cantidad' AND numeric_scale<>12) THEN
  ALTER TABLE devolucion_venta_detalles ALTER COLUMN cantidad TYPE numeric(24,12);
 END IF;
END $$;
ALTER TABLE venta_detalles ADD COLUMN IF NOT EXISTS cantidad_base numeric(14,3);
ALTER TABLE venta_detalles ADD COLUMN IF NOT EXISTS importe_neto numeric(14,2);
ALTER TABLE devolucion_venta_detalles ADD COLUMN IF NOT EXISTS cantidad_base numeric(14,3);
ALTER TABLE devoluciones_venta ADD COLUMN IF NOT EXISTS sesion_reembolso_id uuid REFERENCES sesiones_caja(id);
ALTER TABLE devoluciones_venta DROP CONSTRAINT IF EXISTS devoluciones_venta_monto_check;
ALTER TABLE devoluciones_venta ADD CONSTRAINT devoluciones_venta_monto_check CHECK(monto>=0);

-- Recover exact historical base units from the inventory ledger when available.
WITH raw AS (
 SELECT vd.id,vd.venta_id,vd.producto_id,vd.lote_id,vd.cantidad*vd.factor_unidades weight,
   sum(vd.cantidad*vd.factor_unidades) OVER(PARTITION BY vd.venta_id,vd.producto_id,vd.lote_id) weights,
   coalesce((SELECT -sum(mi.cantidad) FROM movimientos_inventario mi WHERE mi.referencia_tipo='VENTA'
     AND mi.referencia_id=vd.venta_id AND mi.producto_id=vd.producto_id AND mi.lote_id IS NOT DISTINCT FROM vd.lote_id AND mi.tipo='VENTA'),
     sum(vd.cantidad*vd.factor_unidades) OVER(PARTITION BY vd.venta_id,vd.producto_id,vd.lote_id)) base_total,
   row_number() OVER(PARTITION BY vd.venta_id,vd.producto_id,vd.lote_id ORDER BY vd.id DESC) last_row
 FROM venta_detalles vd
), allocated AS (
 SELECT *,round(base_total*weight/nullif(weights,0),3) part FROM raw
), exact AS (
 SELECT id, CASE WHEN last_row=1 THEN part+base_total-sum(part) OVER(PARTITION BY venta_id,producto_id,lote_id) ELSE part END units FROM allocated
)
UPDATE venta_detalles vd SET cantidad_base=e.units FROM exact e WHERE vd.id=e.id AND vd.cantidad_base IS NULL;

WITH raw AS (
 SELECT vd.id,vd.venta_id,v.total,
 round(v.total*vd.total/nullif(sum(vd.total) OVER(PARTITION BY vd.venta_id),0),2) part,
 row_number() OVER(PARTITION BY vd.venta_id ORDER BY vd.id DESC) last_row
 FROM venta_detalles vd JOIN ventas v ON v.id=vd.venta_id
), exact AS (
 SELECT id, CASE WHEN last_row=1 THEN coalesce(part,0)+total-coalesce(sum(part) OVER(PARTITION BY venta_id),0) ELSE coalesce(part,0) END amount FROM raw
)
UPDATE venta_detalles vd SET importe_neto=e.amount FROM exact e WHERE vd.id=e.id AND vd.importe_neto IS NULL;

UPDATE devolucion_venta_detalles dd SET cantidad_base=round(vd.cantidad_base*dd.cantidad/nullif(vd.cantidad,0),3)
FROM venta_detalles vd WHERE vd.id=dd.venta_detalle_id AND dd.cantidad_base IS NULL;

-- Net sales are attributed to the original sale date. Cash uses the refund date/session.
CREATE OR REPLACE VIEW reporte_ventas_netas AS
SELECT v.id,v.empresa_id,v.sucursal_id,v.sesion_caja_id,v.cliente_id,v.tipo_comprobante,v.serie,v.numero,v.subtotal,v.descuento,
 (v.total-coalesce((SELECT sum(d.monto) FROM devoluciones_venta d WHERE d.venta_id=v.id),0))::numeric(14,2) total,
 v.estado,v.usuario_id,v.created_at
FROM ventas v;

CREATE OR REPLACE VIEW reporte_detalles_netos AS
SELECT vd.id,vd.venta_id,vd.producto_id,vd.lote_id,
 (vd.cantidad-coalesce(r.cantidad,0))::numeric(24,12) cantidad,vd.precio_unitario,vd.descuento,vd.costo_snapshot,
 (vd.importe_neto-coalesce(r.monto,0))::numeric(14,2) total,vd.factor_unidades,vd.presentacion_venta,
 vd.cantidad_base-coalesce(r.cantidad_base,0) cantidad_base
FROM venta_detalles vd LEFT JOIN LATERAL (
 SELECT sum(dd.cantidad) cantidad,sum(dd.monto) monto,sum(dd.cantidad_base) cantidad_base FROM devolucion_venta_detalles dd WHERE dd.venta_detalle_id=vd.id
) r ON true;

CREATE OR REPLACE VIEW reporte_pagos_netos AS
 SELECT venta_id,metodo,monto FROM venta_pagos
 UNION ALL SELECT venta_id,metodo_reembolso,-monto FROM devoluciones_venta;
COMMIT;
