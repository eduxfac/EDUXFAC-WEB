# FASE 6 — Operación, cola, workers y conciliación

Fuentes oficiales de D:. Implementación y pruebas locales; ninguna migración aplicada a bases reales y ningún deploy.

## Resultado

Batería final verificada en los logs de cada proyecto: WEB 254, PANEL 70; total **324 aprobadas / 0 fallidas**, incluidas las **246 anteriores** y **78 nuevas**. Los logs finales son tests/FASE6_RESULTADO_COMPLETO_WEB.log y tests/FASE6_RESULTADO_COMPLETO_PANEL.log. El resumen se cerró después de verificar ambos resultados.

PostgreSQL nativo aislado: 11 resultados (grupo y 10 escenarios críticos). Se verificaron recuperación de respuesta perdida, leases, workers concurrentes, renovación simultánea, rollback de vencimiento, conciliación y A/B. PANEL usa SQLite en memoria en esas pruebas; no se migró PANEL a PostgreSQL.

49 archivos previos de pruebas/helpers y esquemas/migraciones fueron comparados mediante SHA256 al cierre: 49 coinciden, sin cambios. Respaldo previo solo de los archivos modificados: WEB 4 y PANEL 10. Datos y clave existentes del Panel conservan tamaño y fecha de modificación originales; no se leyeron sus valores ni se abrieron para ejecutar pruebas. Al cierre se comprobó que no quedaban archivos postmaster.pid de los clústeres aislados y se cerró el fixture visual; se reutiliza el harness anterior tests/.native-fase4, sin modificarlo.

## Cola persistente

Nueva migración PANEL database/web-migrations/005_web_operations.sql, tras 004_web_subscriptions.
Tablas:
- integration_queue: id, command_id UNIQUE, empresa_id, origen, tipo_accion, payload_seguro, estado, intentos, max_intentos, retryable, ultimo_error, proximo_reintento, lease_owner/lease_until, created_at/updated_at/applied_at.
- integration_attempts: registro inmutable por comando/intento; duración, estado, resultado y código seguro.
- integration_logs: logging estructurado, preparado para política futura de archivo/rotación.
- integration_reconciliation: última comparación, snapshots mínimos y campos diferentes.
- integration_health: estado, fecha, latencia y caché persistente.
- integration_worker_runs: leases y últimas ejecuciones.
- integration_settings: máximo para nuevas órdenes.

Estados: SOLICITADO, PENDIENTE, APLICADO, ERROR, REINTENTO, CANCELADO.

La cola unifica las órdenes persistentes de **estados, planes/límites y suscripciones** de las fases anteriores. Triggers SQLite crean la fila dentro de la misma transacción que guarda la orden original, antes de enviarla. Se incorporan órdenes anteriores por backfill conservador; no se inventan intentos históricos. Los historiales anteriores permanecen en sus tablas originales.

El alta inicial de Fase 2 conserva sus borradores y pasos confirmados. La creación/cambio de credenciales requiere reintroducción humana; no se persisten contraseñas para automatizar ese paso. La cola no almacena el cuerpo de creación del administrador con su contraseña.

Payload seguro: lista cerrada de campos administrativos necesarios. Nunca incluye tokens, cabeceras, secretos, hashes o claves. Las respuestas públicas de cola ocultan payload y lease. Antes de enviar se compara la orden original con su copia segura y se rechazan campos inesperados. Una alteración deja ERROR definitivo/PAYLOAD_NO_COINCIDE, sin envío ni cambios de negocio.

## Leases, idempotencia y recuperación

Cada despacho reclama un lease atómico con BEGIN IMMEDIATE y owner aleatorio. TTL 120 segundos. La reserva persiste antes del envío; una caída no pierde el command_id. Otra instancia no despacha mientras el lease sea vigente. Al caducar, puede recuperarse la misma orden.

Los workers de integración y conciliación también tienen lease de ciclo; actualizan su vigencia entre elementos. El worker WEB usa control persistente de PostgreSQL y bloqueo advisory de ejecución. La exclusión de ciclo limita carga; la garantía del efecto depende además del ledger idempotente WEB y las transacciones de las fases anteriores.

No hay transacción SQLite abierta durante una llamada HTTP. Si WEB aplica y se pierde la respuesta, la orden permanece recuperable; el reintento utiliza exactamente el UUID/payload original y WEB devuelve replay. El Panel confirma los datos efectivos y registra APLICADO. Las versiones de suscripción/condiciones impiden sumar dos veces con órdenes distintas sobre la misma versión.

La prueba durable crea una SQLite **ficticia marcada dentro de PANEL/tests/.tmp**, cierra/reabre la conexión y demuestra que el lease y la cola sobreviven. No utiliza data/panel.sqlite.

## Backoff y límites

Secuencia tras fallos: 1, 5, 15, 30 y 60 minutos; después se mantiene una hora.
MAX_INTEGRATION_RETRIES define max_intentos **totales**, incluyendo envío inicial y reservas de ejecución. Ejemplo 5: hasta cinco intentos totales. Rango 1–20. Los comandos conservan el máximo asignado al crearse; cambiar configuración no resetea órdenes agotadas.

Un error recuperable agenda proximo_reintento. Un 4xx definitivo, integridad inválida o agotamiento queda para revisión y no se reenvía automáticamente. Las reservas tras una caída cuentan para el límite, aunque no se conozca si llegaron a enviar.

Reintento manual: motivo y administrador autenticado, mismo comando, sin resetear el máximo. Puede adelantar un backoff por acción humana explícita; la frecuencia automática siempre es >= 60 segundos.

CANCELADO en cola detiene reintentos; **no revierte una posible aplicación en WEB ni borra la orden original**. Una orden cancelada/agotada con efecto incierto requiere procedimiento administrativo autorizado antes de liberar acciones posteriores. No existe “Forzar” ni un reset silencioso de contadores.

## Conciliación

WEB GET /api/internal/admin/v1/empresas/:id/operacion, scope empresas:operacion.
Consulta empresa/acceso bajo el mismo orden de bloqueos que las mutaciones (empresa → acceso). Devuelve estado, auth_version, plan/límites/versiones, suscripción/instantes y eventos técnicos de vencimiento. command_id opcional permite comprobar si una orden de esa empresa fue aplicada. No devuelve request_hash, tokens, contraseñas ni historial financiero.

Clasificación:
- SINCRONIZADO: campos comparados iguales, sin orden abierta.
- PENDIENTE: orden conocida aún recuperable/esperando reintento o consulta inicial.
- ERROR: API no confirma, rechazo definitivo o intentos agotados.
- DESINCRONIZADO: diferencia sin una orden pendiente que la explique.

Compara estado de empresa, plan, límites, multisucursal, versión de condiciones, referencia/estado de suscripción, inicio/vencimiento, versión de suscripción y auth_version.
Una orden conocida y elegible se reintenta con su UUID. Un conflicto sin orden conocida **no cambia datos de negocio**: se guarda la comparación para revisión.

Excepción no ambigua: vencimiento registrado por el worker WEB, misma referencia/fecha/plan/límites, incrementos exactos de versiones y transición esperada. Solo en ese caso se sincronizan la suscripción y el estado comercial local. Una suspensión administrativa permanece suspendida. CANCELADO nunca se reactiva por workers.

“Consultar WEB” guarda una comparación sin recuperar/corregir automáticamente. “Conciliar” puede recuperar órdenes conocidas y el vencimiento inequívoco. Motivo y administrador quedan auditados. Después de un reintento, la clasificación de empresa representa la última conciliación; la siguiente conciliación confirma el estado completo.

## Workers y configuración

PANEL:
- integración: procesa hasta 20 órdenes elegibles por ciclo.
- conciliación: hasta 200 empresas por ciclo, ordenadas por consulta más antigua/no consultadas.
- health se comprueba con caché mínima de 60 segundos.
WEB:
- vencimientos: lote de hasta 100; control persistente en operacion_workers.
- entrada preparada: server/scripts/expire-subscriptions.js --configured.
- la seguridad no depende de los workers: cada login/solicitud WEB comprueba fecha/estado/auth_version, sin consultar PANEL.

Variables en ambos .env.example, sin secretos reales:
INTEGRATION_WORKER_ENABLED=false
INTEGRATION_WORKER_INTERVAL_MS=60000
EXPIRATION_WORKER_ENABLED=false
EXPIRATION_WORKER_INTERVAL_MS=60000
RECONCILIATION_WORKER_ENABLED=false
RECONCILIATION_WORKER_INTERVAL_MS=300000
MAX_INTEGRATION_RETRIES=5
EDUXFAC_SUBSCRIPTION_WORKER_ALLOW_MUTATION=no

Intervalos válidos: 60000–86400000 ms. Flags explícitos true/false. No se activan por defecto ni mediante la migración.
EXPIRATION_WORKER_ENABLED se usa en **WEB**, no inicia una ejecución remota desde PANEL. WEB además requiere DATABASE_URL explícita y permiso de mutación yes. Sin autorización no conecta ni muta.
El modo CLI anterior conserva consulta seca por defecto; --watch sin --apply nunca modifica. SIGINT/SIGTERM detienen timers y esperan ejecuciones. PANEL detiene sus workers antes de cerrar SQLite.

## Health, alertas, vencimientos y logs

Health usa el endpoint de servicio existente. ONLINE: respuesta válida; OFFLINE: fallo de conexión; ERROR: rechazo/forma inválida. Fecha/hora y latencia visibles. SIN_COMPROBAR es el estado inicial sin consulta. ONLINE acredita conectividad/salud básica, **no sustituye el checklist de migraciones, roles, RLS y datos**.

Panel muestra cola, errores, agotados, diferencias, próximas/vencidas y errores recientes. Alertas exclusivamente internas; no email/WhatsApp, cobros ni servicios externos.

Ventanas:
- Vence hoy: mismo día calendario America/Lima, incluso si ya alcanzó su hora de vencimiento hoy.
- 7/15/30: ahora < vencimiento <= ahora + N días.
- Se listan suscripciones ACTIVA; vencidas aparecen en alertas separadas.
- Días restantes: techo de duración en días, mínimo cero.
- Monto y precio son contratos locales del Panel; WEB no recibe información financiera.

Logs: command_id/empresa_id, acción, estado, duración, resultado, código técnico permitido y fecha. Nunca cuerpos HTTP, razones privadas de drivers, tokens, hashes, claves o DATABASE_URL completa. Códigos desconocidos se reducen a ERROR_API. El motivo y administrador de acciones humanas se registran en auditoría local separada.

Rotación futura: definir retención, exportación verificada y archivo por tamaño/fecha; configurar el gestor de procesos para stdout WEB. No se implementó borrado automático de logs. No borrar ledger de idempotencia ni historial de suscripciones para “limpiar” logs.

## API local PANEL

Sesión local y Origin/CSRF previos:
- GET /api/web/operacion
- GET /api/web/operacion/vencimientos?dias=0|7|15|30
- POST /api/web/operacion/health
- POST /api/web/operacion/conciliar (motivo)
- POST /api/web/operacion/empresas/:id/consultar (motivo)
- POST /api/web/operacion/empresas/:id/conciliar (motivo)
- GET /api/web/operacion/comandos/:command_id/error
- POST /api/web/operacion/comandos/:command_id/reintentar (motivo)
- POST /api/web/operacion/comandos/:command_id/cancelar (motivo)

El actor se toma de la sesión, no del cuerpo. No hay endpoint para editar el payload, cambiar UUID, forzar estado, resetear agotamiento o modificar bases.

## Migraciones

WEB: database/migrations/006_operacion_workers.sql, después de 001–005.
PANEL: database/web-migrations/005_web_operations.sql, después de 001–004.
No se modificaron migraciones anteriores. Solo se aplicaron sobre bases en memoria/temporales aisladas. El flag prepareWebOperationTestSchema exige NODE_ENV=test y database=:memory:, antes de abrir una base persistente.

## Pruebas y evidencia

WEB: NODE_ENV=test; node --test --test-concurrency=1 tests/*.test.js.
PANEL: NODE_ENV=test; node --test --test-concurrency=1 tests/*.test.mjs.
TEMP/TMP de los procesos de pruebas se fijan a tests/.tmp en D:.

Nuevas pruebas: config/intervalos/backoff/max; logs seguros; cola y captura atómica; health/caché/offline/error; snapshot JWT/scopes; pérdida de respuesta y replay; suspensión y renovación; conflicto ambiguo; WEB operativa sin PANEL; sesión vencida sin worker; vencimiento/idempotencia; reincorporación después de horas; A/B; worker concurrente; agotamiento/cancelación; filtros hoy/7/15/30; parada; persistencia al reabrir SQLite; rechazo de payload alterado/campos inesperados. PostgreSQL nativo agrega transacciones/bloqueos y rollback real.

Fixture visual: WEB/tests/helpers/ui-operations-fixture.mjs, NODE_ENV=test, loopback y ambas bases en memoria. A ACTIVA/SINCRONIZADO vence5d; B VENCIDA/SINCRONIZADO; C ACTIVA/ERROR; D SUSPENDIDA/PENDIENTE por renovación no confirmada.
Se probaron filtros, health, Ver error, reintento manual con confirmación y conciliación. Tras restablecer conexión ficticia: C SINCRONIZADO; D SINCRONIZADO y **SUSPENDIDO**, sin perder su restricción administrativa.

Capturas PANEL/docs/FASE6_UI_INICIAL.jpg y FASE6_UI_RESULTADO.jpg, creadas desde el navegador de pruebas. El directorio de artefactos de Codex en C: solo sirvió para conservar las capturas antes de guardarlas en D:; no es una fuente histórica de código EDUXFAC.

## Preparación de PANEL para PostgreSQL

No se migró la base real. La implementación actual usa DatabaseSync, JSON1, triggers SQLite y BEGIN IMMEDIATE. Para migrar:
1. Convertir repositorios/transaction a operaciones async, sin envolver una Promise en la transacción síncrona actual.
2. Migrar tipos a uuid/timestamptz/jsonb/bigint e índices parciales equivalentes.
3. Reclamar fila con FOR UPDATE SKIP LOCKED y CAS de owner/lease; conservar la reserva antes de HTTP.
4. Migrar cola e historia con command_id originales, estados, máximos, fechas y leases; no reenviar como comandos nuevos.
5. Mantener negocio + outbox en la misma transacción, mediante inserción explícita o triggers PostgreSQL auditados.
6. Restringir rol/edición de payload y permitir solo transiciones operativas. No usar superusuario ni BYPASSRLS para pruebas de aislamiento.
7. Preservar snapshots financieros en PANEL; no moverlos a WEB.
8. Probar dos procesos reales, caída después de enviar/antes de confirmar, leases caducados, replay y rollback.
9. Ajustar timestamps UTC y consultas de próximas fechas; America/Lima solo para presentación/día comercial.
10. Decidir WAL/busy_timeout/single writer para operación SQLite mientras no se migre. La exclusión por lease no elimina SQLITE_BUSY; un fallo de reserva nunca autoriza enviar.

## Estado y límites antes de producción

PANEL queda como **MVP administrativo y operativo local validado para pilotos aislados**. No se atribuye un porcentaje de producción: faltan adopción de empresas existentes, secretos reales autorizados, HTTPS/red, roles y RLS reales, backup/restore, pruebas de carga y recuperación, retención de logs y procedimiento para órdenes agotadas/canceladas o conflictos manuales.

Consultar CHECKLIST_ADOPCION_PRODUCCION.md y PLAN_ROLLBACK.md en PANEL. El puente LAN temporal heredado del arranque normal no se probó ni se abrió en estos ensayos; revisarlo antes de cualquier exposición futura. Los fixtures escuchan solo en 127.0.0.1.

Confirmaciones: sin fuentes históricas C:, sin VPS/deploy/producción, sin PROPIO/TECNICO, sin ZIP, sin secretos reales ni migraciones en bases reales. Se usaron binarios normales del sistema instalados en C: y fuentes/datos de prueba en D:.

## Inventario WEB

Ruta oficial: D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL

Archivos modificados (4):
- .env.example
- server/src/admin-service-api.js
- server/src/subscription-service.js
- server/scripts/expire-subscriptions.js

Archivos nuevos (8):
- database/migrations/006_operacion_workers.sql
- server/src/operations-api.js
- server/scripts/expiration-worker.js
- tests/operations.test.js
- tests/operations-native.test.js
- tests/helpers/operations-fixture.js
- tests/helpers/ui-operations-fixture.mjs
- docs/FASE6_OPERACION_CONCILIACION.md

Los logs de ejecución, clústeres PostgreSQL aislados y SQLite ficticias marcadas son artefactos de pruebas, no fuentes ni paquetes de deploy.
