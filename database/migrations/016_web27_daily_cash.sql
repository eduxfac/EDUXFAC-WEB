BEGIN;
-- V52.1.0: additive daily-cash metadata; no rewriting financial history.
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS fecha_operativa date;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS control_diario boolean NOT NULL DEFAULT false;
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS cerrado_por uuid REFERENCES usuarios(id);
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS origen_caja varchar(20);
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS operacion_manual uuid;
ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS hash_manual text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_diaria_abierta ON sesiones_caja(caja_id,usuario_id,fecha_operativa) WHERE estado='ABIERTA' AND control_diario;
CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_movimiento_manual ON movimientos_caja(operacion_manual) WHERE operacion_manual IS NOT NULL;
CREATE OR REPLACE FUNCTION eduxfac_cash_day() RETURNS date LANGUAGE sql VOLATILE AS $cashday$
 SELECT (statement_timestamp() AT TIME ZONE 'America/Lima')::date
$cashday$;

COMMIT;
