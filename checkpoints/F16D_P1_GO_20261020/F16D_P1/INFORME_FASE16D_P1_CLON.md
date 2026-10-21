# FASE 16D-P1 — Ensayo de adopción WEB Producción en clon

**Fecha:** 2026-10-19  
**Estado:** artefactos preparados; ningún script ejecutado  
**Bases protegidas:** `eduxfac`, `eduxfac_web_piloto`  
**Clon futuro exclusivo:** `eduxfac_f16dp1_clone`

## Conclusión ejecutiva

El conjunto mínimo verificable para habilitar el flujo administrativo completo solicitado es **001–005**. Las migraciones 006 y 007 no son necesarias para crear, configurar, suscribir, activar y consultar una empresa:

- 006 agrega coordinación del worker de vencimientos; el worker debe quedar deshabilitado durante Etapa A.
- 007 cambia tipos/campos de costos y una vista comercial; queda fuera de onboarding.

RLS, roles de ejecución y el marcador de entorno no son creados por 001–007. `global-rls.js` administra policies y marcador, pero presupone que los roles ya existen y su instalador está restringido a laboratorio aislado. Por ello RLS no se incluye en la adopción mínima. La Etapa A conserva exactamente el perfil de acceso actual del clon y verifica que no cambien RLS, policies ni roles.

## Hallazgo sobre “008–020”

El maestro auditado contiene exactamente:

`001_empresa_acceso.sql` a `007_consistencia_costos.sql`.

No existen archivos administrativos `008`–`020` ni referencias a versiones con esos nombres en el maestro. La evidencia histórica local de `web_schema_migrations` enumera 001–007. La afirmación “001–020 aplicadas” puede corresponder a otro registro de migraciones, a fases operativas o a artefactos no presentes; no puede mapearse con seguridad a esta serie. F16D-P1 no inventa ni aplica 008–020.

## Matriz de migraciones

| Migración | Función | Depende de | Modifica existentes | Crea tablas | RLS / roles / policies | Onboarding | FE | Riesgo |
|---|---|---|---|---|---|---|---|---|
| 001 empresa_acceso | Estados y auditoría administrativa base | esquema WEB base | `empresas` | `web_schema_migrations`, `empresa_acceso`, `acciones_admin` | No | Sí | No | Alto: índice RUC único y backfill |
| 002 alta_clientes_empresas | Cliente contractual, relación, principal y admin inicial | 001 | `empresas`, `sucursales`, `usuarios`, `acciones_admin` | `clientes_admin` | No | Sí | No | Alto: índices únicos y nuevas FK |
| 003 estados_empresa | Cancelación/vencimiento y auditoría de fallos | 002 | constraint de `acciones_admin` | `acciones_admin_intentos` | No | Sí, porque activación registra fallos y el código incluye estados | No | Medio |
| 004 planes_limites | Planes, límites y enforcement de cuotas | 003 | `empresa_acceso`, `sucursales`, `usuarios`, `acciones_admin` | `eventos_comerciales` | No | Sí | No | Alto: triggers sobre altas |
| 005 suscripciones_vigencia | Vigencia, historial y suscripción | 004 | `empresa_acceso`, `acciones_admin` | `suscripcion_eventos` | No | Sí | No | Alto: historial inmutable y nuevas reglas |
| 006 operacion_workers | Coordinación del worker | 005 | No | `operacion_workers` | No | No para alta/consulta síncrona | No | Medio |
| 007 consistencia_costos | Precisión y trazabilidad de costos | esquema comercial existente | `lotes`, `venta_detalles`, `movimientos_inventario`, vista | No | No | No | No fiscal; comercial | Alto por vista/tipos |
| 008–020 | Sin artefacto local identificable | Desconocida | Desconocido | Desconocido | Desconocido | No evaluable | No evaluable | Bloqueado |

### Elementos solicitados que están fuera de la serie

- `web_schema_migrations`: creada por 001.
- marcador `PILOTO/PRODUCCION/DEMO`: lo establece el plan de `server/scripts/global-rls.js`; en el ensayo lo fija explícitamente el script de creación solo para el clon como `DEMO / F16D-P1_CLONE_ONLY`.
- roles `eduxfac_web_app`, migrator, service y backup: ninguna migración 001–007 los crea. `global-rls.js` exige cinco roles preexistentes y separados.
- RLS/policies: `server/scripts/global-rls.js`, separado de 001–007.
- `empresa_codigo`: 001.
- `cliente_admin_id`, `es_principal`, administrador inicial: 002.
- cambios fiscales: no se identificaron dentro de 001–007; la Etapa B debe partir de artefactos fiscales específicos y revisados, no de numeración supuesta.

## Etapa A — Administración y onboarding

Aplicar al clon, en orden, únicamente 001, 002, 003, 004 y 005. Mantener:

- RLS exactamente como esté en la copia de producción;
- workers deshabilitados;
- transporte SUNAT/PSE deshabilitado;
- certificado, SOL y P12 ausentes;
- marcador exclusivo del clon;
- ningún acceso del Panel piloto.

El ensayo automatizado usa `RUC 00000000000`, UUID reservados de prueba y nombres marcados `F16D-P1 ... CLON`. Todo ocurre dentro de una transacción que termina en `ROLLBACK`. No usa el RUC 20606624043 ni el UUID piloto.

La comprobación de idempotencia dentro del script valida la unicidad de `acciones_admin.command_id`. La semántica HTTP/JWT de replay debe validarse después ejecutando el candidato de código contra el clon; este paquete no declara esa prueba como realizada.

## Etapa B — Facturación electrónica

Queda totalmente separada. Antes de adoptarla se requieren inventario propio de migraciones fiscales, revisión de tablas y constraints fiscales, pruebas XML/firma offline y autorización específica. F16D-P1 no copia certificados, no usa P12/SOL y no contiene llamadas SUNAT/PSE.

## Scripts preparados

1. `F16D_P1_PRECHECK.sh`: solo lectura; valida herramientas, nombres fijos, ausencia del clon y migraciones disponibles.
2. `F16D_P1_CREATE_CLONE.sh`: exige `F16D_P1_ACK=CREATE_CLONE_ONLY`; crea backup lógico verificable, restaura el clon, lo marca y compara fingerprints.
3. `F16D_P1_APPLY_ADMIN_MIGRATIONS_CLONE.sh`: exige `F16D_P1_ACK=APPLY_TO_CLONE_ONLY`; aplica exclusivamente 001–005 y comprueba datos, RLS y roles.
4. `F16D_P1_VERIFY_CLONE.sh`: exige `F16D_P1_ACK=VERIFY_CLONE_ONLY`; comprueba integridad y ejecuta el alta ficticia transaccional con rollback.
5. `F16D_P1_DESTROY_CLONE.sh`: exige `F16D_P1_ACK=DESTROY_CLONE_ONLY`; valida el marcador y elimina exclusivamente la base clon, conservando backup y evidencias.

Todos fijan los nombres de las tres bases. Ninguno acepta nombres de base por parámetro. El script común valida identidades y marcador. Producción y piloto solo se consultan para backup/fingerprints; ninguna migración apunta a ellas.

## Candidato mínimo de código

Archivos nuevos necesarios:

- `server/src/admin-service-api.js`
- `server/src/onboarding-api.js`
- `server/src/service-auth.js`
- `server/src/commercial-api.js`
- `server/src/subscription-api.js`
- `server/src/operations-api.js`
- `server/src/company-access.js`
- `server/src/company-state-policy.js`
- `server/src/commercial-conditions.js`
- `server/src/subscription-calendar.js`
- `server/src/subscription-service.js`

Archivos existentes que necesitan integración puntual:

- `server/src/app.js`: importación, limitador y mount del prefijo administrativo.
- `server/src/db.js`: contexto de servicio y selección del pool de servicio; RLS se mantiene deshabilitada durante Etapa A.
- `package.json` y `package-lock.json`: solo si la evidencia productiva confirma ausencia de `jsonwebtoken` compatible.

No es seguro reemplazar el `app.js` productivo por el maestro completo, porque el maestro incluye cambios posteriores ajenos a esta adopción. Debe construirse un parche sobre la copia productiva exacta auditada.

## Autenticación y RLS

La API requiere JWT HS256 de servicio, issuer/audience, TTL corto, scopes y `jti`; los valores reales no forman parte del paquete. La idempotencia funcional se apoya en `command_id` y `request_hash`.

RLS no es obligatoria para que el flujo administrativo funcione con el perfil legado actual. Activarla simultáneamente aumentaría el alcance y el riesgo. Antes de una futura activación RLS deben crearse roles separados, ensayarse grants/policies y demostrar:

- el rol tenant solo accede a su empresa/sucursales;
- el rol service administra contratos pero no stock/ventas;
- el rol auth solo lee autenticación;
- ningún runtime role es owner, superuser o BYPASSRLS;
- el WEB existente sigue funcionando.

Si ese ensayo falla, el resultado debe ser **STOP / BLOQUEADOR**, sin intentar compensarlo en producción.

## Panel de producción separado

Diseño previsto:

- Panel productivo → `eduxfac_panel_produccion` → WEB productivo → `eduxfac`.
- Panel piloto → `eduxfac_panel_piloto` → WEB piloto → `eduxfac_web_piloto`.

La instancia productiva requiere proceso, puerto, URL, configuración, base, logs, colas y secretos separados. No debe importar `web_empresas`, comandos, borradores, IDs ni `empresa_web_id` del piloto.

## Riesgos para clientes productivos

| Riesgo | Mitigación del ensayo |
|---|---|
| RUC o códigos duplicados impiden 001 | El clon revela el fallo sin tocar producción; resolver duplicados requiere decisión separada |
| Backfill de `empresa_acceso` altera acceso lógico | 001 deja empresas existentes `PENDIENTE`; no desplegar código que exija ese estado hasta definir adopción de clientes existentes |
| Triggers de cuotas afectan altas normales | 004 se prueba con conteos/fingerprints y flujo ficticio; revisar planes de empresas existentes |
| Suscripción requerida por defecto | 005 puede bloquear si el código nuevo se activa sin estrategia para existentes |
| Reemplazo amplio de `app.js` | Prohibido; parche mínimo contra archivo productivo exacto |
| RLS rompe acceso actual | No se activa en Etapa A; ensayo separado obligatorio |
| Dependencia `jsonwebtoken` ausente | Confirmar antes; modificar manifests solo si resulta necesario |
| Diferencia entre producción y maestro | Backup, restauración, hashes y prechecks fail-closed |

## Prueba que demostraría migración sin pérdida

Se requiere que, en el clon:

1. el backup tenga SHA-256 válido y catálogo `pg_restore` legible;
2. la restauración coincida con fingerprints productivos;
3. 001–005 terminen sin errores y el registro contenga exactamente esas versiones;
4. conteos y hashes canónicos de empresas, sucursales, usuarios, productos, ventas y compras preexistentes permanezcan iguales;
5. PK, FK, índices y constraints sean válidos;
6. RLS, policies y roles no cambien;
7. el alta ficticia complete todas las relaciones y se revierta totalmente;
8. una ejecución posterior del candidato demuestre autenticación, scopes, idempotencia/replay y operación HTTP;
9. el WEB actual supere regresión funcional completa contra el clon;
10. el clon pueda destruirse sin afectar producción, piloto ni evidencias.

## Condiciones antes de crear CORPORACION NUEVA UNION S.A.C.

Antes de usar el RUC 20606624043 en producción deben completarse:

1. ensayo del clon con resultado GO;
2. prueba HTTP/JWT del candidato y regresión del WEB actual;
3. backup productivo restaurado y verificado;
4. estrategia explícita para empresas productivas existentes tras el backfill;
5. parche mínimo de código revisado sobre la versión productiva exacta;
6. Panel productivo independiente creado y validado;
7. autenticación de servicio y red privada verificadas;
8. autorización específica para migrar/desplegar;
9. alta mediante la API productiva, que debe generar un UUID nuevo;
10. comprobación de que el UUID nuevo no coincide con `37c1a5c0-7baa-4f52-b4a7-c06c33e1bca6`.

## Respuestas

**A. Conjunto mínimo exacto:** 001, 002, 003, 004 y 005.

**B. ¿Puede adoptarse sin migraciones fiscales?** **SÍ**, porque ninguna migración mínima toca facturación electrónica ni transporte fiscal.

**C. ¿RLS es obligatoria?** **NO** para la Etapa A compatible con el perfil legado. Sí es obligatoria para afirmar aislamiento a nivel PostgreSQL; debe ensayarse y aprobarse por separado.

**D. Archivos de código:** los once módulos nuevos listados, integración puntual en `app.js` y `db.js`, y manifests solo si falta `jsonwebtoken`.

**E. Riesgos:** unicidad RUC/código, backfill pendiente, cuotas, suscripción requerida, compatibilidad de código y futura RLS.

**F. Prueba sin pérdida:** restauración verificada, fingerprints iguales, migraciones exactas, alta ficticia revertida, regresión WEB y prueba HTTP/JWT posterior.

**G. Antes de Nueva Unión:** completar los diez requisitos anteriores y generar un UUID productivo nuevo.

**H. GO / NO-GO:** **GO para ejecutar exclusivamente el ensayo de base en el clon**, sujeto al precheck. **NO-GO para producción y NO-GO aún para desplegar el candidato**, hasta completar prueba HTTP/JWT y regresión contra el clon.

## Confirmación

**NO SE EJECUTÓ NINGÚN SCRIPT. NO SE MODIFICÓ VPS, PRODUCCIÓN, BASES DE DATOS, PANEL PILOTO, CERTIFICADOS, NGINX, PM2 NI TRANSPORTE SUNAT/PSE.**

## REVISIÓN FINAL PRE-EJECUCIÓN — 2026-10-20

La revisión fue completamente estática. No se interpretó ni ejecutó ningún archivo `.sh`, no se abrió una conexión SSH y no se realizó ninguna consulta PostgreSQL.

### Resultado por componente

| Componente | Resultado | Evidencia de seguridad |
|---|---|---|
| CREATE_CLONE | **APROBADO** | Backup lógico en formato custom, SHA-256, catálogo `pg_restore`, clon fijo, marcador antes y después de restaurar, fingerprints de producción/piloto y eliminación automática solo si el marcador del clon continúa válido |
| APPLY | **APROBADO** | Destino literal, marcador obligatorio antes de cada bloque, migraciones exactas 001–005, una sola transacción, `ON_ERROR_STOP`, ningún 006/007/008–020, comparación de filas comerciales, RLS y roles |
| VERIFY | **APROBADO** | Conteos y hashes canónicos de seis tablas, objetos esperados, versiones exactas, ausencia de 006–020, RLS/policies sin cambios, producción y piloto comparados, alta ficticia con `ROLLBACK` |
| DESTROY | **APROBADO** | Solo admite literalmente `eduxfac_f16dp1_clone`; rechaza producción, piloto, `postgres`, `template0`, `template1` y cualquier otro nombre; exige marcador de base y marcador local |
| COMMON/PRECHECK | **APROBADO** | Constantes `readonly`, usuario no root, dependencias, nombres exactos, integridad del manifiesto, rechazo de symlinks y evidencia sin sobrescritura |

### Defectos encontrados y corregidos

1. **Aplicación parcial de migraciones — ALTO.** Antes se ejecutaba cada archivo con su propio commit. Ahora se validan sus límites transaccionales, se eliminan únicamente los `BEGIN/COMMIT` exteriores y se aplican 001–005 dentro de una sola transacción combinada. Cualquier error revierte todo el conjunto.
2. **Identidad insuficiente durante APPLY — ALTO.** Se añadió comprobación externa del nombre/marcador antes de cada archivo y una comprobación SQL dentro del mismo flujo transaccional.
3. **Rollback automático de CREATE sin marcador — ALTO.** El marcador se coloca inmediatamente después de crear el clon. El manejador de error solo puede eliminar la base si nombre y marcador coinciden; de lo contrario conserva el estado para revisión.
4. **Comparación RLS incompatible con tablas nuevas — MEDIO.** La fotografía antes/después ahora compara RLS y policies de las tablas preexistentes. VERIFY comprueba por separado que las tablas administrativas nuevas no recibieron RLS ni policies inesperadas.
5. **Verificación incompleta del esquema — ALTO.** VERIFY ahora exige las seis tablas administrativas, columnas, índices, constraints y triggers previstos; exige exactamente 001–005 y rechaza `operacion_workers` o cualquier versión adicional.
6. **Verificación piloto limitada al marcador — MEDIO.** Se añadieron conteos y hashes canónicos del contenido comercial piloto antes y después, sin mostrar filas ni datos personales.
7. **Protección de rutas — MEDIO.** Se rechazan symlinks en el paquete y en el directorio persistente, se validan rutas literales y el backup/checksum deben ser archivos regulares.
8. **DESTROY dependía principalmente del nombre — ALTO.** Ahora hay lista explícita de bases protegidas, comparación literal exclusiva, marcador PostgreSQL y marcador local, todos obligatorios antes de terminar sesiones o ejecutar `dropdb`.

### Riesgos de compatibilidad de 001–005

| Migración | Riesgo | Nivel | Condición |
|---|---|---|---|
| 001 | Índice único sobre `btrim(ruc)` | **ALTO / BLOQUEADOR CONDICIONAL** | Falla si existen RUC no vacíos duplicados tras normalización |
| 001 | Índice único sobre código normalizado | Bajo en adopción inicial | La columna es nueva y comienza `NULL`; puede fallar más adelante si se cargan códigos duplicados |
| 001 | Backfill de `empresa_acceso` | **ALTO semántico** | Conserva empresas, pero crea acceso `PENDIENTE` para todas; el código nuevo no debe imponerse a clientes actuales sin estrategia de adopción |
| 001–005 | `ALTER TABLE` e índices no concurrentes | **ALTO en producción** | Pueden tomar locks; el ensayo en clon no mide una ventana segura de despliegue productivo |
| 002 | Usuario único por `lower(btrim(usuario))` | **ALTO / BLOQUEADOR CONDICIONAL** | Falla si una empresa posee usuarios diferenciados solo por mayúsculas o espacios |
| 002 | Nuevas FK y columnas | Bajo | Columnas nuevas admiten `NULL`; `es_principal` y flags de usuario tienen default `false` |
| 004 | Constraint comercial | Medio | Los registros backfill con plan `NULL` y versión `0` son válidos; planes parciales preexistentes serían bloqueadores si ya existieran columnas equivalentes |
| 004 | Triggers de cuota | Alto funcional | Afectan futuras altas/activaciones de sucursales y usuarios; deben probarse con el comportamiento productivo actual |
| 005 | Suscripción requerida por defecto | **ALTO semántico** | Empresas existentes quedan con suscripción requerida y `PENDIENTE`; desplegar el guard sin adopción previa podría impedir accesos |
| 005 | Índice único de suscripción e historial inmutable | Medio | Los nuevos valores comienzan `NULL`; el trigger impide actualizar/borrar el historial futuro |

Los dos bloqueadores de datos que deben descartarse en el clon son los RUC normalizados duplicados y los usuarios normalizados duplicados. La ejecución de 001/002 falla de forma atómica si existen. Incluso si no existen duplicados, los estados `PENDIENTE` y la suscripción requerida exigen una política explícita antes de producción.

### Backup

- Se genera antes de crear el clon mediante `pg_dump -Fc --serializable-deferrable`.
- No usa `.env`, URLs ni contraseñas en argumentos o logs.
- El archivo se crea con `umask 077`, fuera de la base que elimina DESTROY.
- Se verifica con SHA-256, `pg_restore --list` y una restauración completa.
- DESTROY conserva backup, manifiesto y evidencias.
- CREATE rechaza un directorio de trabajo existente y nunca sobrescribe un backup anterior.

### Candidato de código

El candidato contiene doce archivos fuente: los once módulos administrativos documentados y `db.js` para el contexto de servicio. No contiene referencias a SUNAT, PSE, P12, certificados ni transporte fiscal. `app.js` no se incluyó como reemplazo: `INTEGRATION_NOTES.md` define únicamente el import y mounts que deberán integrarse sobre la copia productiva exacta. `package.json` y `package-lock.json` solo cambiarían si la auditoría productiva confirma que falta `jsonwebtoken`.

### SHA-256 final de scripts

| Archivo | SHA-256 |
|---|---|
| `F16D_P1_COMMON.sh` | `0B88049F51B9F7AA6DABFCE1237D4F429150EBF178F642F64EF3D3E383006ED2` |
| `F16D_P1_PRECHECK.sh` | `1634402A97604B262AE3430FE7C22F80078699FCDE6A68F63FC8546228F9568D` |
| `F16D_P1_CREATE_CLONE.sh` | `F0B00AE106C5D32150DCB3592A823382C6FC7A21693E1A920CE8CC9F8421E746` |
| `F16D_P1_APPLY_ADMIN_MIGRATIONS_CLONE.sh` | `33396B4325269C7ED620DC9B24A90643969719375579B67E9372C65A6762A66D` |
| `F16D_P1_VERIFY_CLONE.sh` | `A364874C15E4CBFCBFE89E669DA7D89690D329BEA185D49EDD1E7783E4FB25FB` |
| `F16D_P1_DESTROY_CLONE.sh` | `F69BFF520A9DA6FE879BF00AD80744C5674C8EBF872D693FBB617336229FBFF4` |

### SHA-256 de migraciones inalteradas

| Archivo | SHA-256 |
|---|---|
| `001_empresa_acceso.sql` | `BF3CA01919E289E266CA2512ABB781D4A3CEE580BA0890A3095AE88A740AF53E` |
| `002_alta_clientes_empresas.sql` | `E6C5F96F0DE95603B1E4120EA80E80DEA804C66EC11691C25406F1424FAAE114` |
| `003_estados_empresa.sql` | `08D08C2CA3CBB4A15BC34C5FFBAF6AE65EA17A519B2B94AE1D848A2405A0A6C3` |
| `004_planes_limites.sql` | `9E6736AD4C736C2A5E1C5D3DDEC8B3241D43E24AFE823DB613BFB44A59BB3F40` |
| `005_suscripciones_vigencia.sql` | `53198793154DF0FB53EAA8BADB49ABA67BA535F78009E24B5C983F9F3EF2AFAF` |

### Veredicto

**GO_CLONE_EXECUTION**, limitado estrictamente al clon y sujeto a que PRECHECK resulte GO en el VPS. Este veredicto no autoriza producción ni despliegue de código.

**F16D-P1 REVISADA. NINGÚN SCRIPT FUE EJECUTADO.**
