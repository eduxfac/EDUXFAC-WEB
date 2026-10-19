-- BoticaWeb v12: indices de rendimiento para catálogos grandes
create index if not exists idx_productos_empresa_activo_nombre on productos(empresa_id, activo, nombre);
create index if not exists idx_productos_empresa_codigo on productos(empresa_id, codigo_interno);
create index if not exists idx_productos_empresa_codigo_anterior on productos(empresa_id, codigo_anterior) where codigo_anterior is not null;
create index if not exists idx_productos_empresa_barcode on productos(empresa_id, codigo_barras) where codigo_barras is not null;
create index if not exists idx_lotes_sucursal_producto_stock on lotes(sucursal_id, producto_id, cantidad_disponible);
create index if not exists idx_precios_producto_activos on precios_producto(producto_id, sucursal_id) where vigente_hasta is null;
