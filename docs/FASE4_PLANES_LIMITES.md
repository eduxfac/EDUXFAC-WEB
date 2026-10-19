# FASE 4 — Planes comerciales y cuotas WEB

Implementación local finalizada el 11 de octubre de 2026 (America/Lima). Código oficial exclusivamente en D:\EDUXFAC. No se aplicó a producción.

## Catálogo y dinero

| Código | Precio mensual | Moneda / periodicidad | Sucursales activas | Usuarios activos totales |
| --- | --- | --- | --- | --- |
| BASICO | S/ 59.00 | PEN / MENSUAL | 1 | 3 |
| PROFESIONAL | S/ 99.00 | PEN / MENSUAL | 1 | 4 |
| EMPRESA | S/ 129.00 | PEN / MENSUAL | MULTI, sin límite fijo | 6 |

El administrador inicial y la sucursal principal cuentan dentro de sus cuotas.
El catálogo contiene exactamente estos tres registros. ACTIVO/INACTIVO controla nuevas asignaciones. No hay endpoint de eliminación. Inactivar un plan no altera contratos existentes.

SQLite almacena precio_centavos y precio_asignado_centavos como INTEGER exacto (5900, 9900, 12900). No usa REAL/float para guardar ni calcular dinero. La API presenta precio y precio_asignado como cadenas decimales de dos posiciones. Es una representación en unidades menores apropiada para SQLite, cuya afinidad NUMERIC no garantiza aritmética decimal exacta.

## Contratos y condiciones efectivas

web_company_conditions relaciona empresa local y plan y conserva una copia de:
plan_codigo, precio asignado en centavos, moneda, periodicidad, límites, multisucursal, personalización, versión y fecha.
Cambiar el precio del catálogo no modifica silenciosamente contratos anteriores. Una nueva asignación explícita sí toma las condiciones vigentes del catálogo; se audita el cambio.

WEB no copia catálogo ni precios. empresa_acceso recibe solo plan_codigo, limite_sucursales, limite_usuarios, multisucursal, condiciones_version y condiciones_updated_at.
Para MULTI, limite_sucursales=NULL y multisucursal=true. No se utilizan valores artificiales.
limite_usuarios debe ser entero positivo; NULL no significa usuarios ilimitados.
Las versiones bigint se transmiten como cadenas de dígitos, sin pérdida de precisión.

## Migraciones nuevas y compatibilidad

WEB: database/migrations/004_planes_limites.sql, después de 001, 002 y 003.
PANEL: database/web-migrations/003_web_plans.sql, después de 001_web_onboarding y 002_web_company_states.

Las migraciones anteriores permanecieron intactas por SHA256.
No se ejecuta automáticamente la migración comercial al iniciar el Panel.
prepareWebPlanTestSchema requiere NODE_ENV=test y SQLite ':memory:'; cualquier archivo persistente se rechaza antes de abrirlo.

Los esquemas de pruebas Fases 1–3 mantienen su comportamiento anterior y las 113 pruebas siguen pasando sin editar sus archivos.
En un esquema Fase 4 se exige plan comercial confirmado para ACTIVAR y REACTIVAR. No existe parámetro del cliente para deshabilitar esta regla.
La migración no inventa contratos ni precios para empresas antiguas. Mantiene sus datos y estados; será necesario asignar condiciones explícitas antes de reactivar o aumentar recursos activos en empresas ya activas.
Las pendientes pueden recibir plan después de completar sus recursos: el uso existente se valida antes de aplicar límites.

## API interna WEB

JWT de servicio, firma/issuer/audience/scopes de Fase 1. JWT normal WEB no puede acceder.

| Método / ruta | Scope |
| --- | --- |
| PUT /api/internal/admin/v1/empresas/:id/plan | empresas:plan |
| PUT /api/internal/admin/v1/empresas/:id/limites | empresas:limites |
| GET /api/internal/admin/v1/empresas/:id/uso | empresas:uso |

PUT /plan exige command_id UUID, motivo no vacío (máximo 500), administrador, plan_codigo, limite_sucursales, limite_usuarios, multisucursal y version_condiciones.
PUT /limites exige los mismos campos excepto plan_codigo: conserva el plan existente y aplica una excepción.
La versión solicitada debe ser exactamente la actual + 1, salvo replay del comando ya registrado.
WEB valida estructura y uso actual; confía en el servicio administrativo para los límites efectivos. No mantiene un catálogo duplicado para comparar precios o condiciones base.

GET /uso devuelve empresa, plan, límites, MULTI, versión, fecha y conteo de usuarios/sucursales activos. Incluye los últimos 20 rechazos de cuota, con datos de auditoría seguros, para mostrarlos en el Panel después de consultar uso.

command_id está serializado por bloqueo y su fingerprint incluye empresa, operación, condiciones, motivo, administrador y servicio.
Repetirlo devuelve resultado guardado sin incrementar versión ni duplicar evento aplicado. Reutilizarlo con otro contenido se rechaza.

## Cuotas y concurrencia

Los triggers PostgreSQL cuota_usuarios y cuota_sucursales cubren INSERT y reactivación por UPDATE, incluidos:
- crear usuario;
- PATCH de estado;
- PUT de edición que reactive;
- crear sucursal;
- reactivar sucursal;
- recursos iniciales de alta cuando el plan ya está asignado.

Se cuentan usuarios activos de toda la empresa, no asignaciones ni usuarios por sucursal.
Se cuentan sucursales activas, incluyendo la principal. Desactivar libera cupo; editar un recurso que ya estaba activo no consume otro cupo.
No se trasladan usuarios o sucursales entre empresas mediante UPDATE de empresa_id.

Cada aumento de uso modifica cuota_revision bajo el bloqueo de la fila empresa_acceso. Esto serializa escrituras de cuota y cambios de condiciones. El UPDATE físico también impide que REPEATABLE READ use un snapshot antiguo para exceder el límite: la segunda transacción aborta con conflicto de serialización.
La administración de sucursales toma ese mismo bloqueo, evitando una promoción de FOR SHARE de empresa a FOR UPDATE durante una sesión.
Las asignaciones de plan bloquean empresa/acceso, cuentan uso actual y aplican condiciones en la misma transacción.

Mensajes:
- Has alcanzado el límite de sucursales permitido por tu plan.
- Has alcanzado el límite de usuarios permitido por tu plan.

Una empresa PENDIENTE sin plan puede completar sus recursos iniciales, pero no puede activarse. En una empresa activa, la ausencia de condiciones impide aumentar uso.
Nada elimina ni desactiva recursos automáticamente.

## Cambios de plan y excepciones

Se permiten las seis direcciones entre BASICO, PROFESIONAL y EMPRESA si el uso cabe.
Cuando no cabe, WEB rechaza antes de cambiar condiciones y devuelve:
No se puede aplicar este plan porque la empresa supera actualmente sus límites.
Incluye sucursales actuales/nuevo límite y usuarios actuales/nuevo límite. El Panel los muestra; conserva plan, precio, usuarios y sucursales.
Un cambio programado requiere una futura operación específica; esta fase no programa ni ejecuta reducciones automáticas.

Las excepciones exigen motivo y administrador de sesión. Modifican solo las condiciones de esa empresa; conservan plan y precio asignado, y marcan personalizada=true. No cambian el catálogo.
Una asignación explícita posterior del plan restablece sus condiciones base y toma su precio vigente.

## Integración con alta y estados

El alta nueva muestra selección obligatoria del plan en esquemas Fase 4.
Guardar conserva selección y borrador sin contraseña ni llamada comercial.
Completar confirma cliente y empresa, asigna y confirma plan, crea principal y administrador. Activar sigue siendo un paso separado.
No se activa sin condiciones confirmadas localmente y válidas en WEB.
Si la asignación queda sin confirmar, se reintenta desde Plan y límites con el mismo comando; después se continúa el alta desde el paso pendiente.
Repetir el borrador con otra selección de plan se rechaza; los cambios se hacen mediante asignación comercial explícita.

Suspender, vencer y cancelar no modifican plan ni precio ni condiciones.
Reactivar valida presencia, estructura de condiciones y uso actual dentro de límites. No revive sesiones antiguas: Fase 3 y auth_version se conservan.
Inactivar el catálogo no cancela el contrato asignado.

## Panel: API, interfaz y persistencia

Rutas autenticadas locales:
- GET /api/web/comercial/planes
- POST /api/web/comercial/planes/estado: codigo, activo y motivo
- GET /api/web/comercial/empresas
- GET /api/web/comercial/historial?empresa=:id
- POST /api/web/comercial/empresas/:id/plan
- POST /api/web/comercial/empresas/:id/limites
- POST /api/web/comercial/empresas/:id/uso
- POST /api/web/comercial/empresas/:id/reintentar

Los POST requieren Origin local y sesión. El navegador no puede suministrar otro administrador.
La ficha Plan y límites permite asignar/cambiar, consultar uso, aplicar excepción y reintentar.
El listado muestra cliente, empresa, estado, plan, precio, uso/límites y personalización.
El catálogo muestra tres tarjetas con precio mensual y ACTIVO/INACTIVO.

web_commercial_commands persiste payload y copia exacta de condiciones antes del PUT remoto, con SOLICITADO/PENDIENTE/APLICADO/ERROR. Solo una orden comercial pendiente por empresa. El reintento usa UUID, motivo, administrador y payload originales.
La consulta de uso previa al comando no modifica condiciones; si falla, no se ha enviado ningún PUT.
Una respuesta debe coincidir con empresa, comando, versión y condiciones esperadas antes de confirmar la copia local.
Un replay vuelve a consultar uso real; no sustituye una versión remota más nueva por datos históricos. Los cambios externos pueden dejar DESINCRONIZADO y requieren revisión expresa, no adopción silenciosa del precio.
No se cambian estados de empresa mientras hay condiciones pendientes ni se cambian condiciones mientras existe una orden de estado sin confirmar.

## Auditoría

WEB:
- acciones_admin: una fila por comando comercial aplicado.
- eventos_comerciales: antes/después, administrador, motivo, comando, fecha y resultado/error para planes, excepciones, reducciones rechazadas y cuotas alcanzadas.
- estado/plan/cuotas se validan dentro de transacción; auditoría de acciones aplicadas forma parte del COMMIT.
- el rechazo por cuota se registra después del rollback mediante el cliente que ejecutó la transacción.
- para operaciones de usuarios WEB, administrador identifica el UUID del usuario autenticado.
- una caída de la BD puede impedir registrar un intento rechazado; no convierte ese rechazo en una alta permitida.

PANEL:
web_commercial_history registra cada hito, motivo, administrador, comando y copias anterior/nueva.
La ficha agrega los rechazos de cuota recibidos en la última consulta de uso (últimos 20); el historial completo permanece en WEB.
No se persisten contraseñas, secretos ni tokens en estos registros. No deben incluirse credenciales en motivos administrativos.

## Pruebas y evidencia

Resultado final: 173 entradas aprobadas, 0 fallidas, 0 omitidas.
- WEB: 137 (90 anteriores + 43 funcionales Fase 4 + 4 de concurrencia nativa).
- PANEL: 36 (23 anteriores + 13 Fase 4).
Se conservan las 113 anteriores intactas; 60 entradas nuevas incluyen grupos del contador Node.

Comando completo WEB:
node --test --test-concurrency=1 tests/*.test.js
Comando PANEL:
node --test --test-concurrency=1 tests/*.test.mjs

La última verificación repitió regresión WEB y pruebas funcionales después de proteger el borrador (133 aprobadas); no repitió la prueba nativa sin cambios relevantes (4 aprobadas previamente en la regresión completa).
Todos los comandos se ejecutaron desde D: con NODE_ENV=test y TEMP/TMP dirigidos a D:.

PGlite y SQLite de integración en memoria. Pruebas antiguas Panel: SQLite temporales exclusivamente en D:.
Concurrencia real: herramientas PostgreSQL del sistema iniciaron un cluster nuevo bajo tests/.native-fase4/<UUID>/cluster, puerto loopback propio, rol ficticio y confianza local. No se usó el servicio ni el directorio de datos instalados. Se comprobaron dos conexiones independientes y solicitudes HTTP simultáneas, además de REPEATABLE READ. Las instancias quedaron detenidas; los archivos de prueba permanecen identificados en D:.

Cobertura: tres altas, principal/admin incluidos, 3/4/6 usuarios, MULTI, creación/reactivación/edición activa, seis usuarios globales, cambios válidos e incompatibles, excepción, precio congelado, catálogo inactivo, JWT/scopes, CSRF, idempotencia, caída después de COMMIT, reintento, A/B, conservación de condiciones al suspender/reactivar/cancelar y rechazo de reactivación sin condiciones.

Navegador: fixture tests/helpers/ui-plans-fixture.mjs, bases RAM y datos ficticios.
Verificados visualmente: tres tarjetas/precios, ratios 1/1 y 3/3, 1/1 y 4/4, MULTI y 5/6; cambio BASICO→PROFESIONAL; reducción EMPRESA→BASICO rechazada con ambos usos; excepción PROFESIONAL 1/6; marca personalizada; mensaje de cuota alcanzada; historial; selección de plan en alta y activación pendiente. Consola sin errores.
La pestaña y servidores de prueba se cerraron.

## Respaldos y archivos

Respaldos previos, solo los 13 archivos modificados, sin ZIP:
D:\EDUXFAC\EDUXFAC WEB\03_RESPALDOS\FASE4_PRE_PLANES_20261011_2138
D:\EDUXFAC\PANEL EDUXFAC\03_RESPALDOS\FASE4_PRE_PLANES_20261011_2138

WEB modificados:
- server/src/admin-service-api.js
- server/src/onboarding-api.js
- server/src/db.js
- server/src/branch-admin.js

WEB nuevos:
- database/migrations/004_planes_limites.sql
- server/src/commercial-conditions.js
- server/src/commercial-api.js
- tests/plans-limits.test.js
- tests/native-plan-concurrency.test.js
- tests/helpers/plan-fixture.js
- tests/helpers/native-plan-fixture.js
- tests/helpers/ui-plans-fixture.mjs
- docs/FASE4_PLANES_LIMITES.md

PANEL modificados:
- server/app.mjs
- server/web-api-client.mjs
- server/web-onboarding-service.mjs
- server/web-company-states.mjs
- public/app.js
- public/index.html
- public/style.css
- public/web-onboarding.js
- public/web-company-states.js

PANEL nuevos:
- database/web-migrations/003_web_plans.sql
- server/web-plans.mjs
- public/web-plans.js
- tests/web-plans.test.mjs
- docs/FASE4_PLANES_LIMITES.md

Además existen los datos y logs ficticios generados bajo tests/.native-fase4; no son respaldos de clientes ni recursos de producción.

## Pendientes y Fase 5

Las migraciones reales y configuración del canal de servicio requieren autorización y validación posterior. Antes de activar Fase 4 en un entorno real deben asignarse condiciones a empresas existentes y revisar contratos/uso; no se asignaron planes reales automáticamente.
La fecha de consulta de uso corresponde a una instantánea: puede cambiar después. WEB siempre aplica la cuota contra el uso transaccional actual.
El cluster nativo de pruebas utiliza herramientas de la ubicación instalada actual; en otro equipo habrá que proporcionar una ruta de herramientas de prueba y mantener el aislamiento.
El historial y las referencias administrativas siguen siendo vistas simples; sus límites de consulta requieren ampliar paginación cuando crezca el volumen.
No hay cambios programados ni recuperación especial de condiciones comerciales discrepantes.

Fase 5 queda pendiente: diseñar vigencias, vencimiento/renovación según reglas autorizadas, operación automática idempotente y pruebas de fechas con auditoría. No se adelantaron cobros, pagos, facturación ni renovación automática.

Confirmaciones:
- ninguna fuente histórica de C: se leyó o utilizó; los ejecutables PostgreSQL/Node/PowerShell del sistema son herramientas;
- no se tocó VPS ni producción ni se hizo deploy;
- PROPIO y TECNICO no se tocaron;
- no se generaron secretos reales ni ZIP;
- ninguna migración se ejecutó sobre una base real;
- SQLite operativa y clave del Panel conservaron tamaño y fecha.
