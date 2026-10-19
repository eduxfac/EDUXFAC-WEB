-- BoticaWeb Final - operaciones multi-sucursal, permisos, reportes y producción

CREATE TABLE IF NOT EXISTS permisos (
  id bigserial PRIMARY KEY,
  codigo varchar(80) NOT NULL UNIQUE,
  nombre varchar(120) NOT NULL
);
CREATE TABLE IF NOT EXISTS rol_permisos (
  rol_id bigint NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id bigint NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY(rol_id,permiso_id)
);

INSERT INTO permisos(codigo,nombre) VALUES
('VENTAS','Registrar ventas'),('CAJA','Operar caja'),('INVENTARIO','Consultar inventario'),
('INVENTARIO_AJUSTAR','Ajustar inventario'),('COMPRAS','Registrar compras'),('TRANSFERENCIAS','Transferir stock'),
('REPORTES','Ver reportes'),('MAESTROS','Administrar productos/clientes/proveedores'),
('USUARIOS','Administrar usuarios'),('CONFIGURACION','Modificar configuración')
ON CONFLICT(codigo) DO NOTHING;

INSERT INTO rol_permisos(rol_id,permiso_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permisos p
WHERE r.nombre='Administrador'
ON CONFLICT DO NOTHING;
INSERT INTO rol_permisos(rol_id,permiso_id)
SELECT r.id,p.id FROM roles r JOIN permisos p ON p.codigo IN ('VENTAS','CAJA','INVENTARIO')
WHERE r.nombre IN ('Cajero','Cajero / Vendedor','Vendedor')
ON CONFLICT DO NOTHING;
INSERT INTO rol_permisos(rol_id,permiso_id)
SELECT r.id,p.id FROM roles r JOIN permisos p ON p.codigo IN ('INVENTARIO','INVENTARIO_AJUSTAR','COMPRAS','TRANSFERENCIAS')
WHERE r.nombre='Almacén'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS solicitudes_internas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  sucursal_solicitante_id uuid NOT NULL REFERENCES sucursales(id),
  sucursal_origen_id uuid REFERENCES sucursales(id),
  estado varchar(20) NOT NULL DEFAULT 'PENDIENTE',
  observaciones text,
  usuario_solicita_id uuid REFERENCES usuarios(id),
  usuario_resuelve_id uuid REFERENCES usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS solicitud_interna_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id uuid NOT NULL REFERENCES solicitudes_internas(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES productos(id),
  cantidad numeric(14,3) NOT NULL CHECK(cantidad>0),
  cantidad_atendida numeric(14,3) NOT NULL DEFAULT 0 CHECK(cantidad_atendida>=0)
);

CREATE TABLE IF NOT EXISTS transferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  sucursal_origen_id uuid NOT NULL REFERENCES sucursales(id),
  sucursal_destino_id uuid NOT NULL REFERENCES sucursales(id),
  solicitud_id uuid REFERENCES solicitudes_internas(id),
  estado varchar(20) NOT NULL DEFAULT 'RECIBIDA',
  observaciones text,
  usuario_id uuid REFERENCES usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(sucursal_origen_id<>sucursal_destino_id)
);
CREATE TABLE IF NOT EXISTS transferencia_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transferencia_id uuid NOT NULL REFERENCES transferencias(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES productos(id),
  lote_origen_id uuid REFERENCES lotes(id),
  lote_destino_id uuid REFERENCES lotes(id),
  cantidad numeric(14,3) NOT NULL CHECK(cantidad>0),
  costo_unitario numeric(14,4) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_transferencias_fecha ON transferencias(empresa_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes_internas(empresa_id,estado,created_at DESC);

CREATE TABLE IF NOT EXISTS ajustes_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  sucursal_id uuid NOT NULL REFERENCES sucursales(id),
  producto_id uuid NOT NULL REFERENCES productos(id),
  lote_id uuid REFERENCES lotes(id),
  diferencia numeric(14,3) NOT NULL,
  motivo varchar(180) NOT NULL,
  usuario_id uuid REFERENCES usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS secuencias_documento (
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  sucursal_id uuid NOT NULL REFERENCES sucursales(id),
  tipo varchar(20) NOT NULL,
  serie varchar(20) NOT NULL,
  ultimo_numero bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(empresa_id,sucursal_id,tipo,serie)
);

CREATE INDEX IF NOT EXISTS idx_ventas_empresa_sucursal_fecha ON ventas(empresa_id,sucursal_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_inv_sucursal_fecha ON movimientos_inventario(sucursal_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lotes_sucursal_producto ON lotes(sucursal_id,producto_id);

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS telefono varchar(40);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS direccion varchar(220);
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS telefono varchar(40);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email varchar(120);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE productos ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
