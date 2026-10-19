-- BoticaWeb v5 - maestros e inventario avanzado
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
ALTER TABLE laboratorios ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_categorias_empresa_nombre ON categorias(empresa_id,lower(nombre));
CREATE INDEX IF NOT EXISTS idx_laboratorios_empresa_nombre ON laboratorios(empresa_id,lower(nombre));
CREATE INDEX IF NOT EXISTS idx_clientes_doc ON clientes(empresa_id,nro_doc);
CREATE INDEX IF NOT EXISTS idx_proveedores_ruc ON proveedores(empresa_id,ruc);
CREATE INDEX IF NOT EXISTS idx_lotes_sucursal_vencimiento ON lotes(sucursal_id,fecha_vencimiento) WHERE cantidad_disponible>0;
CREATE INDEX IF NOT EXISTS idx_lotes_producto_sucursal ON lotes(producto_id,sucursal_id) WHERE cantidad_disponible>0;
