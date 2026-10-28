BEGIN;
CREATE TABLE IF NOT EXISTS venta_checkout_comandos (
 empresa_id uuid NOT NULL REFERENCES empresas(id), command_id uuid NOT NULL,
 sucursal_id uuid NOT NULL REFERENCES sucursales(id), venta_id uuid NOT NULL REFERENCES ventas(id),
 request_hash char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(empresa_id,command_id)
);
INSERT INTO web_schema_migrations(version) VALUES('010_checkout_idempotencia') ON CONFLICT DO NOTHING;
COMMIT;
