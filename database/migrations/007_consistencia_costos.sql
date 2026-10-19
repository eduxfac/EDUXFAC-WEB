-- Candidate only. No UPDATE/backfill of historical business rows.
-- Preserve the dependent view definition/options/grants; never use CASCADE.
DO $costs$
DECLARE view_sql text; view_options text[]; view_owner text; grants text[];
BEGIN
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.lotes'::regclass AND attname='costo_unitario' AND atttypmod<>-1) THEN
  ALTER TABLE lotes ALTER COLUMN costo_unitario TYPE numeric;
 END IF;
 ALTER TABLE lotes ADD COLUMN IF NOT EXISTS valor_base_costos numeric;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.venta_detalles'::regclass AND attname='costo_snapshot' AND atttypmod<>-1) THEN
  IF to_regclass('public.reporte_detalles_netos') IS NOT NULL THEN
   SELECT pg_get_viewdef(c.oid,true),c.reloptions,pg_get_userbyid(c.relowner) INTO view_sql,view_options,view_owner
    FROM pg_class c WHERE c.oid='public.reporte_detalles_netos'::regclass;
   IF view_owner<>current_user THEN RAISE EXCEPTION 'COST_MIGRATION_VIEW_OWNER_REVIEW_REQUIRED'; END IF;
   SELECT array_agg(format('GRANT %s ON public.reporte_detalles_netos TO %s%s',a.privilege_type,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
    CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)) INTO grants
    FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid='public.reporte_detalles_netos'::regclass;
   DROP VIEW public.reporte_detalles_netos;
  END IF;
  ALTER TABLE venta_detalles ALTER COLUMN costo_snapshot TYPE numeric;
  IF view_sql IS NOT NULL THEN
   EXECUTE 'CREATE VIEW public.reporte_detalles_netos '||
    CASE WHEN view_options IS NULL THEN '' ELSE 'WITH ('||array_to_string(view_options,',')||') ' END||'AS '||view_sql;
   IF grants IS NOT NULL THEN
    FOR view_sql IN SELECT unnest(grants) LOOP EXECUTE view_sql; END LOOP;
   END IF;
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname='costo_unitario' AND atttypmod<>-1) THEN
  ALTER TABLE movimientos_inventario ALTER COLUMN costo_unitario TYPE numeric;
 END IF;
END $costs$;
