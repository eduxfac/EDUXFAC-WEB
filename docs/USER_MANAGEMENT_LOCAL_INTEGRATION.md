# EDUXFAC USER MANAGEMENT — LOCAL WEB INTEGRATION

2026-11-05. Integración **exclusivamente local**, sin commit ni push. No es autorización para producción.

## Código y precheck

WEB_PATH=`D:\EDUXFAC_WEB_V2`.

PRECHECK_BRANCH=parche-italo; PRECHECK_WORKTREE_CLEAN=YES.

BASE_COMMIT=`de7b515552002fccb885360a565b407c089ae06f`.

FEATURE_BRANCH=`feature/panel-user-management`.

Se verificaron los hashes del paquete aprobado y de la UI Panel antes de aplicarlo. La rama conserva el baseline; los cambios están sin commit para revisión. No se sobrescribió trabajo WEB previo: el checkout estaba limpio.

Se añadieron seis archivos funcionales:

- `integrations/web-user-management/service.mjs`;
- `integrations/web-user-management/database.mjs`;
- `integrations/web-user-management/rate-limit.mjs`;
- `integrations/web-user-management/session-version.mjs`;
- `shared/web-user-diagnostics.mjs`;
- `database/migrations/014_web_user_administration.sql`.

Se modificaron cinco archivos aprobados:

- `server/src/admin-service-api.js`;
- `server/src/app.js`;
- `server/src/auth.js`;
- `server/src/password-change.js`;
- `server/scripts/global-rls.js`.

Este informe es el séptimo archivo nuevo. No se copiaron pruebas ni fixtures al runtime WEB. No se modificó la UI WEB ni la UI Panel aprobada; no se instalaron dependencias adicionales.

## Contrato integrado

| Componente | Listado | Reset |
|---|---|---|
| Panel local | GET `/api/web/empresas/:company/usuarios` | POST `/api/web/empresas/:company/usuarios/:user/reset-password` |
| WEB interno | GET `/api/internal/admin/v1/empresas/:company/usuarios` | POST `/api/internal/admin/v1/empresas/:company/usuarios/:user/reset-password` |

Se conserva el contrato probado: Panel traduce su empresa al UUID WEB, autoriza administrador/permiso y firma el contexto; WEB exige JWT/scopes y contexto coherente. No se añadió un alias público sin autenticación al WEB. Usuario desconocido o ajeno: **404 uniforme**, según decisión del administrador.

## Base y configuración local

DATABASE_HOST=127.0.0.1.

DATABASE_NAME=eduxfac_user_management_lab.

DATABASE_PORT=56335.

DATABASE_IS_PRODUCTION=NO.

NATIVE_PG_VERSION=PostgreSQL 16.15 Windows x64.

Clúster independiente: `D:\EDUXFAC_PANEL_V2\staging\pg16-user-security-164f28f6-c62a-4d66-a482-ee91842ba8ba`.

Se crearon clúster y base nuevos, con marcador `EDUXFAC_USER_MANAGEMENT_LOCAL_LAB`, y se comprobaron host, nombre, marcador y data directory antes de aplicar cambios. El servicio local anterior y su puerto 55432 no participaron. El bootstrap usa un propietario local generado; los logins runtime no son superusers.

Se aplicó el esquema WEB completo, sus upgrades y migraciones administrativas previas, el plan RLS global y 014. El arranque WEB se verificó con `initializeDatabase({migrate:false})` y los perfiles globales reales. Los fixtures respetan los triggers de condiciones comerciales/cuotas: acceso/plan se crean antes de sucursales/usuarios. No se deshabilitaron triggers o RLS para cargarlos.

Datos exclusivamente sintéticos: empresas A/B activas y P pendiente, RUC 99…, usuarios local_a1/local_a2/local_b1/local_p1, sucursales, suscripciones y administrador Panel de demostración. No se importaron productos, ventas, stock, usuarios, secretos o certificados de otra instalación.

Credenciales nuevas y distintas de `eduxfac_user_admin` y `eduxfac_user_authorizer`, con SCRAM. Propietario de funciones `eduxfac_user_admin_owner` sin LOGIN. Todos los roles dedicados son NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOINHERIT, sin membresías ni propiedad de tablas de negocio. Se conservan los grants mínimos aprobados; no se reutilizó el rol compartido para el adaptador.

Configuración local ignorada por Git y con ACL restringida al usuario Windows y SYSTEM:

- WEB `.env` y `.env.user-management-local.json`: URLs de esta base y secretos locales generados;
- WEB `runtime/user-management-local/cluster-admin.json`: control del clúster sintético, no credencial de producción;
- Panel `.env.user-management-local.json`: origen WEB loopback y SQLite local separado;
- Panel `staging/user-local-integration/panel.sqlite`: solo datos sintéticos.

El `.env` WEB local previo se conserva en un backup ignorado. No se muestra ninguna credencial generada en este informe. Se verificó que ninguno de esos archivos aparece en Git. No se copió `.env` del VPS ni se consultó producción.

Los endpoints y ambos procesos usan únicamente 127.0.0.1. El lanzador elimina configuración de integraciones heredada y bloquea fetch externos; CPE/Greenter sin URL, workers fiscal/expiración/reconciliación/integración OFF. El ensayo de navegador bloqueó la ruta del widget fiscal antes de llegar al servidor; no es una validación de SUNAT y no hubo llamadas a SUNAT/Greenter.

## Uso del entorno conservado

Desde PowerShell:

```powershell
Set-Location D:\EDUXFAC_PANEL_V2
node scripts/serve-user-management-local.mjs
```

Ese lanzador arranca únicamente el clúster marcado, valida su identidad y abre los dos componentes usando el código de sus repositorios reales:

- WEB: `http://127.0.0.1:56361`;
- Panel: `http://127.0.0.1:56362`.

Para solicitar apagado ordenado desde otra consola:

```powershell
New-Item -ItemType File -Force D:\EDUXFAC_PANEL_V2\staging\user-local-integration\stop.request
```

El archivo está en una carpeta con ACL restringida; no se añadió endpoint HTTP de apagado. El lanzador contempla un PID file residual comprobando `pg_ctl status` antes del arranque. Se verificó reinicio y persistencia de la contraseña definitiva, seguido de apagado ordenado. Los procesos quedaron **detenidos** al entregar; la BD y configuración se conservan. No hace falta rehacer setup ni volver a generar credenciales.

## Pruebas sobre la integración real

El E2E usó Chrome headless sobre el Panel y WEB de estos repositorios, con PostgreSQL nativo y SQLite persistentes del laboratorio:

1. Login Panel, listado de A1, reset desde el botón real, temporal visible y limpieza del modal al cerrarlo. Captura guardada con la temporal enmascarada; no se copió al portapapeles ni se serializó.
2. Contraseña anterior rechazada, temporal aceptada con debe_cambiar_password=true y sin acceso normal.
3. Formulario WEB real de cambio obligatorio; ningún token temporal se almacenó en localStorage. Después del cambio: sesión/contraseña definitiva válidas, temporal y tokens anteriores inválidos.
4. A2 de la misma empresa y B1 de otra conservaron acceso; auth_version de las empresas permaneció igual.
5. Empresa/suscripción PENDIENTE visibles con diagnóstico y sin activación automática.
6. HTTP con usuario B o UUID desconocido desde A: mismo 404/USER_NOT_FOUND. SQL con el rol dedicado: otro tenant invisible, contexto manipulado/sin contexto denegado.
7. Función de reset propia permitida dentro de transacción de prueba y revertida; reset de B e INSERT de auditoría falsificado denegados directamente en SQL. Esa prueba no sustituyó la contraseña definitiva.
8. Evento PASSWORD_RESET único de A1 con actor/empresa/usuario/request/timestamp, sin password/hash/token. Versiones/hashes de A2/B1, estados y datos de negocio sin cambios. Ventas/productos/lotes/movimientos/caja/outbox permanecieron sin operaciones nuevas.

| Grupo final | Total | PASS | FAIL | SKIPPED |
|---|---:|---:|---:|---:|
| Regresión Panel + matriz/E2E nativos sobre checkout integrado | 260 | 257 | 0 | 3 |
| Regresión WEB: auth/usuarios/empresas/sucursales/suscripciones/tenant | 182 | 182 | 0 | 0 |
| E2E integrado persistente con navegador real | 8 | 8 | 0 | 0 |
| SQL directo sobre la base local persistente | 4 | 4 | 0 | 0 |
| Total | **454** | **451** | **0** | **3** |

SKIPPED=3 suites Panel de checkouts históricos ausentes: integration-operations, postgres-panel-native y web-subscriptions. EXCLUDED_HISTORICAL=3 casos fuera del total: dos manifiestos con rutas WEB antiguas y rollback Fase7 con respaldo externo ausente. No se cuentan como PASS. Las 25 pruebas nativas incluidas en Panel no se suman dos veces. Las siete suites WEB funcionales usan fixtures en memoria; el esquema/RLS y E2E integrados se verificaron además en PG16 nativo.

Evidencias: `D:\EDUXFAC_PANEL_V2\staging\user-local-integration\e2e-results.json`, sql-results.json, restart-verification.json, integration-final.json y capturas panel-reset-masked.png / web-final-session.png. Regresiones en staging/user-management-review y staging/preintegration. Todos esos datos de laboratorio están ignorados por Git.

## Resultado de entrega

```text
WEB_PATH=D:\EDUXFAC_WEB_V2
FEATURE_BRANCH=feature/panel-user-management
BASE_COMMIT=de7b515552002fccb885360a565b407c089ae06f
ADAPTER_INTEGRATED=YES
ENDPOINTS_INTEGRATED=YES
LOCAL_DB_ONLY=YES
LOCAL_SERVICE_ROLE_CREATED=YES
LOCAL_SERVICE_CREDENTIAL_CREATED=YES
RLS_READ=PASS
RLS_RESET=PASS
RLS_AUDIT=PASS
RLS_CROSS_TENANT_SQL=PASS
RLS_CROSS_TENANT_HTTP=PASS
SESSION_REVOCATION_USER_ONLY=YES
E2E_LIST=PASS
E2E_RESET=PASS
E2E_FORCE_CHANGE=PASS
E2E_FINAL_LOGIN=PASS
PENDING_COMPANY_DIAGNOSTIC=PASS
TOTAL_TESTS=454
PASS=451
FAIL=0
SKIPPED=3
EXCLUDED_HISTORICAL=3
PRODUCTION_DB_MODIFIED=NO
REAL_USERS_MODIFIED=NO
VPS_MODIFIED=NO
SUNAT_CALLED=NO
GITHUB_PUSHED=NO
COMMIT_CREATED=NO
READY_FOR_LOCAL_COMMIT=YES
READY_FOR_GITHUB_PUSH=NO
READY_FOR_PRODUCTION=NO
```

BLOCKERS de esta integración local: ninguno pendiente. No se convierte en GO de producción ni certifica fiscalidad, servicios remotos, concurrencia multinodo o las pruebas históricas omitidas.

RECOMMENDED_NEXT_STEP=Revisar el diff WEB de esta rama y autorizar un commit local del cambio integrado. Mantener credenciales/configuración/datos de laboratorio fuera del commit. No push, deploy ni producción.
