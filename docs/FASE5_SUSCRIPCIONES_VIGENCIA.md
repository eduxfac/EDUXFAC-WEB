# FASE 5 — Suscripciones, vigencia y renovación mensual

Implementación local en las fuentes oficiales de D:. No aplicada a datos reales ni VPS.

## Resultado verificado

- WEB: 194 pruebas aprobadas, 0 fallidas.
- PANEL: 52 pruebas aprobadas, 0 fallidas.
- Total: **246 aprobadas / 0 fallidas**, incluidas las **173 anteriores** y **73 nuevas**.
- PostgreSQL nativo aislado: 9 resultados aprobados (grupo y 8 escenarios críticos). Conexiones concurrentes reales, rollback, worker, autenticación y aislamiento A/B.
- 42 archivos previos de pruebas, helpers y esquemas/migraciones conservan su SHA256 original.
- SQLite y PEM reales del Panel conservan tamaño y fecha UTC originales; no fueron abiertos por los fixtures.
- Respaldo previo: 4 archivos WEB y 10 PANEL, únicamente los archivos modificados; sin ZIP.
- Los clústeres PostgreSQL temporales dentro de WEB/tests/.native-fase4 quedaron detenidos (sin postmaster.pid). Se reutiliza el harness nativo anterior, sin modificarlo; todos los datos son ficticios.
- Registros: tests/FASE5_RESULTADO_COMPLETO_WEB.log y tests/FASE5_RESULTADO_COMPLETO_PANEL.log, respectivamente. Los archivos FASE5_MEMORIA.log, FASE5_NATIVO.log y FASE5_HTTP.log contienen verificaciones específicas.

## Modelo y propiedad

La empresa mantiene su estado administrativo PENDIENTE / ACTIVO / SUSPENDIDO / VENCIDO / CANCELADO. La suscripción tiene PENDIENTE / ACTIVA / VENCIDA / SUSPENDIDA / CANCELADA. Ambos controles deben permitir el acceso; renovar no elimina una suspensión administrativa. CANCELADO no admite renovación ni reactivación directa.

PANEL: web_subscriptions tiene referencia UUID pública, empresa local, plan contratado, inicio, vencimiento, estado, precio_asignado_centavos (expuesto como precio decimal), PEN, MENSUAL, límites asignados, multisucursal, renovacion_automatica=0, observaciones, versión WEB/condiciones, última renovación y marcas de creación/actualización. Las condiciones se copian del contrato confirmado, no dependen retroactivamente del precio actual del catálogo.

BASICO S/59.00, PROFESIONAL S/99.00, EMPRESA S/129.00 por mes. Dinero entero en centavos; el historial de renovación conserva precio por ciclo y total por los meses autorizados. No hay descuentos automáticos.

WEB guarda solo referencia/estado/instantes/versión de suscripción junto a plan y límites efectivos previos. suscripcion_eventos conserva auditoría técnica, sin precios, pagos ni historial financiero. PANEL conserva pagos y auditoría comercial.

## Vigencia exacta

Inicio inclusivo, vencimiento exclusivo: **ahora >= fecha_vencimiento bloquea**. No se espera al final del día ni al siguiente login. PostgreSQL almacena timestamptz; API y PANEL intercambian ISO UTC con milisegundos; interfaz muestra America/Lima.

Fecha YYYY-MM-DD sin hora representa 00:00:00 de ese día en Lima (UTC-05:00). Un ISO con hora exige Z u offset explícito; se rechazan días inexistentes y horas sin zona.

Única política de cálculo: WEB/server/src/subscription-calendar.js. Se suma un mes calendario por ciclo, conservando la hora en Lima y ajustando el día al último válido. 31 enero → 28/29 febrero; 31 marzo → 30 abril. Los ciclos son acumulativos: 31 enero → 28 febrero → 28 marzo, sin recuperar automáticamente el día 31.

Antes de vencer: inicio original conservado; nuevo vencimiento = vencimiento confirmado + N ciclos. No se calcula desde el pago.

Después de vencer: inicio = fecha/instante de renovación autorizado; vencimiento = ese inicio + N ciclos. Se registra el intervalo entre vencimiento anterior y nueva autorización. No se agrega vigencia al hueco vencido.

Si venció hoy y una fecha de renovación sin hora equivaldría a un instante anterior a su vencimiento, se toma el instante real de autorización de ese día. Esta excepción centralizada impide regalar horas pasadas. Fechas retroactivas anteriores al vencimiento de una suscripción ya vencida se rechazan. El fingerprint usa la fecha solicitada estable; el instante confirmado queda en la respuesta transaccional e idempotente.

No se admite una fecha de renovación futura que sustituya vigencia ya contratada. N permitido: 1, 2, 3, 6 o 12. El resultado debe vencer en el futuro. Un inicio futuro se puede preparar, pero no permite activar antes de comenzar.

## Alta y estados

Alta: cliente → empresa pendiente → plan confirmado → sucursal y administrador inicial → suscripción inicial pendiente con fecha autorizada → activación final. Se conserva el borrador si un paso no se confirma. Ninguna activación se confirma localmente sin plan y suscripción vigentes.

Activar, suspender, reactivar, vencer administrativamente, cancelar, cambiar plan y cambiar límites dejan eventos de suscripción dentro de la transacción WEB. Suspender conserva fechas y datos. Cambiar plan/límites conserva la vigencia. Renovar incrementa auth_version y version_suscripcion; los tokens anteriores siguen inválidos y se necesita nuevo login.

Renovar una empresa VENCIDO permite estado ACTIVO; SUSPENDIDO permanece SUSPENDIDO aunque su suscripción pase a ACTIVA. Una empresa CANCELADO requiere un procedimiento administrativo futuro explícito.

## API de servicio WEB

Prefijo /api/internal/admin/v1:
- PUT /empresas/:id/suscripcion — scope empresas:suscripcion.
- POST /empresas/:id/renovar — scope empresas:renovar.
- GET /empresas/:id/suscripcion — scope empresas:suscripcion:read.

PUT: command_id UUID, suscripcion_id UUID, version_esperada, version_condiciones, fecha_inicio, administrador y motivo.
POST: los mismos identificadores/versiones, fecha_autorizada y meses (sin fecha_inicio).
GET: snapshot mínimo y historial técnico. No expone precios ni pagos.
JWT de usuario WEB nunca puede acceder; se exige JWT de servicio con audiencia/issuer/type/scopes de las fases anteriores.

Transacción: bloqueo advisory de command_id → bloqueo empresa → bloqueo acceso → comparar versiones → validar plan y fechas → actualizar vigencia/estado/versiones → evento técnico → ledger acciones_admin → commit.
command_id UNIQUE compartido con las acciones anteriores. Repetir el mismo contenido devuelve la confirmación original sin otra extensión; reutilizar UUID con otro contenido produce 409.
Dos órdenes distintas con la misma versión esperada: una aplica y la otra devuelve VERSION_SUSCRIPCION_CONFLICTO. Se exige consultar antes de una orden nueva.

## API local PANEL

Sesión del administrador local y protección Origin/CSRF existentes:
- GET /api/web/suscripciones?estado=...&dias=7|15|30&q=...
- GET /api/web/suscripciones/:empresaLocalId
- POST /api/web/suscripciones/:empresaLocalId/crear
- POST /api/web/suscripciones/:empresaLocalId/renovar
- POST /api/web/suscripciones/:empresaLocalId/pago
- POST /api/web/suscripciones/:empresaLocalId/consultar
- POST /api/web/suscripciones/:empresaLocalId/reintentar

Crear/renovar usan command_id UUID estable generado por la interfaz, motivo y fecha autorizada; renovar además meses. El actor se toma de la sesión del Panel, nunca del cuerpo del formulario. La empresa WEB se resuelve mediante la referencia local confirmada. Reintentar conserva payload/versión/condiciones/precio del comando original. Un error de comunicación mantiene ERROR retryable y bloquea otra orden hasta confirmar; una respuesta 4xx definitiva exige revisar y emitir una orden nueva.

## Vencimiento y worker

WEB comprueba empresa, suscripción, inicio, vencimiento y auth_version en cada login y solicitud autenticada. En igualdad con vencimiento ya se rechaza. El acceso permanece bloqueado aunque Panel/worker estén apagados. Mensaje:
“Tu suscripción EDUXFAC WEB ha vencido. Comunícate con soporte para renovar.”

El worker preparado server/scripts/expire-subscriptions.js no arranca ni se programa automáticamente. Requiere DATABASE_URL explícito. Sin --apply solo consulta conteo (dry run). Mutar exige --apply y EDUXFAC_SUBSCRIPTION_WORKER_ALLOW_MUTATION=yes; --watch prepara ciclos de 60 segundos. No se ejecutó sobre una base real.

ExpireDueSubscriptions bloquea/revalida fecha y versión; dos workers simultáneos generan una sola expiración, un evento y una revocación. No borra datos operativos. Una suspensión manual se conserva al vencer. El Panel deriva VENCIDA por fecha para el listado y copia eventos del worker al consultar WEB.

## Pagos manuales e historial

Registrar pago es una acción separada de renovar. Por defecto nunca extiende la vigencia; renovar exige otra confirmación explícita, con otro comando.
Campos: empresa, suscripción, importe en centavos/PEN, fecha válida, método, referencia, observación, administrador y command_id. Métodos EFECTIVO, TRANSFERENCIA, YAPE, PLIN, OTRO; YAPE/PLIN son solo etiquetas de registro, sin API, cobro ni comunicación externa.
Pagos inmutables e idempotentes por command_id. No se envían a WEB.

Historial inmutable protegido con triggers SQLite/PostgreSQL contra UPDATE/DELETE. Eventos ALTA, ACTIVAR, RENOVACION, VENCIMIENTO/VENCER, SUSPENDER, REACTIVAR, CAMBIO_PLAN, CAMBIO_LIMITES, CANCELAR. Incluye antes/después, vencimientos, meses, administrador, motivo, command_id, intervalo vencido y snapshot financiero solo en Panel. Los errores del comando también se conservan en Panel, con códigos seguros; no se guarda el cuerpo con credenciales.

## Migraciones y adopción posterior

Nuevas:
- WEB/database/migrations/005_suscripciones_vigencia.sql.
- PANEL/database/web-migrations/004_web_subscriptions.sql.

No se editaron las migraciones anteriores. Ninguna se aplicó a datos reales. El esquema de prueba del Panel únicamente admite NODE_ENV=test y database=:memory:.

**Riesgo de adopción:** aplicar 005 hace requerida la suscripción para las empresas existentes; se dejan PENDIENTE sin inventar vigencia. Antes de aplicarla en otro entorno, se necesita un inventario y un procedimiento autorizado para asignar suscripciones válidas a empresas existentes. No usar una ejecución indiscriminada de todas las migraciones sobre una base real.

La migración local Fase 5 se aplica explícitamente con applyWebSubscriptionMigrations(db) después de 001–003; el arranque normal no la aplica automáticamente. No ejecutar el servidor real para “probar” la migración.

## Pruebas y reproducción aislada

WEB, desde su ruta oficial: NODE_ENV=test; node --test --test-concurrency=1 tests/*.test.js.
PANEL, desde su ruta oficial: NODE_ENV=test; node --test --test-concurrency=1 tests/*.test.mjs.
TEMP/TMP se fijaron a tests/.tmp dentro de D:.

Pruebas nuevas WEB: calendario (normal, día31, bisiesto, ciclos acumulativos, zona e igualdad), tres planes, alta pendiente/activa, login vigente, JWT/scopes, sesión vencida sin Panel ni worker, renovación temprana/tardía/2/3/6/12, suspensión/cancelación, cambio plan/límites, pagos independientes/confirmación posterior/YAPE/idempotencia/inmutabilidad, A/B, worker, pérdida de respuesta/reintento, filtros7/15/30, migración repetible e inicio futuro. PostgreSQL nativo añade simultaneidad real de mismo/diferente comando, rollback de vigencia/auth_version/ledger, workers simultáneos, expiración, tokens y aislamiento.

Prueba visual: tests/helpers/ui-subscriptions-fixture.mjs, explícitamente NODE_ENV=test. Loopback con PostgreSQL WASM y SQLite en memoria. Cliente A BASICO59 activo vence5d; B PROFESIONAL99 vencido; C EMPRESA129 activo vence20d; D BASICO suspendido. No se usan datos reales.

Se verificaron visualmente listado, badges A/B/C/D, fechas Lima, días, filtros de 7/30 días, detalle/uso, formularios de renovación/pago, historial y registro YAPE sin renovación. Los tres filtros 7/15/30 y la renovación están verificados por API. La comprobación visual del envío final de renovación quedó pendiente después de un bloqueo del navegador de Codex con el antiguo diálogo JavaScript. Se sustituyó ese diálogo por confirmación explícita dentro del formulario; falta repetir ese último paso cuando se cierre el diálogo bloqueado. La interfaz usa confirmación explícita mediante casilla requerida para renovar y para acciones administrativas, sin diálogo JavaScript nativo.

## Límites y Fase 6

Fase 6 aún no autorizada ni implementada. Preparar adopción controlada de suscripciones existentes, procedimiento de recuperación de CANCELADO, conciliación operativa de órdenes pendientes y programación del worker en un entorno autorizado. Evaluar ajustes/anulación compensatoria de pagos (hoy son inmutables), conservación/exportación de historial y alertas si se solicitan.

No se implementaron pagos online, pasarelas, Culqi/MercadoPago, Yape/Plin API, tarjeta, facturación electrónica, cobro recurrente automático ni dashboard financiero final.

Confirmaciones: fuentes solo D:, sin fuentes históricas C:, sin VPS/deploy/producción, sin PROPIO/TECNICO, sin ZIP, sin secretos reales y sin migraciones en bases reales. Se usaron herramientas normales Node/PowerShell/PostgreSQL instaladas en C:; los clústeres y fuentes de prueba están en D:.

## Archivos de WEB

Modificados (4):
- server/src/company-access.js
- server/src/admin-service-api.js
- server/src/onboarding-api.js
- server/src/commercial-api.js

Nuevos de implementación, pruebas y documentación (10):
- database/migrations/005_suscripciones_vigencia.sql
- server/src/subscription-calendar.js
- server/src/subscription-service.js
- server/src/subscription-api.js
- server/scripts/expire-subscriptions.js
- tests/subscriptions.test.js
- tests/subscriptions-native.test.js
- tests/helpers/subscription-fixture.js
- tests/helpers/ui-subscriptions-fixture.mjs
- docs/FASE5_SUSCRIPCIONES_VIGENCIA.md

Respaldo: D:\EDUXFAC\EDUXFAC WEB\03_RESPALDOS\FASE5_PRE_SUSCRIPCIONES_20261011_2224
Los logs y clústeres temporales son artefactos de pruebas, no fuentes ni paquetes de deploy.
