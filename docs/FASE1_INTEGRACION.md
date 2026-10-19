# Fase 1 PANEL → WEB · 2026-10-11

Implementación local en las fuentes oficiales de D:. No existe despliegue ni configuración real del servicio.

## Archivos existentes modificados

WEB: server/src/app.js, server/src/auth.js, server/src/db.js, server/src/inventory-entry.js, public/index.html, .env.example, package.json y package-lock.json.
PANEL: README.md.

## Archivos nuevos

WEB: server/src/company-access.js, server/src/tenant-guard.js, server/src/service-auth.js, server/src/admin-service-api.js, database/migrations/001_empresa_acceso.sql, tests/helpers/isolated-web.js, tests/tenant-isolation.test.js, tests/admin-service-api.test.js y este documento.
PANEL: server/web-api-client.mjs y .env.example.

## Respaldo previo

D:/EDUXFAC/EDUXFAC WEB/03_RESPALDOS/FASE1_PRE_INTEGRACION_20261011_0833
D:/EDUXFAC/PANEL EDUXFAC/03_RESPALDOS/FASE1_PRE_INTEGRACION_20261011_0833
Se conservaron solamente originales modificados. No se crearon ZIP.

## Migración explícita

001_empresa_acceso añade empresa_codigo, índices únicos normalizados de código y RUC, empresa_acceso, acciones_admin y registro web_schema_migrations. No se añadió al arranque automático ni a las migraciones históricas. Solo se ejecutó sobre PostgreSQL PGlite en memoria durante las pruebas.

Antes de aplicarla en otro entorno, revisar RUC/códigos duplicados, preservar respaldo y definir la activación autorizada de las empresas existentes. Se crean accesos PENDIENTE; no se activan automáticamente. La fuente modificada bloquea acceso si falta el esquema. Los JWT antiguos sin auth_version/tipo/audience deben renovarse mediante login. El alta pública global /api/setup/complete está cerrada: altas completas quedan para Fase 2.

## API interna

GET /api/internal/admin/v1/health
GET /api/internal/admin/v1/empresas/:id/estado
POST /api/internal/admin/v1/empresas/:id/suspender
POST /api/internal/admin/v1/empresas/:id/reactivar

Token HS256 exclusivo de servicio, issuer/audience/tipo/subject/permisos y duración máxima de cinco minutos. Los ejemplos falsos se rechazan fuera de NODE_ENV=test. El cliente del Panel firma tokens de dos minutos y no realiza conexiones al importarse. No está integrado al arranque ni a la interfaz. No carga archivos .env automáticamente.

Los cambios requieren command_id UUID y motivo. Se serializan por comando, se verifica la identidad del reintento y se cambian estado/auth_version junto a la auditoría en una transacción. Un reintento no incrementa nuevamente la versión. Reactivar exige empresa habilitada, vigencia válida, sucursal activa y administrador activo asignado; no completa altas PENDIENTE ni restaura CANCELADO.

## Pruebas

Ejecutar desde la fuente WEB: npm test. Se utiliza @electric-sql/pglite como dependencia de desarrollo: PostgreSQL WASM en memoria, sin DATABASE_URL, sin conexiones PostgreSQL externas y con credenciales de prueba claramente falsas. La fixture carga el esquema de esta misma fuente y las migraciones históricas en memoria. Omite únicamente CREATE EXTENSION pgcrypto porque gen_random_uuid ya existe en PostgreSQL core.

Las pruebas realizan HTTP en 127.0.0.1 con puerto efímero y verifican las dos empresas, rollback de referencias ajenas, operaciones válidas, bloqueo de sesiones, independencia de B, JWT de cliente rechazado, permisos de servicio, idempotencia y rollback de auditoría. No ejecutan los tests antiguos del Panel ni abren su SQLite/PEM.

PGlite utiliza una única conexión serializada. La carga y concurrencia de varias conexiones PostgreSQL nativas requieren una validación futura en un entorno aislado, antes de publicar. También quedan pendientes rate limiting operativo, restricciones de red/HTTPS y controles de base más amplios como RLS.

## Alcance pendiente

Fase 2: altas completas de cliente/empresa/sucursal/administrador, interfaz del Panel y confirmaciones persistentes de integración. No se implementaron planes comerciales, pagos, vencimientos automáticos ni dashboard; fechas y límites son solo campos preparatorios del acceso. SQLite y licenciamiento de escritorio permanecen sin cambios.

## Incidencia de herramientas

El primer intento fallido de npm test generó un registro automático en C:/Users/CASTILLO/AppData/Local/npm-cache/_logs/2026-10-11T13_44_10_372Z-debug-0.log. No se utilizaron fuentes antiguas de C:. La instalación y las siguientes ejecuciones npm usaron caché y temporales en D:. No se eliminó ese registro.

## Resultado final verificado

31 comprobaciones aprobadas, 0 fallos. Sintaxis válida en 20 archivos JavaScript WEB, el cliente .mjs del Panel y cinco bloques inline del frontend. Empresa B conservó su snapshot durante suspensión/reactivación de A. La sesión anterior de A queda revocada y requiere nuevo login. JWT de cliente rechazado en los cuatro endpoints internos. Migración y rollback validados solo en memoria.
