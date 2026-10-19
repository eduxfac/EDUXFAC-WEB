-- BoticaWeb v9 - datos ampliados de proveedores
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS contacto varchar(160);
