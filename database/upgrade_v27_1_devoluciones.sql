BEGIN;
ALTER TABLE venta_detalles ADD COLUMN IF NOT EXISTS factor_unidades numeric(14,3) NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS devoluciones_venta(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venta_id uuid NOT NULL REFERENCES ventas(id), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
 tipo varchar(20) NOT NULL CHECK(tipo IN ('PARCIAL','TOTAL')), motivo varchar(240) NOT NULL, metodo_reembolso varchar(30) NOT NULL, monto numeric(14,2) NOT NULL CHECK(monto>0), usuario_id uuid NOT NULL REFERENCES usuarios(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS devolucion_venta_detalles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), devolucion_id uuid NOT NULL REFERENCES devoluciones_venta(id) ON DELETE CASCADE, venta_detalle_id uuid NOT NULL REFERENCES venta_detalles(id), cantidad numeric(14,3) NOT NULL CHECK(cantidad>0), monto numeric(14,2) NOT NULL, UNIQUE(devolucion_id,venta_detalle_id));
CREATE INDEX IF NOT EXISTS idx_devoluciones_venta ON devoluciones_venta(venta_id,created_at);
COMMIT;
