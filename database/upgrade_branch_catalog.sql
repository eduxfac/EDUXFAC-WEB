BEGIN;
CREATE TABLE IF NOT EXISTS eduxfac_migraciones(nombre text PRIMARY KEY,aplicada_en timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS producto_sucursal (
  producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES sucursales(id),
  stock_minimo numeric(14,3) NOT NULL DEFAULT 0 CHECK(stock_minimo>=0),
  stock_maximo numeric(14,3) NOT NULL DEFAULT 0 CHECK(stock_maximo>=0),
  activo boolean NOT NULL DEFAULT true,
  origen text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(producto_id,sucursal_id)
);
-- Only explicit historical evidence. No cross join of products and branches.
WITH evidencia AS (
 SELECT producto_id,sucursal_id FROM lotes
 UNION SELECT producto_id,sucursal_id FROM movimientos_inventario
 UNION SELECT d.producto_id,c.sucursal_id FROM compra_detalles d JOIN compras c ON c.id=d.compra_id
 UNION SELECT d.producto_id,v.sucursal_id FROM venta_detalles d JOIN ventas v ON v.id=d.venta_id
 UNION SELECT producto_id,sucursal_id FROM precios_producto WHERE sucursal_id IS NOT NULL
 UNION SELECT d.producto_id,t.sucursal_origen_id FROM transferencia_detalles d JOIN transferencias t ON t.id=d.transferencia_id
 UNION SELECT d.producto_id,t.sucursal_destino_id FROM transferencia_detalles d JOIN transferencias t ON t.id=d.transferencia_id
)
INSERT INTO producto_sucursal(producto_id,sucursal_id,stock_minimo,stock_maximo,activo,origen)
SELECT e.producto_id,e.sucursal_id,p.stock_minimo,p.stock_maximo,p.activo,'historial'
FROM evidencia e JOIN productos p ON p.id=e.producto_id JOIN sucursales s ON s.id=e.sucursal_id AND s.empresa_id=p.empresa_id
WHERE NOT EXISTS(SELECT 1 FROM eduxfac_migraciones WHERE nombre='catalogo_sucursal_20260925')
ON CONFLICT DO NOTHING;
INSERT INTO eduxfac_migraciones(nombre) VALUES('catalogo_sucursal_20260925') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION vincular_catalogo_lote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM productos p JOIN sucursales s ON s.empresa_id=p.empresa_id WHERE p.id=NEW.producto_id AND s.id=NEW.sucursal_id) THEN
   RAISE EXCEPTION 'Producto y sucursal deben pertenecer a la misma empresa';
 END IF;
 INSERT INTO producto_sucursal(producto_id,sucursal_id,origen)
 VALUES(NEW.producto_id,NEW.sucursal_id,'lote') ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS catalogo_lote ON lotes;
CREATE TRIGGER catalogo_lote BEFORE INSERT OR UPDATE OF producto_id,sucursal_id ON lotes
FOR EACH ROW EXECUTE FUNCTION vincular_catalogo_lote();
COMMIT;
