# Smoke test piloto

Ejecución ficticia únicamente: Panel staging/phase10/smoke-pilot.mjs, requiere marcador Linux y EDUXFAC_F10_ISOLATED=yes. SMOKE_PILOTO_F10.json: 13 casos. No es script para apuntar al VPS.

Panel: login admin ficticio, crear contratante, borrador empresa BASICO, principal/admin, completar/activar, estado/suscripción/health/sincronización, pago manual, renovación UUID idempotente, suspender/reactivar e historial. WEB: login temporal restringido, cambio obligatorio/token revocado, producto, compra, venta, inventario, reporte. Integración: comandos auditados y JWT cliente rechazado. No cobro/factura electrónica/notificaciones.

Real: aplicar checklist20 con responsable, IDs/saldos previos/finales, horario/expected/actual. No mezclar stock ficticio con cliente; ensayo en empresa separada del entorno de pruebas. Suspensión/renovación solo ventana acordada. Si falla: detener writers, revisar cola, conservar evidencia, release global conocida y clone restore antes de recuperación real. Cero fuga A/B, balances coherentes, logs sin secretos, RLS/ACL/marcador preservados. Prueba local no certifica DNS/TLS/firewall/VPS futuro.

