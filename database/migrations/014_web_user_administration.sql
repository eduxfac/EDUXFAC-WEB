-- Explicit candidate installation, authorized migrator only; PG16 compatible.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['eduxfac_user_admin_owner','eduxfac_user_admin','eduxfac_user_authorizer'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=n) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT',n);EXECUTE format('COMMENT ON ROLE %I IS %L',n,'EDUXFAC_USER_ADMIN_V2');END IF;
  IF (SELECT pg_catalog.shobj_description(oid,'pg_authid') FROM pg_catalog.pg_roles WHERE rolname=n) IS DISTINCT FROM 'EDUXFAC_USER_ADMIN_V2' THEN RAISE EXCEPTION 'Adapter role name collision';END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=n AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit)) OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=n)) THEN RAISE EXCEPTION 'Unsafe adapter role';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='eduxfac_user_admin_owner' AND rolcanlogin) THEN RAISE EXCEPTION 'Owner must not login';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace='public'::regnamespace AND relowner IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN ('eduxfac_user_admin','eduxfac_user_authorizer','eduxfac_user_admin_owner'))) THEN RAISE EXCEPTION 'Adapter roles must not own public tables';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid IN ('public.empresas'::regclass,'public.usuarios'::regclass,'public.empresa_acceso'::regclass,'public.sucursales'::regclass,'public.usuario_sucursal'::regclass) AND (NOT relrowsecurity OR NOT relforcerowsecurity)) THEN RAISE EXCEPTION 'Existing tenant RLS required';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.web_schema_migrations WHERE version='014_web_user_administration') AND (EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='eduxfac_user_private') OR pg_catalog.to_regclass('public.web_user_admin_events') IS NOT NULL) THEN RAISE EXCEPTION 'Adapter object name collision';END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='eduxfac_user_private' AND nspowner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='eduxfac_user_admin_owner')) THEN RAISE EXCEPTION 'Unsafe private schema owner';END IF;
END $$;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS password_version integer NOT NULL DEFAULT 0 CHECK(password_version>=0);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.usuarios'::regclass AND attname='password_version' AND atttypid='integer'::regtype AND attnotnull AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attrdef d JOIN pg_catalog.pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE d.adrelid='public.usuarios'::regclass AND a.attname='password_version' AND pg_catalog.pg_get_expr(d.adbin,d.adrelid)='0') THEN RAISE EXCEPTION 'Incompatible password version';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.usuarios'::regclass AND contype='c' AND pg_catalog.pg_get_constraintdef(oid)='CHECK ((password_version >= 0))') THEN RAISE EXCEPTION 'Missing password version constraint';END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS eduxfac_user_private AUTHORIZATION eduxfac_user_admin_owner;
REVOKE ALL ON SCHEMA eduxfac_user_private FROM PUBLIC,eduxfac_user_admin,eduxfac_user_authorizer;
GRANT USAGE ON SCHEMA public TO eduxfac_user_admin,eduxfac_user_authorizer,eduxfac_user_admin_owner;
CREATE TABLE IF NOT EXISTS eduxfac_user_private.authorizations(ticket_hash bytea PRIMARY KEY,empresa_id uuid NOT NULL,user_id uuid,actor text NOT NULL,request_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN ('LIST','RESET')),ip inet,expires_at timestamptz NOT NULL,backend_pid integer,transaction_id bigint,consumed boolean NOT NULL DEFAULT false,UNIQUE(backend_pid,transaction_id),CHECK(operation='LIST' OR user_id IS NOT NULL));
ALTER TABLE eduxfac_user_private.authorizations OWNER TO eduxfac_user_admin_owner;
REVOKE ALL ON eduxfac_user_private.authorizations FROM PUBLIC,eduxfac_user_admin,eduxfac_user_authorizer;
CREATE TABLE IF NOT EXISTS public.web_user_admin_events(request_id uuid PRIMARY KEY,empresa_id uuid NOT NULL REFERENCES public.empresas(id),usuario_id uuid NOT NULL REFERENCES public.usuarios(id),actor text NOT NULL,accion text NOT NULL CHECK(accion='PASSWORD_RESET'),ip inet,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.web_user_admin_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_user_admin_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_user_admin_events FROM PUBLIC,eduxfac_user_admin,eduxfac_user_authorizer;

CREATE OR REPLACE FUNCTION public.authorize_web_user_operation(p_ticket text,p_empresa uuid,p_user uuid,p_actor text,p_request uuid,p_operation text,p_ip inet DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ BEGIN
 IF session_user<>'eduxfac_user_authorizer' OR p_ticket IS NULL OR p_ticket!~'^[a-f0-9]{64}$' OR p_empresa IS NULL OR p_request IS NULL OR p_actor IS NULL OR p_actor!~'^[-A-Za-z0-9._]{3,40}$' OR p_operation IS NULL OR p_operation NOT IN ('LIST','RESET') OR (p_operation='RESET' AND p_user IS NULL) OR (p_operation='LIST' AND p_user IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Operation not authorized';END IF;
 INSERT INTO eduxfac_user_private.authorizations(ticket_hash,empresa_id,user_id,actor,request_id,operation,ip,expires_at) VALUES(pg_catalog.sha256(pg_catalog.convert_to(p_ticket,'UTF8')),p_empresa,p_user,p_actor,p_request,p_operation,p_ip,pg_catalog.clock_timestamp()+interval '60 seconds');
END $$;
ALTER FUNCTION public.authorize_web_user_operation(text,uuid,uuid,text,uuid,text,inet) OWNER TO eduxfac_user_admin_owner;

CREATE OR REPLACE FUNCTION public.activate_web_user_context(p_ticket text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ DECLARE c eduxfac_user_private.authorizations%ROWTYPE;BEGIN
 IF session_user<>'eduxfac_user_admin' OR p_ticket IS NULL OR p_ticket!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Context not authorized';END IF;
 SELECT * INTO c FROM eduxfac_user_private.authorizations WHERE ticket_hash=pg_catalog.sha256(pg_catalog.convert_to(p_ticket,'UTF8')) FOR UPDATE;
 IF NOT FOUND OR c.consumed OR c.expires_at<=pg_catalog.clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Context not authorized';END IF;
 UPDATE eduxfac_user_private.authorizations SET consumed=true,backend_pid=pg_catalog.pg_backend_pid(),transaction_id=pg_catalog.txid_current() WHERE ticket_hash=c.ticket_hash;
 PERFORM pg_catalog.set_config('app.empresa_id',c.empresa_id::text,true),pg_catalog.set_config('app.user_admin_target',coalesce(c.user_id::text,''),true),pg_catalog.set_config('app.user_admin_actor',c.actor,true),pg_catalog.set_config('app.user_admin_request',c.request_id::text,true);
END $$;
ALTER FUNCTION public.activate_web_user_context(text) OWNER TO eduxfac_user_admin_owner;

CREATE OR REPLACE FUNCTION public.web_user_context()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ DECLARE c eduxfac_user_private.authorizations%ROWTYPE;BEGIN
 SELECT * INTO c FROM eduxfac_user_private.authorizations WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current() AND consumed;
 IF session_user<>'eduxfac_user_admin' OR NOT FOUND OR c.expires_at<=pg_catalog.clock_timestamp() OR pg_catalog.current_setting('app.empresa_id',true) IS DISTINCT FROM c.empresa_id::text OR pg_catalog.current_setting('app.user_admin_target',true) IS DISTINCT FROM coalesce(c.user_id::text,'') OR pg_catalog.current_setting('app.user_admin_actor',true) IS DISTINCT FROM c.actor OR pg_catalog.current_setting('app.user_admin_request',true) IS DISTINCT FROM c.request_id::text THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Context not authorized';END IF;
 RETURN pg_catalog.to_jsonb(c)-'ticket_hash'-'expires_at'-'backend_pid'-'transaction_id'-'consumed';
END $$;
ALTER FUNCTION public.web_user_context() OWNER TO eduxfac_user_admin_owner;

REVOKE ALL ON public.empresas,public.empresa_acceso,public.usuarios,public.sucursales,public.usuario_sucursal,public.roles FROM eduxfac_user_admin,eduxfac_user_authorizer,eduxfac_user_admin_owner;
-- Table REVOKE does not remove column ACLs left by an earlier installation.
DO $$ DECLARE t text;cols text;BEGIN
 FOREACH t IN ARRAY ARRAY['empresas','empresa_acceso','usuarios','sucursales','usuario_sucursal','roles','web_user_admin_events'] LOOP
  SELECT string_agg(format('%I',attname),',') INTO cols FROM pg_catalog.pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL (%s) ON public.%I FROM eduxfac_user_admin,eduxfac_user_authorizer,eduxfac_user_admin_owner',cols,t);
 END LOOP;
END $$;
GRANT SELECT(id,activo) ON public.empresas TO eduxfac_user_admin,eduxfac_user_admin_owner;
GRANT SELECT(empresa_id,estado,fecha_inicio,fecha_vencimiento,auth_version,suscripcion_requerida,suscripcion_id,estado_suscripcion) ON public.empresa_acceso TO eduxfac_user_admin;
GRANT SELECT(id,empresa_id,usuario,nombre,activo,debe_cambiar_password,password_version) ON public.usuarios TO eduxfac_user_admin,eduxfac_user_admin_owner;
GRANT SELECT(id,empresa_id,nombre,activo) ON public.sucursales TO eduxfac_user_admin;
GRANT SELECT(usuario_id,sucursal_id,rol_id) ON public.usuario_sucursal TO eduxfac_user_admin;
GRANT SELECT(id,nombre) ON public.roles TO eduxfac_user_admin;
GRANT UPDATE(password_hash,debe_cambiar_password,password_version) ON public.usuarios TO eduxfac_user_admin_owner;
GRANT INSERT(request_id,empresa_id,usuario_id,actor,accion,ip) ON public.web_user_admin_events TO eduxfac_user_admin_owner;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['usuarios','empresas','empresa_acceso','sucursales','usuario_sucursal','web_user_admin_events'] LOOP
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_class c,LATERAL pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a WHERE c.oid=('public.'||t)::regclass AND a.grantee=0) THEN RAISE EXCEPTION 'Unexpected PUBLIC privilege';END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_attribute att,LATERAL pg_catalog.aclexplode(att.attacl) a WHERE att.attrelid=('public.'||t)::regclass AND a.grantee=0) THEN RAISE EXCEPTION 'Unexpected PUBLIC column privilege';END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=('public.'||t)::regclass AND 0=ANY(polroles)) THEN RAISE EXCEPTION 'Unexpected PUBLIC RLS policy';END IF;
 END LOOP;
END $$;
-- These names are exclusive to this package. Existing policies are untouched.
DO $$ DECLARE t text;e text;BEGIN
 FOREACH t IN ARRAY ARRAY['empresas','usuarios','empresa_acceso','sucursales','usuario_sucursal'] LOOP
  e:=CASE WHEN t='empresas' THEN 'id=(public.web_user_context()->>''empresa_id'')::uuid' WHEN t='usuario_sucursal' THEN 'EXISTS(SELECT 1 FROM public.usuarios u JOIN public.sucursales s ON s.id=sucursal_id AND s.empresa_id=u.empresa_id WHERE u.id=usuario_id)' ELSE 'empresa_id=(public.web_user_context()->>''empresa_id'')::uuid' END;
  EXECUTE format('DROP POLICY IF EXISTS user_admin_read ON public.%I',t);
  EXECUTE format('CREATE POLICY user_admin_read ON public.%I FOR SELECT TO eduxfac_user_admin%s USING(%s)',t,CASE WHEN t IN ('empresas','usuarios') THEN ',eduxfac_user_admin_owner' ELSE '' END,e);
 END LOOP;
END $$;
DROP POLICY IF EXISTS user_admin_reset ON public.usuarios;
CREATE POLICY user_admin_reset ON public.usuarios FOR UPDATE TO eduxfac_user_admin_owner USING(empresa_id=(public.web_user_context()->>'empresa_id')::uuid AND id=(public.web_user_context()->>'user_id')::uuid AND public.web_user_context()->>'operation'='RESET') WITH CHECK(empresa_id=(public.web_user_context()->>'empresa_id')::uuid AND id=(public.web_user_context()->>'user_id')::uuid);
DROP POLICY IF EXISTS user_admin_event ON public.web_user_admin_events;
CREATE POLICY user_admin_event ON public.web_user_admin_events FOR INSERT TO eduxfac_user_admin_owner WITH CHECK(accion='PASSWORD_RESET' AND empresa_id=(public.web_user_context()->>'empresa_id')::uuid AND usuario_id=(public.web_user_context()->>'user_id')::uuid AND actor=public.web_user_context()->>'actor' AND request_id=(public.web_user_context()->>'request_id')::uuid AND ip IS NOT DISTINCT FROM (public.web_user_context()->>'ip')::inet AND public.web_user_context()->>'operation'='RESET' AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=usuario_id AND u.empresa_id=web_user_admin_events.empresa_id));

CREATE OR REPLACE FUNCTION public.admin_reset_web_user_password(p_empresa uuid,p_user uuid,p_hash text,p_actor text,p_request uuid)
RETURNS TABLE(user_id uuid,usuario text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ DECLARE c jsonb;u record;BEGIN
 c:=public.web_user_context();
 IF c->>'operation'<>'RESET' OR p_empresa IS DISTINCT FROM (c->>'empresa_id')::uuid OR p_user IS DISTINCT FROM (c->>'user_id')::uuid OR p_actor IS DISTINCT FROM c->>'actor' OR p_request IS DISTINCT FROM (c->>'request_id')::uuid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Operation not authorized';END IF;
 IF p_hash IS NULL OR p_hash!~'^\$2[aby]\$12\$[./A-Za-z0-9]{53}$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid credential encoding';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.empresas e WHERE e.id=p_empresa) THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Target unavailable';END IF;
 SELECT x.id,x.usuario INTO u FROM public.usuarios x WHERE x.id=p_user AND x.empresa_id=p_empresa FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Target unavailable';END IF;
 UPDATE public.usuarios x SET password_hash=p_hash,debe_cambiar_password=true,password_version=x.password_version+1 WHERE x.id=p_user AND x.empresa_id=p_empresa;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Reset conflict';END IF;
 INSERT INTO public.web_user_admin_events(request_id,empresa_id,usuario_id,actor,accion,ip) VALUES(p_request,p_empresa,p_user,p_actor,'PASSWORD_RESET',(c->>'ip')::inet);
 RETURN QUERY SELECT u.id::uuid,u.usuario::text;
END $$;
ALTER FUNCTION public.admin_reset_web_user_password(uuid,uuid,text,text,uuid) OWNER TO eduxfac_user_admin_owner;
REVOKE ALL ON FUNCTION public.authorize_web_user_operation(text,uuid,uuid,text,uuid,text,inet),public.activate_web_user_context(text),public.web_user_context(),public.admin_reset_web_user_password(uuid,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_web_user_operation(text,uuid,uuid,text,uuid,text,inet) TO eduxfac_user_authorizer;
GRANT EXECUTE ON FUNCTION public.activate_web_user_context(text),public.web_user_context(),public.admin_reset_web_user_password(uuid,uuid,text,text,uuid) TO eduxfac_user_admin;
DO $$ DECLARE m text:=coalesce(nullif(pg_catalog.current_setting('eduxfac.user_admin_migrator_role',true),''),'eduxfac_web_migrator_test');b text:=coalesce(nullif(pg_catalog.current_setting('eduxfac.user_admin_backup_role',true),''),'eduxfac_web_backup_test');BEGIN
 IF m=b OR m IN ('eduxfac_user_admin','eduxfac_user_authorizer','eduxfac_user_admin_owner') OR b IN ('eduxfac_user_admin','eduxfac_user_authorizer','eduxfac_user_admin_owner') OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=m) OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=b) THEN RAISE EXCEPTION 'Existing separate migrator and backup roles required';END IF;
 EXECUTE 'DROP POLICY IF EXISTS f10_migrator ON public.web_user_admin_events';EXECUTE format('CREATE POLICY f10_migrator ON public.web_user_admin_events FOR ALL TO %I USING(true) WITH CHECK(true)',m);
 EXECUTE 'DROP POLICY IF EXISTS f10_backup ON public.web_user_admin_events';EXECUTE format('CREATE POLICY f10_backup ON public.web_user_admin_events FOR SELECT TO %I USING(true)',b);EXECUTE format('GRANT SELECT ON public.web_user_admin_events TO %I',b);
END $$;
INSERT INTO public.web_schema_migrations(version) VALUES('014_web_user_administration') ON CONFLICT DO NOTHING;
COMMIT;
