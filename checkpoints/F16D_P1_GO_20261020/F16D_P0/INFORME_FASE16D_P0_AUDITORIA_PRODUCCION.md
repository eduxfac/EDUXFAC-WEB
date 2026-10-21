# FASE 16D-P0 — Auditoría de preparación Panel → WEB Producción

**Fecha:** 2026-10-19  
**Modalidad:** análisis local y preparación de auditoría de solo lectura  
**Estado:** PREPARADO; pendiente de ejecutar manualmente los dos scripts de evidencia en el VPS  

## 1. Alcance y resultado ejecutivo

Se revisaron localmente el maestro de EDUXFAC WEB, el maestro del Panel Central, las migraciones administrativas 001–006, la autenticación de servicio y la documentación técnica existente. No se accedió al VPS, no se consultó ni modificó PostgreSQL y no se llamó ninguna API productiva.

Conclusiones:

- **API administrativa en el maestro WEB:** **IMPLEMENTADA** para los ocho endpoints solicitados.
- **API administrativa realmente desplegada en `/var/www/eduxfac`:** **PARCIAL / NO CONFIRMADA** hasta ejecutar la auditoría de solo lectura preparada.
- **Migraciones 001–006 en el maestro WEB:** **PRESENTES**.
- **Migraciones 001–006 en `eduxfac_web_piloto`:** la documentación local indica que fueron aplicadas en el entorno piloto.
- **Migraciones 001–006 en `eduxfac` productiva:** **PARCIAL / NO CONFIRMADO**. La evidencia histórica local indica que producción quedó fuera de las aplicaciones piloto, pero el estado actual debe obtenerse desde PostgreSQL mediante el script de comparación.
- **Panel de producción independiente:** **SÍ es viable**, con base, proceso, URL, puerto, colas y configuración separados del piloto.
- El UUID piloto `37c1a5c0-7baa-4f52-b4a7-c06c33e1bca6` **NO debe utilizarse en producción**, ni para la empresa productiva ni para asociar el certificado real.

## 2. API administrativa interna del maestro WEB

Prefijo común: `/api/internal/admin/v1`.

| Método y ruta | Estado local | Archivo principal | Finalidad |
|---|---|---|---|
| `POST /clientes` | IMPLEMENTADO | `server/src/onboarding-api.js` | Alta del cliente administrativo |
| `POST /empresas` | IMPLEMENTADO | `server/src/onboarding-api.js` | Crea empresa y relación con cliente |
| `PUT /empresas/:id/plan` | IMPLEMENTADO | `server/src/commercial-api.js` | Asigna plan y límites comerciales |
| `POST /empresas/:id/sucursal-principal` | IMPLEMENTADO | `server/src/onboarding-api.js` | Crea sucursal principal |
| `POST /empresas/:id/administrador-inicial` | IMPLEMENTADO | `server/src/onboarding-api.js` | Crea administrador inicial |
| `PUT /empresas/:id/suscripcion` | IMPLEMENTADO | `server/src/subscription-api.js` | Registra vigencia/suscripción |
| `POST /empresas/:id/activar` | IMPLEMENTADO | `server/src/onboarding-api.js` | Activa la empresa tras validar requisitos |
| `GET /empresas/:id/operacion` | IMPLEMENTADO | `server/src/operations-api.js` | Consulta estado operativo consolidado |

El montaje y control común de las rutas se realiza en:

- `server/src/app.js`
- `server/src/admin-service-api.js`
- `server/src/service-auth.js`
- `server/src/company-access.js`

La conclusión **IMPLEMENTADO** describe el código maestro local. No acredita por sí sola que esos mismos archivos o hashes estén desplegados hoy en `/var/www/eduxfac`.

## 3. Flujo actual Panel → WEB

El Panel usa `server/web-api-client.mjs` para construir la base remota como:

`PANEL_WEB_SERVICE_BASE_URL` + `/api/internal/admin/v1`

El flujo de alta se coordina desde `server/web-onboarding-service.mjs`; la interfaz y las acciones del navegador se encuentran en `public/web-onboarding.js`. El entorno visual se declara en `server/environment-mode.mjs` mediante `EDUXFAC_DATA_MODE`, con valores admitidos `DEMO`, `PILOTO`, `PRODUCCION` o `NO_DECLARADO`.

La base propia del Panel se decide mediante `PANEL_DATABASE_URL` y `PANEL_DB_ENGINE`. La base de EDUXFAC WEB se decide, en el proceso WEB, mediante `DATABASE_URL`.

Hallazgo relevante: la tabla local `web_empresas` no contiene un destino de entorno por alta. El Panel usa un único `PANEL_WEB_SERVICE_BASE_URL` por instancia. Por eso no es seguro convertir el Panel piloto existente ni reutilizar sus borradores: debe crearse una instancia productiva separada.

## 4. Migraciones WEB 001–006

### 001 — `001_empresa_acceso.sql`

- **Crea:** `web_schema_migrations`, `empresa_acceso`, `acciones_admin`.
- **Modifica:** `empresas`, añadiendo `empresa_codigo`.
- **Índices:** unicidad normalizada de `empresa_codigo` y RUC; índices operativos de acciones.
- **Constraints:** estados, fechas, límites y `auth_version` de acceso.
- **Datos:** rellena empresas existentes con acceso inicial `PENDIENTE`.
- **RLS:** no incluida aquí.
- **Dependencia/orden:** primera de la serie; presupone tablas WEB base, incluida `empresas`.
- **Reversibilidad:** transacción explícita, pero sin migración `down`; el backfill y los objetos nuevos requieren restauración o reversión diseñada y ensayada.
- **Riesgo:** **ALTO** en producción por cambios de esquema, unicidad y backfill.

### 002 — `002_alta_clientes_empresas.sql`

- **Crea:** `clientes_admin`.
- **Modifica:** `empresas.cliente_admin_id`; `sucursales.es_principal`; `usuarios.es_administrador_inicial` y `usuarios.debe_cambiar_password`; permite `acciones_admin.empresa_id` nulo para comandos previos a una empresa.
- **Índices:** documento único de cliente, sucursal principal única, usuario normalizado e administrador inicial único.
- **Constraints:** validaciones de documento y ampliación de acciones administrativas.
- **RLS:** no incluida aquí.
- **Dependencia/orden:** requiere 001 y las tablas base `empresas`, `sucursales`, `usuarios`.
- **Reversibilidad:** sin `down`; eliminar columnas/índices después de uso podría perder relaciones.
- **Riesgo:** **ALTO**.

### 003 — `003_estados_empresa.sql`

- **Crea:** `acciones_admin_intentos` e índices de seguimiento.
- **Modifica:** constraint de acciones administrativas para incluir estados como cancelación y vencimiento.
- **RLS:** no incluida aquí.
- **Dependencia/orden:** requiere `acciones_admin` de 001.
- **Reversibilidad:** sin `down`; el historial creado no debe descartarse sin restauración.
- **Riesgo:** **MEDIO**.

### 004 — `004_planes_limites.sql`

- **Modifica:** `empresa_acceso` con `plan_codigo`, `multisucursal`, `condiciones_version`, `condiciones_updated_at` y `cuota_revision`.
- **Crea:** `eventos_comerciales`, función `verificar_cuota_empresa` y triggers de cuota para sucursales y usuarios.
- **Constraints/índices:** consistencia de condiciones, historial/indexación comercial y ampliación de acciones.
- **RLS:** no incluida aquí.
- **Dependencia/orden:** requiere 001–003 y tablas `sucursales`/`usuarios`.
- **Reversibilidad:** sin `down`; funciones y triggers deben revertirse en orden controlado.
- **Riesgo:** **ALTO**, porque introduce enforcement en escrituras normales.

### 005 — `005_suscripciones_vigencia.sql`

- **Modifica:** `empresa_acceso` con datos de suscripción y vigencia.
- **Crea:** `suscripcion_eventos`, unicidad por `(command_id, evento)`, función y trigger para historial inmutable.
- **Constraints:** coherencia de vigencia y ampliación de acciones administrativas.
- **RLS:** no incluida aquí.
- **Dependencia/orden:** requiere las entidades y eventos de las migraciones anteriores.
- **Reversibilidad:** sin `down`; preservar historial antes de cualquier reversión.
- **Riesgo:** **ALTO**.

### 006 — `006_operacion_workers.sql`

- **Crea:** `operacion_workers` y registra la versión aplicada.
- **RLS:** no incluida aquí.
- **Dependencia/orden:** requiere la infraestructura de migraciones creada en 001.
- **Reversibilidad:** sin `down`; objeto simple, pero debe verificarse su uso antes de revertir.
- **Riesgo:** **MEDIO**.

### RLS global

La RLS no forma parte de 001–006. Se prepara por separado en `server/scripts/global-rls.js`. Debe tratarse como una operación independiente de **RIESGO ALTO**, con simulación sobre una restauración aislada, inventario de políticas y prueba de todas las identidades de aplicación antes de considerar producción.

## 5. Comparación piloto contra producción

### Estado conocido

La documentación disponible permite afirmar que el trabajo piloto se dirigió a `eduxfac_web_piloto` y que `eduxfac` quedó fuera de esas operaciones. No permite afirmar el esquema actual exacto de producción al 2026-10-19. Por tanto, las diferencias exactas permanecen **PENDIENTES** hasta obtener evidencia directa y de solo lectura.

### Script preparado

`scripts/COMPARE_WEB_DATABASES_READONLY.sh`

Compara exclusivamente metadatos de:

- tablas;
- columnas, tipos, nulabilidad y valores predeterminados;
- índices;
- constraints;
- hashes de funciones públicas;
- activación/forzado de RLS;
- policies;
- marcador de entorno y hash de su comentario;
- versiones de `web_schema_migrations`, si existe.

Protecciones:

- exige conexiones separadas y verifica literalmente los nombres `eduxfac_web_piloto` y `eduxfac`;
- usa `SET default_transaction_read_only=on` y `BEGIN TRANSACTION READ ONLY`;
- no selecciona filas de tablas comerciales;
- no imprime URLs de conexión;
- rechaza ejecución como root;
- no sobrescribe evidencia previa;
- limpia su directorio temporal.

El archivo de evidencia es la única escritura prevista y ocurre en la ruta que indique el operador, no en PostgreSQL ni en `/var/www/eduxfac`.

## 6. Auditoría del código desplegado

### Script preparado

`scripts/AUDIT_WEB_PRODUCTION_READONLY.sh`

Comprueba en `/var/www/eduxfac`:

- existencia y SHA-256 de los archivos administrativos esperados;
- registro textual de las ocho rutas;
- nombre/versión y nombres de dependencias de `package.json`;
- archivos de package lock;
- presencia de módulos de autenticación, onboarding, comercial, suscripción y operación;
- nombres de variables presentes en `.env` y `.env.example`.

Los valores de configuración no se muestran; cada nombre se acompaña de `[SECRETO_OCULTO]`. El script no abre endpoints HTTP, no llama APIs, no reinicia servicios y no escribe dentro de la aplicación. Solo crea el archivo de evidencia solicitado por el operador.

## 7. Autenticación Panel → WEB

El diseño local usa JWT de servicio:

- **Algoritmo:** HS256.
- **Secret:** compartido mediante configuración privada; valor no inspeccionado ni documentado.
- **Issuer y audience:** configurables y validados por WEB.
- **Claims:** `sub`, `type=panel_service`, scopes, `iat`, `exp` y `jti`, además de issuer/audience.
- **TTL emitido por Panel:** 120 segundos.
- **Límite aceptado por WEB:** antigüedad máxima 5 minutos y `exp - iat` no mayor de 300 segundos.
- **Transporte:** HTTPS obligatorio, salvo HTTP loopback para comunicación interna en el mismo host.
- **Headers:** autorización Bearer; los comandos mutables incorporan identidad/idempotencia según el cliente y endpoint.
- **Validación:** firma, algoritmo, issuer, audience, tiempo, tipo de servicio, scopes y presencia de `jti`.
- **Idempotencia de escritura:** `acciones_admin` protege `command_id` y el hash de solicitud; repetir el mismo comando con contenido diferente debe rechazarse.
- **Replay:** el token contiene `jti`, pero el código revisado no muestra un almacén independiente de `jti` consumidos. Un token capturado podría repetirse durante su breve ventana si el comando usa otra clave de idempotencia. Esto requiere endurecimiento o aceptación explícita del riesgo antes de producción.

La infraestructura está implementada en el maestro. Su presencia y configuración en producción quedan **PENDIENTES** de la auditoría de `/var/www/eduxfac` y de una revisión posterior de nombres de variables, sin exponer valores.

## 8. Diseño recomendado del Panel de producción separado

| Elemento | Piloto existente | Producción propuesta |
|---|---|---|
| Base del Panel | `eduxfac_panel_piloto` | `eduxfac_panel_produccion` |
| Base WEB destino | `eduxfac_web_piloto` | `eduxfac` |
| Modo | `PILOTO` | `PRODUCCION` |
| Puerto | mantener el actual del piloto | `4320`, ligado a loopback |
| Proceso | proceso piloto actual | `EDUXFAC-PANEL-PRODUCCION` |
| URL posible | URL piloto actual | `https://admin-prod.eduxfac.com` |
| Almacenamiento/colas | propios del piloto | completamente separados |

Variables previstas para el Panel de producción, sin valores reales:

- `NODE_ENV=production`
- `EDUXFAC_DATA_MODE=PRODUCCION`
- `PANEL_DB_ENGINE=postgres`
- `PANEL_DATABASE_URL=[SECRETO_OCULTO]`
- `PANEL_PUBLIC_ORIGIN=https://admin-prod.eduxfac.com`
- `PORT=4320`
- `PANEL_WEB_SERVICE_BASE_URL=http://127.0.0.1:<PUERTO_WEB_PRODUCTIVO>` si ambos procesos comparten VPS; el puerto debe confirmarse.
- variables de secret, issuer y audience de servicio: `[SECRETO_OCULTO]`.
- workers productivos inicialmente deshabilitados hasta completar preflight y pruebas.

Variables previstas en WEB producción:

- `DATABASE_URL=[SECRETO_OCULTO]`, apuntando inequívocamente a `eduxfac`.
- `EDUXFAC_DATA_MODE=PRODUCCION`.
- issuer, audience y secret compatibles con la instancia productiva: `[SECRETO_OCULTO]`.

La separación exige release/carpeta, proceso, base, logs, URL, configuración, colas y copias de seguridad independientes. No deben copiarse filas de `web_empresas`, borradores, comandos ni UUID del Panel piloto. La empresa productiva debe obtener un UUID nuevo generado por el flujo productivo.

## 9. Backup y rollback requeridos antes de cambios futuros

1. **Backup de `eduxfac`:** `pg_dump` en formato custom, sin contraseña en línea de comandos ni salida visible.
2. **Integridad:** SHA-256, tamaño, timestamp UTC, versión de PostgreSQL y `pg_restore --list`.
3. **Prueba de restauración:** restaurar en una base aislada nueva y comprobar esquema/migraciones; no basta con que `pg_dump` termine correctamente.
4. **Snapshot del código:** archivo inmutable de `/var/www/eduxfac`, excluyendo o resguardando por separado secretos, con manifiesto SHA-256.
5. **Configuración:** inventario de nombres y copia cifrada/privada por el operador; nunca incorporar secretos al informe.
6. **Ensayo:** aplicar 001–006 en la restauración aislada, después validar APIs y finalmente ensayar RLS por separado.
7. **Rollback de migraciones:** restauración completa desde el backup validado o scripts de reversión específicos revisados y ensayados. No existe un `down` genérico seguro para backfills, triggers, constraints e historial.
8. **Rollback del Panel productivo:** detener solo el proceso nuevo, revertir su release/configuración y restaurar únicamente `eduxfac_panel_produccion`; el Panel piloto debe permanecer intacto.

## 10. Cambios futuros requeridos y riesgo

| Orden | Cambio futuro | Riesgo |
|---:|---|---|
| 1 | Ejecutar manualmente ambos scripts de solo lectura y archivar evidencia | BAJO |
| 2 | Resolver diferencias de código y esquema con base en esa evidencia | MEDIO |
| 3 | Crear y verificar backup/restauración aislada de `eduxfac` | MEDIO |
| 4 | Ensayar 001–006 en la restauración aislada | ALTO |
| 5 | Ensayar RLS global por separado y validar roles/conexiones | ALTO |
| 6 | Validar la API administrativa contra la base restaurada | MEDIO |
| 7 | Crear base y usuario dedicados para `eduxfac_panel_produccion` | MEDIO |
| 8 | Preparar release/proceso/puerto/logs del Panel productivo independiente | MEDIO |
| 9 | Configurar autenticación de servicio, red privada y TLS sin revelar secretos | ALTO |
| 10 | Validar salud y consultas sin escritura | BAJO |
| 11 | Autorizar una primera alta productiva controlada y obtener un UUID nuevo | ALTO |
| 12 | Asociar posteriormente el certificado real solo al UUID productivo verificado | ALTO |
| 13 | Activar workers/monitoreo/backup periódico tras validación | MEDIO |

## 11. Respuestas concretas

### A. ¿WEB producción ya contiene la API administrativa interna?

**PARCIAL.** El maestro local contiene los ocho endpoints. El despliegue productivo no fue inspeccionado en esta fase y debe confirmarse con `AUDIT_WEB_PRODUCTION_READONLY.sh`.

### B. ¿`eduxfac` tiene las migraciones necesarias?

**PARCIAL / NO CONFIRMADO.** Los archivos 001–006 existen en el maestro y la documentación confirma su uso en piloto. El esquema actual de `eduxfac` requiere la comparación de metadatos de solo lectura.

### C. ¿Qué diferencias exactas existen entre `eduxfac_web_piloto` y `eduxfac`?

**Pendiente de evidencia.** No se inventan diferencias a partir de documentación histórica. `COMPARE_WEB_DATABASES_READONLY.sh` producirá la lista exacta de tablas, columnas, tipos, índices, constraints, funciones, RLS/policies y versiones de migración, sin leer datos de clientes.

### D. ¿Puede crearse un Panel de producción independiente sin tocar el piloto?

**SÍ.** La configuración ya separa base local del Panel, destino WEB y modo de entorno. Debe desplegarse como instancia nueva con su propia base, puerto, proceso, URL, configuración, logs y colas; no debe convertirse ni reutilizarse la instancia piloto.

### E. Bloqueadores actuales

1. Falta confirmar el código realmente desplegado en `/var/www/eduxfac`.
2. Falta confirmar el esquema real de `eduxfac` frente a piloto.
3. Falta backup productivo probado mediante restauración aislada.
4. Falta ensayo de 001–006 y RLS sobre esa restauración.
5. Falta confirmar puerto/ruta interna del proceso WEB y nombres de variables de autenticación productiva.
6. Falta decidir y provisionar infraestructura independiente para el Panel productivo.
7. La protección de replay por `jti` no aparece como persistente; debe resolverse o aceptarse formalmente antes de habilitar escrituras productivas.

## 12. Scripts entregados

| Script | SHA-256 |
|---|---|
| `scripts/AUDIT_WEB_PRODUCTION_READONLY.sh` | `D43CE6803DABFAD0F05F6D71D98B280AE724B0984C10CB567A9792159D1B9DD9` |
| `scripts/COMPARE_WEB_DATABASES_READONLY.sh` | `6C77ACBB01588CD7ACE3B040ED7E64788EAA332DE229D318A54348D65B17E226` |

Los scripts quedaron preparados, pero **NO fueron ejecutados**.

## 13. Confirmación de cierre

**NO SE MODIFICÓ PRODUCCIÓN, VPS, BASES DE DATOS, PANEL PILOTO, CERTIFICADOS NI TRANSPORTE SUNAT/PSE.**

Esta fase no implementa ni despliega cambios. El siguiente paso requiere ejecución manual y controlada de las dos auditorías de solo lectura y revisión de sus archivos de evidencia.
