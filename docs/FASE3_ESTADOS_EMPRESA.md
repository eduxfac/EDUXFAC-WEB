# FASE 3 — Estados de empresas EDUXFAC WEB

Implementada y comprobada localmente el 11 de octubre de 2026 (America/Lima).
Fuentes oficiales: únicamente los proyectos WEB y PANEL en D:\EDUXFAC.
No se aplicaron migraciones a bases reales ni se abrió la SQLite operativa del Panel.

## Estados y política central

La autoridad de transiciones es WEB: server/src/company-state-policy.js.
El Panel muestra acciones compatibles y WEB vuelve a validar cada solicitud.

| Origen | Destinos permitidos |
| --- | --- |
| PENDIENTE | ACTIVO mediante ACTIVAR con alta completa; CANCELADO |
| ACTIVO | SUSPENDIDO; VENCIDO; CANCELADO |
| SUSPENDIDO | ACTIVO mediante REACTIVAR; CANCELADO |
| VENCIDO | ACTIVO mediante REACTIVAR; CANCELADO |
| CANCELADO | Terminal: no permite ACTIVAR ni REACTIVAR |

Por compatibilidad con Fase 1, la API admite reafirmar SUSPENDIDO, VENCIDO, ACTIVO (REACTIVAR) y CANCELADO con **otro** comando. Es una nueva orden auditada, con incremento de auth_version. La interfaz no ofrece estas reafirmaciones. Repetir el **mismo** command_id devuelve su resultado guardado: no cambia estado, no incrementa versión y no duplica el evento aplicado.

ACTIVAR reutiliza todos los requisitos Fase 2: cliente contratante activo, RUC/código únicos, sucursal principal, administrador inicial activo y asignación válida. REACTIVAR conserva las comprobaciones de vigencia, empresa activa y administrador asignado. No convierte un alta pendiente en activa. Una fecha de vencimiento ya cumplida sigue impidiendo la reactivación; esta fase no cambia fechas de vigencia.

VENCER es una orden explícita. No hay cron ni vencimiento automático.
Una recuperación de CANCELADO debe diseñarse como procedimiento especial futuro; no existe un atajo habilitado.

## API WEB

Prefijo /api/internal/admin/v1. Siempre requiere JWT de servicio de corta duración, firma HS256, issuer/audience de servicio y scope correspondiente. Un JWT de usuario WEB no sirve.

| Método / ruta | Scope | Situación |
| --- | --- | --- |
| GET /empresas/:id/estado | empresas:read | Reutilizado |
| POST /empresas/:id/suspender | empresas:suspender | Reutilizado, política central |
| POST /empresas/:id/reactivar | empresas:reactivar | Reutilizado, política central |
| POST /empresas/:id/cancelar | empresas:cancelar | Nuevo |
| POST /empresas/:id/vencer | empresas:vencer | Nuevo |
| POST /empresas/:id/activar | empresas:activar | Fase 2, valida política central |

Los cambios exigen command_id UUID y motivo. Suspender y cancelar exigen motivo no vacío de máximo 500 caracteres. Vencer admite omitir el motivo y usa “Vencimiento administrativo explícito.” El Panel proporciona un motivo estándar para reactivar.
El administrador opcional es un identificador de 3–40 caracteres (letras, números, punto, guion o guion bajo). En el Panel se obtiene de la sesión local; el navegador no puede suplantarlo en el cuerpo.

Cada cambio se ejecuta en transacción, con bloqueo del command_id y de la empresa. Cambiar estado, incrementar auth_version y registrar acciones_admin es una única operación: si falla la auditoría, el cambio se revierte. El fingerprint detecta reutilizar un comando para otra empresa, motivo o acción.
Se mantienen los fingerprints originales de activación de Fase 2 para recuperar confirmaciones perdidas de altas anteriores; el administrador es metadato de auditoría y no altera ese fingerprint histórico.

## API local del Panel

Todas las rutas siguientes requieren sesión administrativa. Los POST exigen Origin local y JSON, reutilizando la protección existente.

- GET /api/web/estados/empresas: q, estado, page y page_size (1–100).
- GET /api/web/estados/historial: empresa, accion, resultado, fecha (YYYY-MM-DD UTC), page y page_size.
- POST /api/web/estados/empresas/:id/consultar: cuerpo vacío.
- POST /api/web/estados/empresas/:id/activar.
- POST /api/web/estados/empresas/:id/suspender.
- POST /api/web/estados/empresas/:id/reactivar.
- POST /api/web/estados/empresas/:id/vencer.
- POST /api/web/estados/empresas/:id/cancelar.
- POST /api/web/estados/empresas/:id/reintentar: command_id de esa empresa.

Los POST de acciones admiten solo motivo; el Panel genera el UUID y fija el administrador. La activación reutiliza el command_id persistido del alta Fase 2.

## Sincronización, reintentos y conciliación

web_state_commands conserva el comando, empresa local/remota, acción, administrador, motivo, antes/después, intentos, fecha, error seguro y resultado:
SOLICITADO → PENDIENTE → APLICADO o ERROR.

El estado local y el estado confirmado WEB solo cambian tras recibir y validar la respuesta (empresa, command_id, estado y auth_version). Una caída antes o después del COMMIT remoto conserva la orden sin confirmar y mantiene el estado local anterior. La orden persiste más allá del objeto de servicio; se probó recuperación creando otro orquestador sobre la misma SQLite de prueba.

Solo puede existir una orden sin confirmar por empresa. El reintento utiliza el mismo UUID, motivo y administrador originales. Los rechazos definitivos HTTP 4xx se registran como ERROR no reintentable; requieren revisar el estado y el motivo. Los errores de comunicación/5xx son reintentables.

CONSULTAR obtiene el estado real con GET, registra fecha de última consulta/confirmación y compara:
- iguales: SINCRONIZADO;
- diferentes: DESINCRONIZADO;
- sin consulta/confirmación: SIN_CONSULTAR.

La consulta no inventa una confirmación del comando pendiente ni sobrescribe el estado local deseado. Tras un replay se vuelve a consultar WEB: un resultado histórico no reemplaza una versión remota más reciente. Si otro operador cambió el estado después del comando original, se conserva DESINCRONIZADO aunque el comando original conste APLICADO. No se implementó todavía adopción automática del estado remoto ni recuperación especial de cancelaciones.

El campo estado de web_empresas conserva el progreso del alta Fase 2 (PENDIENTE/ACTIVO). El estado administrativo se guarda por separado en estado_local, con fallback al progreso de alta mientras no haya acciones Fase 3. estado_web es la última confirmación o consulta; la pantalla identifica explícitamente cuando todavía no existe. No se reconstruyó ni eliminó la tabla Fase 2.

## Sesiones y conservación de datos

Se reutilizan auth.js, company-access.js y los controles transaccionales de Fase 1.
SUSPENDER, VENCER y CANCELAR incrementan auth_version:
- la siguiente solicitud autenticada se rechaza;
- el nuevo login se rechaza;
- REACTIVAR incrementa nuevamente la versión y no revive tokens anteriores;
- un login nuevo es necesario después de la reactivación.

Las operaciones no eliminan empresa, usuarios, sucursales, productos, ventas, compras ni inventario. Las pruebas comparan hashes de todas las tablas operativas de la fixture, además de instantáneas de la empresa B.

## Historial y datos sensibles

WEB: acciones_admin mantiene una fila por comando aplicado, con antes/después, motivo, resultado JSON, fecha y actor_servicio. Para acciones Fase 3 el actor incluye panel-eduxfac:administrador; solicitudes antiguas sin identidad humana conservan el actor de servicio. Los intentos fallidos de cambios/activación se registran separadamente en acciones_admin_intentos, con código seguro y ERROR, después del rollback. Solicitudes no autenticadas o cuerpos inválidos se rechazan sin persistir su contenido.

PANEL: web_state_history registra cada hito SOLICITADO/PENDIENTE/APLICADO/ERROR y consultas, con administrador, motivo, estados y comando. Un reintento puede añadir hitos de intento, pero no duplica la acción aplicada en WEB.
No se registran contraseñas, tokens, secretos, cuerpos HTTP ni mensajes de drivers. Los motivos son texto administrativo ingresado por el operador; no deben contener credenciales.

La interfaz Historial WEB filtra por empresa, acción, resultado y fecha UTC; muestra las horas en Lima. El selector de empresas carga las primeras 100 referencias, una limitación de esta vista simple. El listado pagina de 25 en 25; su filtro administrativo actual procesa referencias en memoria y requiere optimización antes de grandes volúmenes.

## Migraciones preparadas, sin ejecución real

WEB: database/migrations/003_estados_empresa.sql, después de 001 y 002.
PANEL: database/web-migrations/002_web_company_states.sql, después de 001_web_onboarding.
No se alteraron los archivos SQL originales de Fases 1/2.
El arranque normal del Panel no aplica ninguna migración WEB automáticamente.
prepareWebStateTestSchema solo puede utilizarse con NODE_ENV=test y database=':memory:'; cualquier base persistente se rechaza antes de abrirla.

No se deben iniciar pruebas con datos de clientes reales. La aplicación futura de migraciones y la configuración real del servicio quedan fuera de esta fase y requieren un entorno expresamente autorizado.

## Pruebas y verificación

Comandos ejecutados desde los respectivos proyectos oficiales de D:, con TEMP/TMP redirigidos a D: y NODE_ENV=test:

WEB: node --test --test-concurrency=1 tests/*.test.js
PANEL: node --test --test-concurrency=1 tests/*.test.mjs

Resultado final: WEB 90 aprobadas; PANEL 23 aprobadas; total 113 aprobadas, 0 fallidas, 0 omitidas.
Se preservaron las 63 pruebas anteriores sin editar sus archivos y se añadieron 50 entradas de prueba (38 escenarios WEB más su grupo; 9 escenarios HTTP Panel más su grupo y una prueba independiente).
Incluye: todos los estados solicitados; login/sesiones; aislamiento A/B; idempotencia; datos intactos; pérdida de respuesta tras COMMIT; conciliación; reintento tras recrear servicio; historial y filtros; respuesta ajena; JWT/scopes; CSRF; rollback de cancelar/vencer; activación fallida auditada; comando histórico con estado remoto posterior.

PGlite y SQLite nuevas de integración están en memoria. Las pruebas históricas del Panel usan exclusivamente SQLite de prueba temporal dentro de D:. El adaptador PGlite serializa conexiones: no sustituye una futura prueba de concurrencia con PostgreSQL nativo en preproducción.

Navegador controlado: fixture tests/helpers/ui-states-fixture.mjs, servidores loopback y bases RAM. Se comprobó:
- listado de dos empresas ficticias, estados, fechas, acciones y búsqueda por código;
- PENDIENTE con alta completa activa correctamente;
- motivo vacío impide enviar suspensión;
- error simulado después de COMMIT mantiene estado local y ofrece reintento;
- filtro ERROR, consulta DESINCRONIZADO y reintento SINCRONIZADO;
- suspensión/reactivación/vencimiento/cancelación y botones según estado;
- confirmaciones para las tres acciones críticas;
- CANCELADO solo consulta;
- historial con filtros por empresa/acción/resultado/fecha;
- presentación visual y consola sin errores.

Los servidores y pestaña de prueba se cerraron al finalizar.

## Respaldos e inventario

Respaldos previos, únicamente archivos modificados (sin ZIP):
- D:\EDUXFAC\EDUXFAC WEB\03_RESPALDOS\FASE3_PRE_ESTADOS_20261011_2106
- D:\EDUXFAC\PANEL EDUXFAC\03_RESPALDOS\FASE3_PRE_ESTADOS_20261011_2106

WEB modificados:
- server/src/admin-service-api.js
- server/src/onboarding-api.js

WEB nuevos:
- server/src/company-state-policy.js
- database/migrations/003_estados_empresa.sql
- tests/company-states.test.js
- tests/helpers/state-fixture.js
- tests/helpers/ui-states-fixture.mjs
- docs/FASE3_ESTADOS_EMPRESA.md

PANEL modificados:
- server/app.mjs
- server/web-api-client.mjs
- public/app.js
- public/index.html
- public/style.css

PANEL nuevos:
- server/web-company-states.mjs
- database/web-migrations/002_web_company_states.sql
- public/web-company-states.js
- tests/web-company-states.test.mjs
- docs/FASE3_ESTADOS_EMPRESA.md

auth.js, company-access.js, service-auth.js, el licenciamiento de escritorio y los archivos de pruebas previos se conservaron sin cambios.

## Pendientes y Fase 4

Esta fase entrega código, migraciones preparadas y pruebas; no habilita la integración en producción.
Antes de un uso real: autorizar y validar las migraciones en preproducción, configurar el canal de servicio y comprobar concurrencia con PostgreSQL nativo, sin utilizar secretos de prueba.
Queda por definir expresamente el alcance de Fase 4. Si corresponde a planes/límites, aún faltan el catálogo, asignación de plan por empresa y reglas de cupos; no fueron implementados. El vencimiento automático permanece reservado a Fase 5 según la solicitud.
No se implementaron pagos, precios, cobros, Yape, Culqi, dashboard completo, deploy ni migración definitiva del Panel a PostgreSQL.

No se leyó ni utilizó código histórico de C:. Solo se leyó el texto de solicitud y documentación de herramientas allí. Node/PowerShell del sistema son herramientas, no fuentes históricas.
No se tocó VPS, producción, PROPIO ni TECNICO. No se generaron secretos reales ni ZIP ni se ejecutaron migraciones sobre bases reales.
