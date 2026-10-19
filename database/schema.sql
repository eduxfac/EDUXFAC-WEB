-- BoticaWeb - esquema PostgreSQL inicial
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruc varchar(11), razon_social varchar(160) NOT NULL,
  nombre_comercial varchar(160), telefono varchar(40), email varchar(120), direccion_fiscal varchar(220), activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
  codigo varchar(20) NOT NULL, nombre varchar(120) NOT NULL, direccion varchar(220), activo boolean DEFAULT true,
  UNIQUE(empresa_id,codigo)
);
CREATE TABLE roles (id bigserial PRIMARY KEY,nombre varchar(60) UNIQUE NOT NULL);
INSERT INTO roles(nombre) VALUES ('Administrador'),('Cajero / Vendedor'),('Almacén') ON CONFLICT (nombre) DO NOTHING;
CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
  nombre varchar(120) NOT NULL, usuario varchar(80) NOT NULL, password_hash text NOT NULL, activo boolean DEFAULT true,
  UNIQUE(empresa_id,usuario)
);
CREATE TABLE usuario_sucursal (
  usuario_id uuid REFERENCES usuarios(id), sucursal_id uuid REFERENCES sucursales(id), rol_id bigint REFERENCES roles(id),
  PRIMARY KEY(usuario_id,sucursal_id)
);
CREATE TABLE categorias (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL REFERENCES empresas(id),nombre varchar(100) NOT NULL);
CREATE TABLE laboratorios (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),empresa_id uuid NOT NULL REFERENCES empresas(id),nombre varchar(120) NOT NULL);
CREATE TABLE productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id),
  codigo_interno varchar(40) NOT NULL, codigo_anterior varchar(80), codigo_barras varchar(80), nombre varchar(180) NOT NULL,
  principio_activo varchar(180), concentracion varchar(80), presentacion varchar(120), unidad_medida varchar(40),
  categoria_id uuid REFERENCES categorias(id), laboratorio_id uuid REFERENCES laboratorios(id),
  stock_minimo numeric(14,3) NOT NULL DEFAULT 0, stock_maximo numeric(14,3) NOT NULL DEFAULT 0,
  tipo_afectacion_igv varchar(160), favorito boolean NOT NULL DEFAULT false,
  precio_venta_dolares numeric(14,4) NOT NULL DEFAULT 0, recargo_propina numeric(8,4) NOT NULL DEFAULT 0,
  requiere_lote boolean NOT NULL DEFAULT true,
  activo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id,codigo_interno)
);
CREATE INDEX idx_productos_nombre ON productos(nombre);
CREATE INDEX idx_productos_barra ON productos(codigo_barras);
CREATE UNIQUE INDEX uq_productos_empresa_codigo_interno_normalizado ON productos(empresa_id,btrim(codigo_interno));
CREATE UNIQUE INDEX uq_productos_empresa_barcode_normalizado ON productos(empresa_id,btrim(codigo_barras)) WHERE nullif(btrim(coalesce(codigo_barras,'')),'') IS NOT NULL;
CREATE UNIQUE INDEX uq_productos_empresa_nombre_normalizado ON productos(empresa_id,lower(regexp_replace(btrim(nombre),'\s+',' ','g')));
CREATE UNIQUE INDEX uq_productos_empresa_codigo_anterior ON productos(empresa_id,codigo_anterior) WHERE codigo_anterior IS NOT NULL AND btrim(codigo_anterior)<>'';
CREATE TABLE precios_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), producto_id uuid NOT NULL REFERENCES productos(id), sucursal_id uuid REFERENCES sucursales(id),
  tipo varchar(40) NOT NULL DEFAULT 'unidad', factor_unidades numeric(12,3) NOT NULL DEFAULT 1,
  precio_venta numeric(14,2) NOT NULL CHECK(precio_venta>=0), vigente_desde timestamptz NOT NULL DEFAULT now(), vigente_hasta timestamptz
);
CREATE TABLE proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), ruc varchar(11),
  razon_social varchar(180) NOT NULL, contacto varchar(160), telefono varchar(40), email varchar(120), direccion varchar(220), activo boolean DEFAULT true
);
CREATE TABLE clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), tipo_doc varchar(10), nro_doc varchar(20),
  nombres varchar(180), telefono varchar(40), email varchar(120), direccion varchar(220), activo boolean DEFAULT true
);
CREATE TABLE compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
  proveedor_id uuid REFERENCES proveedores(id), tipo_documento varchar(20), serie varchar(20), numero varchar(40), fecha date NOT NULL,
  tipo_compra varchar(40) DEFAULT 'Mercadería', moneda varchar(10) DEFAULT 'PEN', observacion text,
  total numeric(14,2) NOT NULL DEFAULT 0, usuario_id uuid REFERENCES usuarios(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE compra_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), compra_id uuid NOT NULL REFERENCES compras(id), producto_id uuid NOT NULL REFERENCES productos(id),
  cantidad numeric(14,3) NOT NULL CHECK(cantidad>0), costo_unitario numeric(14,4) NOT NULL CHECK(costo_unitario>=0),
  numero_lote varchar(80), fecha_vencimiento date, precio_venta numeric(14,2), igv_pct numeric(5,2) DEFAULT 18, total numeric(14,2) NOT NULL
);
CREATE TABLE lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), producto_id uuid NOT NULL REFERENCES productos(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
  numero_lote varchar(80) NOT NULL, fecha_vencimiento date, costo_unitario numeric NOT NULL DEFAULT 0,
  valor_base_costos numeric,
  cantidad_inicial numeric(14,3) NOT NULL DEFAULT 0, cantidad_disponible numeric(14,3) NOT NULL DEFAULT 0,
  compra_detalle_id uuid REFERENCES compra_detalles(id), UNIQUE(producto_id,sucursal_id,numero_lote)
);
CREATE INDEX idx_lotes_vencimiento ON lotes(fecha_vencimiento);
CREATE TABLE cajas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sucursal_id uuid NOT NULL REFERENCES sucursales(id),nombre varchar(80) NOT NULL,activo boolean DEFAULT true);
CREATE TABLE sesiones_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), caja_id uuid NOT NULL REFERENCES cajas(id), usuario_id uuid NOT NULL REFERENCES usuarios(id),
  abierto_en timestamptz NOT NULL DEFAULT now(), monto_apertura numeric(14,2) NOT NULL DEFAULT 0, cerrado_en timestamptz,
  efectivo_esperado numeric(14,2), efectivo_contado numeric(14,2), diferencia numeric(14,2), estado varchar(20) NOT NULL DEFAULT 'ABIERTA'
);
CREATE TABLE ventas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
  sesion_caja_id uuid REFERENCES sesiones_caja(id), cliente_id uuid REFERENCES clientes(id), tipo_comprobante varchar(20) DEFAULT 'BOLETA',
  serie varchar(20), numero varchar(30), subtotal numeric(14,2) NOT NULL, descuento numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL, estado varchar(20) NOT NULL DEFAULT 'EMITIDA', usuario_id uuid NOT NULL REFERENCES usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ventas_fecha ON ventas(created_at);
CREATE TABLE venta_detalles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venta_id uuid NOT NULL REFERENCES ventas(id), producto_id uuid NOT NULL REFERENCES productos(id),
  lote_id uuid REFERENCES lotes(id), cantidad numeric(14,3) NOT NULL CHECK(cantidad>0), precio_unitario numeric(14,2) NOT NULL,
  descuento numeric(14,2) NOT NULL DEFAULT 0, costo_snapshot numeric NOT NULL DEFAULT 0, total numeric(14,2) NOT NULL
);
CREATE TABLE venta_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venta_id uuid NOT NULL REFERENCES ventas(id), metodo varchar(30) NOT NULL,
  monto numeric(14,2) NOT NULL CHECK(monto>0), referencia varchar(120)
);
CREATE TABLE movimientos_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES empresas(id), sucursal_id uuid NOT NULL REFERENCES sucursales(id),
  producto_id uuid NOT NULL REFERENCES productos(id), lote_id uuid REFERENCES lotes(id), tipo varchar(30) NOT NULL,
  cantidad numeric(14,3) NOT NULL, costo_unitario numeric, referencia_tipo varchar(30), referencia_id uuid,
  usuario_id uuid REFERENCES usuarios(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mov_inv_producto_fecha ON movimientos_inventario(producto_id,created_at);
CREATE TABLE movimientos_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sesion_caja_id uuid NOT NULL REFERENCES sesiones_caja(id),
  tipo varchar(20) NOT NULL, concepto varchar(180) NOT NULL, metodo varchar(30) NOT NULL DEFAULT 'Efectivo',
  monto numeric(14,2) NOT NULL CHECK(monto>0), usuario_id uuid REFERENCES usuarios(id), created_at timestamptz NOT NULL DEFAULT now()
);

-- Soporte de migración desde sistemas legados (Microsoft Access)
CREATE TABLE IF NOT EXISTS legacy_mappings (
  id bigserial PRIMARY KEY,
  source_system varchar(40) NOT NULL DEFAULT 'CBDFARMACIA',
  source_table varchar(80) NOT NULL,
  source_id varchar(160) NOT NULL,
  target_table varchar(80) NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_system, source_table, source_id, target_table)
);

CREATE TABLE IF NOT EXISTS legacy_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system varchar(40) NOT NULL DEFAULT 'CBDFARMACIA',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status varchar(20) NOT NULL DEFAULT 'RUNNING',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text
);


-- Configuración general y trazabilidad
CREATE TABLE IF NOT EXISTS empresa_config (
  empresa_id uuid PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  moneda varchar(3) NOT NULL DEFAULT 'PEN',
  impresion_ancho_mm integer NOT NULL DEFAULT 80 CHECK(impresion_ancho_mm IN (58,80,210)),
  mensaje_ticket varchar(240) NOT NULL DEFAULT 'Gracias por su compra',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auditoria (
  id bigserial PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  usuario_id uuid REFERENCES usuarios(id),
  accion varchar(60) NOT NULL,
  entidad varchar(80) NOT NULL,
  entidad_id uuid,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa_fecha ON auditoria(empresa_id,created_at DESC);
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
