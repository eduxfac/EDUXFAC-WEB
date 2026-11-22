-- LAB BLOQUE 3: traceable initial inventory, no commercial purchase tables are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS inventario_inicial_importaciones (
 id uuid PRIMARY KEY,
 empresa_id uuid NOT NULL REFERENCES empresas(id),
 sucursal_id uuid NOT NULL REFERENCES sucursales(id),
 usuario_id uuid NOT NULL REFERENCES usuarios(id),
 archivo_nombre varchar(240) NOT NULL,
 archivo_sha256 varchar(64) NOT NULL,
 contenido_sha256 varchar(64) NOT NULL,
 filas integer NOT NULL CHECK(filas>0),
 productos integer NOT NULL CHECK(productos>0),
 lotes integer NOT NULL CHECK(lotes>0),
 unidades numeric(24,3) NOT NULL CHECK(unidades>=0),
 valor numeric(24,2) NOT NULL CHECK(valor>=0),
 resumen jsonb NOT NULL,
 detalle jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(empresa_id,sucursal_id,archivo_sha256),
 UNIQUE(empresa_id,sucursal_id,contenido_sha256)
);
CREATE INDEX IF NOT EXISTS idx_b3_importaciones_fecha ON inventario_inicial_importaciones(empresa_id,sucursal_id,created_at DESC);

ALTER TABLE inventario_inicial_importaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_inicial_importaciones FORCE ROW LEVEL SECURITY;
DO $owner$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='inventario_inicial_importaciones' AND policyname='f10_migrator') THEN CREATE POLICY f10_migrator ON inventario_inicial_importaciones TO CURRENT_USER USING(true) WITH CHECK(true); END IF; END $owner$;
DO $policy$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='eduxfac_web_app') AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='inventario_inicial_importaciones' AND policyname='f10_tenant') THEN
  CREATE POLICY f10_tenant ON inventario_inicial_importaciones TO eduxfac_web_app USING(empresa_id=nullif(current_setting('app.empresa_id',true),'')::uuid AND sucursal_id=ANY(string_to_array(coalesce(current_setting('app.sucursal_ids',true),''),',')::uuid[])) WITH CHECK(empresa_id=nullif(current_setting('app.empresa_id',true),'')::uuid AND sucursal_id=ANY(string_to_array(coalesce(current_setting('app.sucursal_ids',true),''),',')::uuid[]));
  GRANT SELECT,INSERT,UPDATE,DELETE ON inventario_inicial_importaciones TO eduxfac_web_app;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='eduxfac_web_migrator') AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='inventario_inicial_importaciones' AND policyname='f10_migrator') THEN
  CREATE POLICY f10_migrator ON inventario_inicial_importaciones TO eduxfac_web_migrator USING(true) WITH CHECK(true);
  ALTER TABLE inventario_inicial_importaciones OWNER TO eduxfac_web_migrator;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='eduxfac_backup') AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='inventario_inicial_importaciones' AND policyname='f10_backup') THEN
  CREATE POLICY f10_backup ON inventario_inicial_importaciones FOR SELECT TO eduxfac_backup USING(true);
  GRANT SELECT ON inventario_inicial_importaciones TO eduxfac_backup;
 END IF;
END $policy$;

COMMIT;
