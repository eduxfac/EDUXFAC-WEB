-- Puente aditivo para el esquema F15 existente. No sustituye su motor ni sus datos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(20261104,4401);
CREATE TABLE IF NOT EXISTS public.sunat_sucursales (
 empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 sucursal_id uuid PRIMARY KEY REFERENCES public.sucursales(id),
 ambiente text NOT NULL CHECK(ambiente IN ('beta','produccion')),
 habilitado boolean NOT NULL DEFAULT false,
 serie_factura text NOT NULL DEFAULT 'F001', serie_boleta text NOT NULL DEFAULT 'B001',
 fiscal_json jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 envio_automatico boolean NOT NULL DEFAULT false,
 series_notas jsonb NOT NULL DEFAULT '{"07F":"FC01","07B":"BC01","08F":"FD01","08B":"BD01"}',
 comprobantes_habilitados jsonb NOT NULL DEFAULT '[]',
 envio_modo text CHECK(envio_modo IN ('inmediato','programado','manual')),
 envio_hora time NOT NULL DEFAULT '23:00',
 FOREIGN KEY(empresa_id,sucursal_id) REFERENCES public.sucursales(empresa_id,id)
);
CREATE TABLE IF NOT EXISTS public.sunat_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 sucursal_id uuid NOT NULL REFERENCES public.sucursales(id), venta_id uuid NOT NULL REFERENCES public.ventas(id),
 payload_json jsonb NOT NULL, documento_id uuid, estado text NOT NULL DEFAULT 'PENDIENTE',
 intentos integer NOT NULL DEFAULT 0, error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(empresa_id,venta_id),
 FOREIGN KEY(empresa_id,sucursal_id,venta_id) REFERENCES public.ventas(empresa_id,sucursal_id,id)
);
CREATE INDEX IF NOT EXISTS sunat_outbox_empresa ON public.sunat_outbox(empresa_id,sucursal_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.venta_checkout_comandos (
 empresa_id uuid NOT NULL REFERENCES public.empresas(id), command_id uuid NOT NULL,
 sucursal_id uuid NOT NULL REFERENCES public.sucursales(id), venta_id uuid NOT NULL REFERENCES public.ventas(id),
 request_hash char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(empresa_id,command_id),
 FOREIGN KEY(empresa_id,sucursal_id,venta_id) REFERENCES public.ventas(empresa_id,sucursal_id,id)
);
DO $body$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['sunat_sucursales','sunat_outbox','venta_checkout_comandos'] LOOP
  EXECUTE format('ALTER TABLE public.%I OWNER TO eduxfac_web_migrator',t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='f10_migrator') THEN
   EXECUTE format('CREATE POLICY f10_migrator ON public.%I TO eduxfac_web_migrator USING(true) WITH CHECK(true)',t);
   EXECUTE format('CREATE POLICY f10_backup ON public.%I FOR SELECT TO eduxfac_backup USING(true)',t);
   EXECUTE format($sql$CREATE POLICY f10_tenant ON public.%I TO eduxfac_web_app
    USING(empresa_id=nullif(current_setting('app.empresa_id',true),'')::uuid
      AND sucursal_id=ANY(string_to_array(coalesce(current_setting('app.sucursal_ids',true),''),',')::uuid[]))
    WITH CHECK(empresa_id=nullif(current_setting('app.empresa_id',true),'')::uuid
      AND sucursal_id=ANY(string_to_array(coalesce(current_setting('app.sucursal_ids',true),''),',')::uuid[]))$sql$,t);
  END IF;
  EXECUTE format('GRANT SELECT ON public.%I TO eduxfac_backup',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['sunat_sucursales','sunat_outbox'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='f10_service') THEN
   EXECUTE format('CREATE POLICY f10_service ON public.%I TO eduxfac_web_service USING(true) WITH CHECK(true)',t);
  END IF;
 END LOOP;
END $body$;
GRANT SELECT ON public.sunat_sucursales TO eduxfac_web_app;
GRANT UPDATE(envio_modo,envio_hora,envio_automatico,updated_at) ON public.sunat_sucursales TO eduxfac_web_app;
GRANT SELECT,INSERT,UPDATE ON public.sunat_outbox TO eduxfac_web_app;
GRANT SELECT,INSERT ON public.venta_checkout_comandos TO eduxfac_web_app;
GRANT SELECT,INSERT,UPDATE ON public.sunat_sucursales,public.sunat_outbox TO eduxfac_web_service;
-- El programador puede leer la venta y asignar el número fiscal; no modificar stock ni importes.
GRANT SELECT ON public.ventas TO eduxfac_web_service;
GRANT UPDATE(serie,numero) ON public.ventas TO eduxfac_web_service;
DO $body$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ventas' AND policyname='greenter_service_read') THEN
  CREATE POLICY greenter_service_read ON public.ventas FOR SELECT TO eduxfac_web_service USING(true);
  CREATE POLICY greenter_service_number ON public.ventas FOR UPDATE TO eduxfac_web_service USING(true) WITH CHECK(true);
 END IF;
END $body$;
INSERT INTO public.web_schema_migrations(version) VALUES('20261104_greenter_bridge_f15') ON CONFLICT DO NOTHING;
COMMIT;
