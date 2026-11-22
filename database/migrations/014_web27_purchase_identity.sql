BEGIN;
-- A documentary registry preserves every legacy purchase, including previously duplicated documents.
-- The first historical purchase owns each document identity; subsequent INSERTs are rejected by the trigger.
CREATE TABLE IF NOT EXISTS compra_documentos_unicos (
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  proveedor_id uuid NOT NULL REFERENCES proveedores(id),
  tipo_documento text NOT NULL,
  serie text NOT NULL,
  numero text NOT NULL,
  compra_id uuid NOT NULL REFERENCES compras(id) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY(empresa_id,proveedor_id,tipo_documento,serie,numero)
);
LOCK TABLE compras IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO compra_documentos_unicos(empresa_id,proveedor_id,tipo_documento,serie,numero,compra_id)
SELECT DISTINCT ON (empresa_id,proveedor_id,upper(btrim(tipo_documento)),upper(btrim(serie)),upper(btrim(numero)))
 empresa_id,proveedor_id,upper(btrim(tipo_documento)),upper(btrim(serie)),upper(btrim(numero)),id
 FROM compras WHERE proveedor_id IS NOT NULL AND nullif(btrim(tipo_documento),'') IS NOT NULL
 AND nullif(btrim(serie),'') IS NOT NULL AND nullif(btrim(numero),'') IS NOT NULL
 ORDER BY empresa_id,proveedor_id,upper(btrim(tipo_documento)),upper(btrim(serie)),upper(btrim(numero)),created_at,id
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION proteger_documento_compra() RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE document_owner uuid;
BEGIN
 IF NEW.proveedor_id IS NULL OR nullif(btrim(NEW.tipo_documento),'') IS NULL OR nullif(btrim(NEW.serie),'') IS NULL OR nullif(btrim(NEW.numero),'') IS NULL THEN
   IF TG_OP='UPDATE' THEN DELETE FROM compra_documentos_unicos WHERE compra_id=OLD.id; END IF;
   RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN
   IF (NEW.empresa_id,NEW.proveedor_id,upper(btrim(NEW.tipo_documento)),upper(btrim(NEW.serie)),upper(btrim(NEW.numero))) IS NOT DISTINCT FROM
      (OLD.empresa_id,OLD.proveedor_id,upper(btrim(OLD.tipo_documento)),upper(btrim(OLD.serie)),upper(btrim(OLD.numero))) THEN RETURN NEW; END IF;
   DELETE FROM compra_documentos_unicos WHERE compra_id=OLD.id;
 END IF;
 INSERT INTO compra_documentos_unicos(empresa_id,proveedor_id,tipo_documento,serie,numero,compra_id)
 VALUES(NEW.empresa_id,NEW.proveedor_id,upper(btrim(NEW.tipo_documento)),upper(btrim(NEW.serie)),upper(btrim(NEW.numero)),NEW.id)
 ON CONFLICT(empresa_id,proveedor_id,tipo_documento,serie,numero)
 DO UPDATE SET compra_id=compra_documentos_unicos.compra_id
 RETURNING compra_id INTO document_owner;
 IF document_owner IS DISTINCT FROM NEW.id THEN
   RAISE EXCEPTION 'Ya existe una compra con el mismo proveedor, documento, serie y número.' USING ERRCODE='23505',CONSTRAINT='uq_compra_documento';
 END IF;
 RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trg_compra_documento_unico ON compras;
CREATE TRIGGER trg_compra_documento_unico AFTER INSERT OR UPDATE OF empresa_id,proveedor_id,tipo_documento,serie,numero ON compras FOR EACH ROW EXECUTE FUNCTION proteger_documento_compra();

-- Flush deferred historical references before changing table security metadata.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE compra_documentos_unicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_documentos_unicos FORCE ROW LEVEL SECURITY;
DO $owner$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='compra_documentos_unicos' AND policyname='f10_migrator') THEN CREATE POLICY f10_migrator ON compra_documentos_unicos TO CURRENT_USER USING(true) WITH CHECK(true); END IF; END $owner$;
DO $policy$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='eduxfac_web_app') AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='compra_documentos_unicos' AND policyname='f10_tenant') THEN
  CREATE POLICY f10_tenant ON compra_documentos_unicos TO eduxfac_web_app USING(empresa_id=nullif(current_setting('app.empresa_id',true),'')::uuid AND EXISTS(SELECT 1 FROM compras parent WHERE parent.id=compra_documentos_unicos.compra_id AND parent.empresa_id=compra_documentos_unicos.empresa_id AND parent.sucursal_id=ANY(string_to_array(coalesce(current_setting('app.sucursal_ids',true),''),',')::uuid[]))) WITH CHECK(empresa_id=nullif(current_setting('app.empresa_id',true),'')::uuid AND EXISTS(SELECT 1 FROM compras parent WHERE parent.id=compra_documentos_unicos.compra_id AND parent.empresa_id=compra_documentos_unicos.empresa_id AND parent.sucursal_id=ANY(string_to_array(coalesce(current_setting('app.sucursal_ids',true),''),',')::uuid[])));
  GRANT SELECT,INSERT,UPDATE,DELETE ON compra_documentos_unicos TO eduxfac_web_app;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='eduxfac_web_migrator') AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='compra_documentos_unicos' AND policyname='f10_migrator') THEN
  CREATE POLICY f10_migrator ON compra_documentos_unicos TO eduxfac_web_migrator USING(true) WITH CHECK(true);
  ALTER TABLE compra_documentos_unicos OWNER TO eduxfac_web_migrator;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='eduxfac_backup') AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='compra_documentos_unicos' AND policyname='f10_backup') THEN
  CREATE POLICY f10_backup ON compra_documentos_unicos FOR SELECT TO eduxfac_backup USING(true);
  GRANT SELECT ON compra_documentos_unicos TO eduxfac_backup;
 END IF;
END $policy$;
COMMIT;
