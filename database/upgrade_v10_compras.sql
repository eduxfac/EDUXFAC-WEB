-- BoticaWeb v10 - compras multiproducto
ALTER TABLE compras ADD COLUMN IF NOT EXISTS tipo_compra varchar(40) DEFAULT 'Mercadería';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS moneda varchar(10) DEFAULT 'PEN';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS observacion text;
ALTER TABLE compra_detalles ADD COLUMN IF NOT EXISTS precio_venta numeric(14,2);
ALTER TABLE compra_detalles ADD COLUMN IF NOT EXISTS igv_pct numeric(5,2) DEFAULT 18;
