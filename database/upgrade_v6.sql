-- BoticaWeb v6 - compras y reposición inteligente
CREATE TABLE IF NOT EXISTS ordenes_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  sucursal_id uuid NOT NULL REFERENCES sucursales(id),
  proveedor_id uuid REFERENCES proveedores(id),
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR',
  fecha date NOT NULL DEFAULT current_date,
  observaciones text,
  total_estimado numeric(14,2) NOT NULL DEFAULT 0,
  usuario_id uuid REFERENCES usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orden_compra_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_compra_id uuid NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES productos(id),
  cantidad numeric(14,3) NOT NULL CHECK(cantidad>0),
  costo_referencia numeric(14,4) NOT NULL DEFAULT 0,
  total_estimado numeric(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oc_empresa_fecha ON ordenes_compra(empresa_id,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_oc_sucursal_estado ON ordenes_compra(sucursal_id,estado);
CREATE INDEX IF NOT EXISTS idx_compra_det_producto ON compra_detalles(producto_id);
CREATE INDEX IF NOT EXISTS idx_compra_proveedor_fecha ON compras(proveedor_id,fecha DESC);
