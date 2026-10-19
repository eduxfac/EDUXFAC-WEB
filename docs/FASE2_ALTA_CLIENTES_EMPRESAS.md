# Fase 2 · Alta de clientes y empresas WEB · 2026-10-11

## Estado
Implementada y validada exclusivamente en las fuentes oficiales de D:. No publicada. 51 pruebas WEB y 12 PANEL aprobadas; 63 en total, cero fallos. Las 31 pruebas originales de Fase 1 continúan aprobadas y sus archivos/fixture se conservaron sin cambios, comprobados por SHA256.

## Fuentes y respaldos
WEB: D:/EDUXFAC/EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL
PANEL: D:/EDUXFAC/PANEL EDUXFAC/01_TRABAJO_ACTUAL/PANEL_EDUXFAC_ACTUAL
Respaldo WEB: D:/EDUXFAC/EDUXFAC WEB/03_RESPALDOS/FASE2_PRE_ALTA_20261011_1709
Respaldo PANEL: D:/EDUXFAC/PANEL EDUXFAC/03_RESPALDOS/FASE2_PRE_ALTA_20261011_1709
Se respaldaron solamente los originales modificados: cuatro archivos WEB y seis PANEL. No se crearon ZIP.

## Modelo
El Panel reutiliza clients y añade identificación administrativa estable y documento normalizado. web_empresas almacena únicamente referencias del alta, datos administrativos, UUID remoto, estado, pasos confirmados e identificadores de comando. No almacena contraseñas, hashes de contraseñas, tokens, productos, ventas, compras, inventario ni caja.
WEB añade clientes_admin, completamente independiente de clientes (compradores de boticas). empresas recibe cliente_admin_id. sucursales y usuarios reciben indicadores de principal/administrador inicial, con índices únicos por empresa. usuarios.debe_cambiar_password obliga al cambio inicial antes de acceder a operaciones.
Un cliente puede vincular varias empresas. Se mantienen sin cambios los IDs y relaciones existentes de licencias de escritorio.

## Flujo y estados
1. Crear o seleccionar cliente existente en el Panel.
2. Guardar borrador administrativo local: PENDIENTE, sin contraseña ni conexión WEB.
3. Completar alta: crear/reutilizar referencia de cliente, crear empresa pendiente, crear principal y administrador. Cada confirmación se persiste antes de continuar.
4. Activar explícitamente solo cuando todos los pasos están confirmados y WEB valida sus relaciones y acceso.
5. Primer login del administrador: token restringido de quince minutos, válido únicamente para cambiar la contraseña temporal. Tras el cambio se emite la sesión normal.
Estado local de empresa: PENDIENTE / ACTIVO. Sincronización: PENDIENTE / CONFIRMADO / ERROR_DE_SINCRONIZACION. Completar no activa automáticamente. La interfaz separa EDUXFAC WEB de EDUXFAC ESCRITORIO y ofrece Empresas, Alta nueva, Guardar como pendiente, Completar alta y Activar.

## API interna nueva
Todos los endpoints permanecen bajo /api/internal/admin/v1 y requieren token de servicio, nunca JWT de cliente.
POST /clientes (clientes:crear)
POST /empresas (empresas:crear)
POST /empresas/:id/sucursal-principal (empresas:sucursal-principal)
POST /empresas/:id/administrador-inicial (empresas:administrador-inicial)
POST /empresas/:id/activar (empresas:activar)
Cada comando requiere command_id UUID estable y motivo. La empresa se crea en PENDIENTE. Activar comprueba cliente administrativo activo, principal, administrador inicial activo con asignación correcta, estado pendiente, RUC/código únicos y vigencia válida; incrementa auth_version y audita en la misma transacción.
Endpoint de usuario nuevo: POST /api/auth/password/change, con token restringido, contraseña temporal y nueva contraseña. No devuelve hashes. La contraseña nueva debe tener al menos doce caracteres y como máximo 72 bytes UTF-8 para evitar truncamiento de bcrypt.

## API local del Panel
GET /api/web/clientes?q=...
POST /api/web/clientes
GET /api/web/empresas
POST /api/web/empresas
POST /api/web/empresas/:id/completar
POST /api/web/empresas/:id/activar
Requieren sesión administrativa del Panel; POST conserva comprobación de Origin y JSON. El borrador rechaza cualquier campo de contraseña. Completar recibe la contraseña solo en memoria para transmitirla al backend WEB.

## Idempotencia y recuperación
El Panel conserva un command_id para cada paso en SQLite; los reintentos reutilizan el mismo. WEB serializa por comando y almacena su resultado en acciones_admin, con command_id único. Un comando repetido retorna su resultado sin duplicar recursos; reutilizarlo con otra operación o contenido se rechaza.
Los pasos confirmados no vuelven a enviarse. Si WEB confirma internamente pero la respuesta se pierde, el paso queda sin confirmar en el Panel y se reenvía el mismo comando. Se probó pérdida de respuesta después de crear el administrador: el nuevo orquestador retomó solo ese paso, sin duplicarlo.
Para reanudar un paso de administrador sin confirmar, reintroducir la misma contraseña temporal. No se conserva en el Panel. La auditoría WEB almacena una huella HMAC de comparación, sin contraseña ni hash bcrypt en sus resultados. La rotación del secreto durante ese paso requiere una estrategia de compatibilidad futura.
Si se pierde la respuesta de activación, el Panel puede seguir PENDIENTE con error aunque WEB haya aplicado ACTIVO; reintentar Activar con el mismo comando confirma el resultado, sin repetir el cambio. No se simula una transacción distribuida entre las dos bases.

## Orden de migraciones (no ejecutadas en bases reales)
WEB: esquema y actualizaciones históricas -> database/migrations/001_empresa_acceso.sql -> database/migrations/002_alta_clientes_empresas.sql.
PANEL: database/schema.sql -> database/migrations/001_licensing.sql -> database/web-migrations/001_web_onboarding.sql.
La nueva migración SQLite está separada del cargador de licencias y no se aplica en el arranque normal. El módulo exporta applyWebOnboardingMigrations para aplicación explícita y versionada; se probó únicamente con SQLite en memoria. prepareWebTestSchema solo admite NODE_ENV=test y database=:memory:, verificado antes de abrir la base.
Las migraciones históricas no se modificaron. Antes de una futura aplicación autorizada, revisar RUC/códigos, usuarios homónimos normalizados y documentos duplicados en una copia aislada. No se eliminan ni consolidan datos automáticamente.

## Inventario de archivos
Modificados WEB: server/src/app.js; server/src/auth.js; server/src/admin-service-api.js; public/index.html.
Nuevos WEB: server/src/onboarding-api.js; server/src/password-change.js; public/initial-password.js; database/migrations/002_alta_clientes_empresas.sql; tests/onboarding.test.js; tests/helpers/ui-fixture.mjs; docs/FASE2_ALTA_CLIENTES_EMPRESAS.md.
Modificados PANEL: server/app.mjs; server/web-api-client.mjs; public/app.js; public/index.html; public/style.css; README.md.
Nuevos PANEL: server/web-onboarding-service.mjs; public/web-onboarding.js; database/web-migrations/001_web_onboarding.sql; tests/web-onboarding.test.mjs; docs/FASE2_ALTA_CLIENTES_EMPRESAS.md.
server/src/app.js además reinicia su caché de esquema en cada inicialización explícita, corrigiendo el fallo detectado al probar sucesivas bases aisladas. El frontend del Panel recibió correcciones de contraste y navegación desplazable detectadas en la prueba visual.

## Validación
WEB: node --test --test-concurrency=1 tests/*.test.js -> 51 aprobadas.
PANEL: node --test --test-concurrency=1 tests/*.test.mjs -> 12 aprobadas.
Los temporales de las pruebas antiguas del Panel se redirigieron a tests/.tmp de D:. No se utilizó npm en esta fase.
35 archivos JavaScript/.mjs y cinco bloques inline pasaron validación de sintaxis. No faltan recursos estáticos. Los tests usaron PostgreSQL WASM PGlite en memoria y SQLite en memoria; las regresiones antiguas del Panel usaron únicamente SQLite temporal de prueba en D:.
Se verificaron alta completa, cliente comprador separado, contraseña hasheada, cambio inicial obligatorio, aislamiento A/B, rechazos de alta incompleta y referencias ajenas, RUC/código únicos, reintentos sin duplicados, persistencia de pasos, rechazo de JWT normal en todos los endpoints nuevos y suspensión/reactivación de Fase 1.
El navegador recorrió Guardar como pendiente -> Completar alta -> Activar -> listado ACTIVO/CONFIRMADO con datos ficticios. Todas las fixtures y pestañas temporales quedaron cerradas.

## Riesgos y siguiente fase
No se validó carga con múltiples conexiones PostgreSQL nativas; PGlite serializa una conexión. No se configuraron secretos reales, red ni producción. Las nuevas migraciones y configuración necesitan una aplicación posterior expresamente autorizada. El ZIP de deploy anterior no incorpora estos cambios.
La gestión de cambios de datos de un cliente ya sincronizado, recuperación de contraseña temporal perdida y compatibilidad de reintentos durante rotación de secretos quedan para ampliaciones posteriores.
Fase 3: controles de suspensión/reactivación desde la interfaz del Panel y conciliación de estados confirmados con WEB, según el alcance que se autorice. No se implementaron planes, cuotas por plan, pagos, vencimientos automáticos, facturación, Yape, Culqi ni dashboard completo.

## Confirmaciones
No se usó código fuente de C:. No se tocó VPS, producción, PROPIO ni TECNICO. No se generaron secretos de producción. No se ejecutaron migraciones en bases reales. SQLite real del Panel y su PEM no se abrieron; sus metadatos permanecen iguales. Los módulos de licenciamiento y firma conservan sus SHA256. No se generaron ZIP ni paquetes de deploy.
