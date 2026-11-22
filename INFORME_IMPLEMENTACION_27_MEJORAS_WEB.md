# EDUXFAC WEB — Informe de implementación de 27 mejoras

## Cierre del bloque aprobado en localhost — 15/11/2026

Edwin confirmó manualmente F15, F26 y CASH_STATE_SALES_SYNC. La aprobación visual anterior de F50/F55 se conserva; sus archivos y prueba coinciden exactamente con los SHA-256 aprobados.

F26 DEMO: 7 filas leídas, 6 procesadas, 4 modificadas, 2 sin cambios, 1 omitida y 4 movimientos registrados en Kardex, con resultado final correcto según la validación del propietario.

Regresión completa final de 58 archivos de pruebas: **785 pruebas; 784 PASS, 0 FAIL y 1 SKIP**. El SKIP es el ensayo opcional preexistente de índices concurrentes, no una mejora pendiente. Las pruebas usan contenedores sin red y bases ficticias descartables.

Se revisaron exactamente **61 archivos**: el bloque original de 58 archivos, las correcciones aprobadas dentro de seis de esos archivos y tres pruebas nuevas. Este cierre solo actualiza documentación; no introduce modificaciones funcionales adicionales. La fuente local sigue basada en de7b515552002fccb885360a565b407c089ae06f, sin incorporar ni reemplazar main.

El propietario autorizó crear un commit local con identidad Edwin Castillo Gonzales <344611968+eduxfac@users.noreply.github.com> y publicar exclusivamente desarrollo/web-27-mejoras-20261115 en eduxfac/EDUXFAC-WEB. El hash y el resultado remoto se registran en el acta de cierre conservada en D:. No se autoriza ni se ejecuta despliegue, migración productiva o acceso al VPS.

Los apartados de implementación siguientes documentan el desarrollo inicial y sus evidencias. Las aprobaciones de este cierre sustituyen sus estados pendientes únicamente para F15, F26, sincronización de caja y F50/F55; las demás validaciones manuales y la impresión física mantienen sus límites.


Fecha: domingo, 15 de noviembre de 2026, 9:55:45 a. m. PET.

## Resultado y alcance

Desarrollo local finalizado en la rama **desarrollo/web-27-mejoras-20261115**, basada exclusivamente en **de7b515552002fccb885360a565b407c089ae06f** (rama base desarrollo/web-base-produccion). Se implementaron las 27 mejoras autorizadas; 26 están IMPLEMENTADAS y F14 queda PENDIENTE DE PRUEBA por impresión física, con su implementación y simulación terminadas. No se autoriza producción con este resultado. La versión de package.json/lockfile permanece como en el código oficial.

Regresión final actualizada: **785 pruebas; 784 PASS, 0 FAIL y 1 SKIP**. Navegador real aislado: **11 comprobaciones PASS**. El SKIP corresponde únicamente al ensayo opcional preexistente de índices concurrentes, cuyo entorno específico no se configuró. No corresponde a una de las 27 mejoras.

La entrega inicial quedó sin commit por falta de identidad Git. En este cierre se configuró exclusivamente la identidad local proporcionada por Edwin y se autorizó commit y push de la rama de desarrollo. Se conservan el respaldo inicial, los parches y el inventario exacto de archivos en D:. No se modifica la configuración Git global ni se integra main.

## Protección previa y entorno de ejecución

Se verificó un árbol limpio en el commit oficial antes del trabajo y se creó una rama exclusiva. Respaldos anteriores a los cambios: [WEB_BASE_OFICIAL.zip](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/WEB_BASE_OFICIAL.zip) y [WEB_HISTORIAL.bundle](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/WEB_HISTORIAL.bundle); verificación de hashes en [RESPALDO_SHA256.json](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/RESPALDO_SHA256.json). El bundle conserva historial Git, sin push ni modificación de ramas remotas.

PANEL y GREENTER se consultaron como dependencias de arquitectura y fixtures, sin editar sus fuentes. Los tres repositorios oficiales recuperados siguen limpios en sus commits oficiales. Los 141 archivos del manifiesto congelado de Escritorio V52.1.0 conservan sus hashes. Evidencia: [INTEGRIDAD_FUENTES.json](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/INTEGRIDAD_FUENTES.json).

Las aplicaciones de prueba se copiaron a tmpfs dentro de contenedores nuevos descartables: red **none**, sin puertos publicados ni docker.sock, usuario sin root, raíz de solo lectura, todas las capacidades retiradas y no-new-privileges. Las fuentes se montaron solo lectura; PostgreSQL 16 se inició únicamente dentro del contenedor sobre datos ficticios y directorios efímeros, escuchando en loopback. PGlite también utilizó memoria. El navegador Chromium estuvo contenido en el mismo aislamiento. No se repitió una auditoría general de Docker ni se alteró la infraestructura APTO anterior.

Las imágenes preparadas fueron eduxfac-web-27-tests:20261115 (Node 24.22.2/PostgreSQL 16.15) y eduxfac-web-27-ui:20261115 (Chromium disponible en la imagen de laboratorio). Las dependencias de WEB/PANEL se instalaron en imágenes mediante npm ci --ignore-scripts con sus lockfiles; no se actualizó ninguna versión ni se instalaron paquetes en los proyectos. Los contenedores de prueba usan --rm.

## Estado individual de las 27 mejoras

| Fase | ID | Resultado funcional | Estado | Referencia | Pruebas principales |
|---|---|---|---|---|---|
| 1 | F17 | Cierre y consulta de cajas propias; Administrador de la misma sucursal con auditoría. | IMPLEMENTADA | [server/src/cash-daily.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/cash-daily.js) | web27-phase1.test.js / web27-phase6-native.test.js |
| 1 | F23 | Crear productos usa el permiso efectivo productsAdmin.crear tanto en interfaz como API. | IMPLEMENTADA | [server/src/app.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/app.js) | web27-phase1.test.js / catalog-frontend.test.js |
| 1 | F37 | Proveedor rápido y registro usan suppliers.crear; se mantiene el ámbito de empresa. | IMPLEMENTADA | [server/src/app.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/app.js) | web27-phase1.test.js |
| 1 | F54 | Autorización y redacción de costos/utilidades en servidor, API y exportaciones. | IMPLEMENTADA | [server/src/financial-access.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/financial-access.js) | web27-phase1.test.js / web27-phase7-native.test.js |
| 2 | F02 | Botones de presentación y campos de precio tienen selectores separados. | IMPLEMENTADA | [public/index.html](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/index.html) | web27-phase2.test.js / navegador |
| 2 | F03 | Validación explícita de vacío, signo, formato y precisión de precio; blur solo del input. | IMPLEMENTADA | [public/price-validation.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/price-validation.js) | web27-phase2.test.js / navegador |
| 2 | F26 | Estado verde/rojo explícito y contadores de procesados, cambios, sin cambios y omitidos. | IMPLEMENTADA | [public/price-validation.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/price-validation.js) | web27-phase2.test.js |
| 2 | F27 | Vista previa distingue vacío (omitir), cero y cantidades decimales WEB. | IMPLEMENTADA | [public/index.html](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/index.html) | web27-phase2.test.js / physical-count-rls-native.test.js |
| 3 | F35 | Registro documental persistente y bloqueo transaccional de nuevas compras duplicadas. | IMPLEMENTADA | [database/migrations/014_web27_purchase_identity.sql](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/database/migrations/014_web27_purchase_identity.sql) | web27-phase3.test.js / web27-history-native.test.js |
| 3 | F43 | Reposición con filtros por proveedor y stock cero, negativo o positivo. | IMPLEMENTADA | [server/src/purchase-requirement.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/purchase-requirement.js) | web27-phase3.test.js / purchase-requirement-native.test.js |
| 3 | F44 | Proveedor, costo, moneda y fecha proceden de la misma compra más reciente. | IMPLEMENTADA | [server/src/purchase-requirement.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/purchase-requirement.js) | web27-phase3.test.js / purchase-requirement-native.test.js |
| 3 | F45 | Refresco diferido durante edición; conserva borradores y descarta respuestas obsoletas. | IMPLEMENTADA | [public/purchase-requirement.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/purchase-requirement.js) | purchase-requirement-ui.test.js |
| 4 | F31 | Todas las filas de la importación inicial son accesibles mediante páginas y filtros. | IMPLEMENTADA | [public/index.html](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/index.html) | web27-phase4.test.js / initial-inventory-ui.test.js |
| 4 | F32 | Historial persistente, hash binario y semántico y reproducción del mismo lote sin duplicar stock. | IMPLEMENTADA | [server/src/initial-inventory.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/initial-inventory.js) | web27-phase4.test.js / initial-inventory-rls-native.test.js |
| 4 | F33 | Confirmación de existentes compatibles; conflictos maestros/precios/impuestos/inactivos se rechazan. | IMPLEMENTADA | [server/src/initial-inventory.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/initial-inventory.js) | web27-phase4.test.js / initial-inventory.test.js |
| 5 | F06 | Intento durable por empresa/usuario/sucursal; misma clave al reintentar; Web Locks entre pestañas. | IMPLEMENTADA | [public/sale-recovery.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/sale-recovery.js) | web27-phase5.test.js / web27-checkout-native.test.js / navegador |
| 5 | F07 | Procesando, confirmada y pendiente diferenciados; confirmación persiste tras refrescar búsqueda. | IMPLEMENTADA | [public/index.html](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/index.html) | web27-phase5.test.js / navegador |
| 6 | F15 | Apertura diaria en America/Lima con concurrencia y cajas históricas pendientes sin autocierre. | IMPLEMENTADA | [server/src/cash-daily.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/cash-daily.js) | web27-phase6-native.test.js / web27-history-native.test.js |
| 6 | F16 | Historial paginado, responsables, estados, detalle y cierre posterior autorizado. | IMPLEMENTADA | [public/cash-daily.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/cash-daily.js) | web27-phase6-native.test.js |
| 6 | F18 | Ingresos/retiros con motivo, responsable, UUID, auditoría y reintento idempotente. | IMPLEMENTADA | [server/src/cash-daily.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/cash-daily.js) | web27-phase6-native.test.js |
| 6 | F19 | Conciliación por medio y origen usando movimientos; efectivo físico separado de electrónicos. | IMPLEMENTADA | [server/src/cash-daily.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/cash-daily.js) | web27-phase6-native.test.js |
| 7 | F50 | Vista de productos vendidos por presentación, con paginación, filtros y exportación completa autorizada. | IMPLEMENTADA | [server/src/sales-product-report.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/sales-product-report.js) | web27-phase7-native.test.js |
| 7 | F52 | Inventario paginado sin truncamiento en 2000 y resumen de todo el filtro. | IMPLEMENTADA | [server/src/inventory-report.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/inventory-report.js) | web27-phase7-native.test.js |
| 7 | F53 | Inventario XLSX/PDF de todas las filas filtradas con columnas según permisos. | IMPLEMENTADA | [server/src/inventory-report.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/inventory-report.js) | web27-phase7-native.test.js |
| 8 | F14 | Ticket 80 mm ajustado y comprobado en Chromium; 58 mm conservado. Impresora física no probada. | PENDIENTE DE PRUEBA | [public/receipt-thermal.css](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/receipt-thermal.css) | navegador PASS; impresión física PENDIENTE |
| 8 | F48 | Curvas, etiquetas y tooltip accesible sin cambiar importes ni períodos del backend. | IMPLEMENTADA | [public/sales-chart.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/sales-chart.js) | monthly-sales-ui.test.js / monthly-sales-native.test.js / navegador |
| 8 | F55 | Alineación numérica, cabeceras, foco visible, tabla con desplazamiento y adaptación móvil. | IMPLEMENTADA | [public/reports-accessible.css](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/reports-accessible.css) | navegador y revisión de capturas |

## Decisiones y garantías técnicas

- **Permisos:** costo para Administrador/Almacén y utilidad/margen solo Administrador, resueltos sobre la sucursal efectiva. Un rol privilegiado en otra sucursal no concede acceso. Las salidas JSON se filtran en servidor y los exportadores omiten columnas y KPI no autorizados. La interfaz complementa esta protección. El acceso global exige autorización para las sucursales correspondientes. El cajero consulta/cierra sus propias cajas; Administrador de la sucursal puede intervenir y queda auditado.
- **Compras históricas:** se revisaron esquema y fixtures ficticias. No se consultaron registros comerciales reales. El registro documental escoge determinísticamente el primer propietario histórico, conserva todos los documentos anteriores y bloquea posteriores duplicados con rollback de la operación. La prueba detectó un ALTER TABLE con referencias diferidas pendientes: se añadió SET CONSTRAINTS ALL IMMEDIATE antes de activar la seguridad de tabla y se verificó nuevamente con duplicados históricos. Antes de cualquier despliegue será indispensable analizar los históricos reales de forma autorizada y de solo lectura.
- **Importación inicial:** se admiten hasta 5000 filas conforme al límite existente; la vista previa incluye todas y pagina de 100 en 100. La identidad semántica normaliza datos maestros y lotes agregados para reconocer el mismo contenido aunque cambien orden, nombre o formato del archivo. Una repetición devuelve el mismo batch_id y no aplica stock de nuevo. Los existentes compatibles requieren confirmación; diferencias de maestros, impuestos, mínimos/precio efectivo o estados inactivos se rechazan, sin sobrescribirlos ni reactivarlos. Se respeta también el precio general vigente cuando no hay precio de sucursal.
- **Ventas:** se reutiliza venta_checkout_comandos, el bloqueo transaccional y el hash existentes. El navegador conserva payload y command_id bajo empresa/usuario/sucursal; no guarda tokens ni nombres de clientes. Web Locks serializa pestañas. No se permite otro cobro mientras el intento siga pendiente. Un error de almacenamiento o incompatibilidad falla de forma segura. El replay valida también propietario y sucursal. Los rechazos definitivos liberan el intento; respuestas ambiguas, conflictos o pérdida de conexión lo conservan. Si se pierde la confirmación de COMMIT se devuelve 503 SALE_CONFIRMATION_REQUIRED, conservando la misma clave. El estado de venta se mantiene separado del estado fiscal. No se alteraron contratos ni conectores SUNAT.
- **Caja:** la fecha la determina PostgreSQL en America/Lima. Las aperturas nuevas usan control_diario y bloqueo de concurrencia; las históricas permanecen sin cierre automático y no sirven para nuevos cobros del día. La venta previamente confirmada puede recuperarse antes de exigir una caja nueva. Los cierres conservan movimientos, auditoría y responsable; la conciliación usa el ledger de caja una sola vez, sin sumar pagos nuevamente. Apertura y movimientos Efectivo determinan el físico esperado; Yape, Plin, tarjeta y transferencia se muestran por separado.
- **Reportes:** páginas y totales se obtienen en snapshots REPEATABLE READ de solo lectura. Inventario exporta todas las filas filtradas; se probó un catálogo de 2006 registros y un filtro con 2005 filas, XLSX completo y PDF de 48 páginas. La vista adicional de productos vendidos mantiene presentaciones separadas y filtros documentales existentes; su exportación tiene límite explícito de 50000 líneas, con rechazo y solicitud de acotar el rango. La búsqueda selecciona documentos y muestra todos sus productos, como informa la interfaz. La vista documental anterior sigue disponible.
- **Diseño:** el ticket nuevo se limita a 80 mm; se preserva 58 mm y texto fiscal. Las curvas usan los valores existentes: siete días y doce meses; no se copiaron períodos distintos de Escritorio ni cálculos Electron. Los controles conservan foco y acceso por teclado. La revisión visual corrigió solapamientos de SVG, cortes en botones y encabezado de cantidad.
- **F09 = NO:** no se migraron cálculos a BigInt/enteros escalados ni se cambiaron money(), costos, reglas de rentabilidad o afectación fiscal. initialSummary conserva exactamente el cuerpo original y su uso preexistente de BigInt; no es una incorporación de F09. package.json y package-lock.json están intactos.

## Migraciones preparadas y probadas exclusivamente en laboratorio

| Orden | Migración | Alcance y comprobación |
|---|---|---|
| 014 | [database/migrations/014_web27_purchase_identity.sql](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/database/migrations/014_web27_purchase_identity.sql) | Registro documental, trigger, RLS; preserva duplicados históricos, repetición y rechazo transaccional. |
| 015 | [database/migrations/015_web27_initial_imports.sql](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/database/migrations/015_web27_initial_imports.sql) | Historial de importación, hashes e identidad única por empresa/sucursal; replay, rollback y RLS. |
| 016 | [database/migrations/016_web27_daily_cash.sql](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/database/migrations/016_web27_daily_cash.sql) | Columnas e índices aditivos de caja diaria y operaciones manuales; sesiones antiguas y movimientos conservados tras repetición. |

Se integraron a initializeDatabase y a la clasificación de RLS. No se cambiaron los ledgers de producción ni se ejecutó SQL en bases reales. Los ensayos nativos incluyeron perfiles sin superusuario/BYPASSRLS, FORCE RLS y aislamiento de empresa/sucursal. Aplicar o revertir estos cambios en otro entorno requiere una orden posterior, respaldo validado y revisión de tiempos de bloqueo; no se preparó un despliegue automático.

## Pruebas ejecutadas

Los conteos por fase se solapan con la regresión general; no deben sumarse como pruebas distintas. Las fixtures históricas se adaptaron a los nuevos permisos, esquema y replay sin eliminar verificaciones de rollback, stock, tenant o fiscalidad.

| Ejecución | PASS | FAIL | SKIP | Evidencia |
|---|---:|---:|---:|---|
| FASE1 | 21 | 0 | 0 | [FASE1_TESTS.log](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/FASE1_TESTS.log) |
| FASE2 | 24 | 0 | 0 | [FASE2_TESTS.log](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/FASE2_TESTS.log) |
| FASE3 | 21 | 0 | 0 | [FASE3_TESTS.log](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/FASE3_TESTS.log) |
| FASE4 | 48 | 0 | 0 | [FASE4_TESTS.log](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/FASE4_TESTS.log) |
| FASE5 | 31 | 0 | 0 | [FASE5_TESTS.log](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/FASE5_TESTS.log) |
| FASE6 | 38 | 0 | 0 | [FASE6_TESTS.log](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/FASE6_TESTS.log) |
| FASE7 | 5 | 0 | 0 | [FASE7_TESTS.log](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/FASE7_TESTS.log) |
| RLS_NATIVO | 56 | 0 | 0 | [RLS_NATIVO_TESTS.log](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/RLS_NATIVO_TESTS.log) |
| CORRECCION_HISTORICOS_CATALOGO | 9 | 0 | 0 | [CORRECCION_HISTORICOS_CATALOGO_TESTS.log](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/CORRECCION_HISTORICOS_CATALOGO_TESTS.log) |
| COMMIT_SIN_CONFIRMACION_FINAL | 8 | 0 | 0 | [COMMIT_SIN_CONFIRMACION_FINAL_TESTS.log](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/COMMIT_SIN_CONFIRMACION_FINAL_TESTS.log) |
| REGRESION_ENTREGA_VERIFICADA | 759 | 0 | 1 | [REGRESION_ENTREGA_VERIFICADA_TESTS.log](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/REGRESION_ENTREGA_VERIFICADA_TESTS.log) |
| Chromium real aislado | 11 | 0 | 0 | [PRUEBAS_NAVEGADOR.json](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/PRUEBAS_NAVEGADOR.json) |
| Sintaxis de JS modificado/nuevo | 51 | 0 | 0 | [REVISION_ESTATICA.json](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/REVISION_ESTATICA.json) |

Regresión reproducible: [run-tests.ps1](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/run-tests.ps1), Phase REGRESION_ENTREGA_VERIFICADA con todos los tests/*.test.js, ejecutados secuencialmente dentro de la imagen sin red. Navegador: [run-browser.ps1](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/run-browser.ps1). Ambos runners copian código a almacenamiento efímero y usan exclusivamente identificadores, usuarios y datos ficticios.

Cobertura: permisos de Administrador/Cajero/Almacén y empresa/sucursal ajena; presentaciones y precios; faltantes/sobrantes/vacío/cero/decimales; compras e importaciones repetidas; cajas antiguas, concurrencia y cierres; conciliación; reportes completos, API y exportaciones; regresiones de devoluciones, rentabilidad, afectación IGV y contratos WEB-PANEL/CPE simulados. Los dos ensayos nativos de recuperación verifican simultaneidad, aborto HTTP y confirmación COMMIT perdida con registro/pago/stock únicos.

El único **SKIP** es tests/online-indexes-native.test.js: requiere EDUXFAC_INDEX_TEST_DATABASE_URL y no se asignó una base para ese ensayo opcional de mantenimiento preexistente. No se usó una URL desconocida ni se aplicaron índices a bases reales. La revisión estática pasó git diff --check y la comprobación final del índice pasó git diff --cached --check. Se normalizaron exclusivamente finales de línea CRLF/LF en dos migraciones nuevas, sin cambiar SQL.

Se conservaron logs de ejecuciones previas fallidas para trazabilidad (REGRESION_GENERAL, REGRESION_GENERAL_FINAL REGRESION_ENTREGA_FINAL y diagnósticos de fixtures). No son la certificación final. Se resolvieron el backfill con FK diferida, fixtures sin permisos/catálogos o esquemas esperados, la pérdida visual de confirmación tras buscar el tratamiento ambiguo de COMMIT y el agotamiento del tmpfs por clusters descartables acumulados; estos se eliminan exclusivamente de su UUID temporal tras detenerse. La tabla anterior y REGRESION_ENTREGA_VERIFICADA son los resultados definitivos.

Evidencia visual: [WEB27_REPORTES_DESKTOP.png](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/WEB27_REPORTES_DESKTOP.png), [WEB27_REPORTES_MOVIL.png](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/WEB27_REPORTES_MOVIL.png), [WEB27_DASHBOARD.png](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/WEB27_DASHBOARD.png), [WEB27_PENDIENTE_RECUPERABLE.png](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/WEB27_PENDIENTE_RECUPERABLE.png) y [WEB27_TICKET_80MM.png](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/WEB27_TICKET_80MM.png). [WEB27_TICKET_80MM_SIMULACION.pdf](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115/WEB27_TICKET_80MM_SIMULACION.pdf) es solo una simulación de impresión.

## Archivos creados y modificados

Todos pertenecen al checkout WEB autorizado. No se modificaron archivos de aplicación de otros proyectos. Las referencias siguientes permiten revisar el código completo; el manifiesto SHA-256 adjunto fija el contenido entregado.

| Acción | Archivo |
|---|---|
| CREADO | [database/migrations/014_web27_purchase_identity.sql](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/database/migrations/014_web27_purchase_identity.sql) |
| CREADO | [database/migrations/015_web27_initial_imports.sql](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/database/migrations/015_web27_initial_imports.sql) |
| CREADO | [database/migrations/016_web27_daily_cash.sql](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/database/migrations/016_web27_daily_cash.sql) |
| CREADO | [public/cash-daily.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/cash-daily.js) |
| CREADO | [public/financial-ui.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/financial-ui.js) |
| MODIFICADO | [public/index.html](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/index.html) |
| MODIFICADO | [public/monthly-sales.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/monthly-sales.js) |
| CREADO | [public/price-validation.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/price-validation.js) |
| MODIFICADO | [public/purchase-requirement.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/purchase-requirement.js) |
| CREADO | [public/receipt-thermal.css](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/receipt-thermal.css) |
| CREADO | [public/report-layout.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/report-layout.js) |
| CREADO | [public/report-paged.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/report-paged.js) |
| CREADO | [public/reports-accessible.css](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/reports-accessible.css) |
| CREADO | [public/sale-recovery.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/sale-recovery.js) |
| CREADO | [public/sales-chart.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/public/sales-chart.js) |
| MODIFICADO | [server/scripts/global-rls.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/scripts/global-rls.js) |
| MODIFICADO | [server/src/app.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/app.js) |
| CREADO | [server/src/cash-daily.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/cash-daily.js) |
| CREADO | [server/src/financial-access.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/financial-access.js) |
| MODIFICADO | [server/src/initial-inventory.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/initial-inventory.js) |
| MODIFICADO | [server/src/inventory-count.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/inventory-count.js) |
| CREADO | [server/src/inventory-report.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/inventory-report.js) |
| MODIFICADO | [server/src/purchase-requirement.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/purchase-requirement.js) |
| CREADO | [server/src/sales-product-report.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/sales-product-report.js) |
| CREADO | [server/src/sales-products-export.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/server/src/sales-products-export.js) |
| MODIFICADO | [tests/active-ingredient-rls-native.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/active-ingredient-rls-native.test.js) |
| MODIFICADO | [tests/catalog-frontend.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/catalog-frontend.test.js) |
| MODIFICADO | [tests/expiry-calendar-ui.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/expiry-calendar-ui.test.js) |
| MODIFICADO | [tests/helpers/expiry-calendar-ui.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/helpers/expiry-calendar-ui.js) |
| MODIFICADO | [tests/helpers/initial-cost-checks.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/helpers/initial-cost-checks.js) |
| MODIFICADO | [tests/helpers/native-web-cost-fixture.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/helpers/native-web-cost-fixture.js) |
| MODIFICADO | [tests/helpers/profit-native-cluster.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/helpers/profit-native-cluster.js) |
| MODIFICADO | [tests/helpers/purchase-requirement-checks.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/helpers/purchase-requirement-checks.js) |
| CREADO | [tests/helpers/web27-runtime-guard.cjs](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/helpers/web27-runtime-guard.cjs) |
| MODIFICADO | [tests/initial-inventory-lf.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/initial-inventory-lf.test.js) |
| MODIFICADO | [tests/initial-inventory-rls-native.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/initial-inventory-rls-native.test.js) |
| MODIFICADO | [tests/initial-inventory-template-postdeploy.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/initial-inventory-template-postdeploy.test.js) |
| MODIFICADO | [tests/initial-inventory-ui.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/initial-inventory-ui.test.js) |
| MODIFICADO | [tests/initial-inventory.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/initial-inventory.test.js) |
| MODIFICADO | [tests/monthly-sales-native.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/monthly-sales-native.test.js) |
| MODIFICADO | [tests/monthly-sales-ui.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/monthly-sales-ui.test.js) |
| MODIFICADO | [tests/physical-count-rls-native.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/physical-count-rls-native.test.js) |
| MODIFICADO | [tests/purchase-requirement-native.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/purchase-requirement-native.test.js) |
| MODIFICADO | [tests/purchase-requirement-ui.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/purchase-requirement-ui.test.js) |
| MODIFICADO | [tests/sale-profitability-native.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/sale-profitability-native.test.js) |
| MODIFICADO | [tests/sale-profitability-rls-native.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/sale-profitability-rls-native.test.js) |
| MODIFICADO | [tests/sale-profitability.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/sale-profitability.test.js) |
| CREADO | [tests/web27-browser.mjs](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/web27-browser.mjs) |
| CREADO | [tests/web27-checkout-native.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/web27-checkout-native.test.js) |
| CREADO | [tests/web27-history-native.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/web27-history-native.test.js) |
| CREADO | [tests/web27-phase1.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/web27-phase1.test.js) |
| CREADO | [tests/web27-phase2.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/web27-phase2.test.js) |
| CREADO | [tests/web27-phase3.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/web27-phase3.test.js) |
| CREADO | [tests/web27-phase4.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/web27-phase4.test.js) |
| CREADO | [tests/web27-phase5.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/web27-phase5.test.js) |
| CREADO | [tests/web27-phase6-native.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/web27-phase6-native.test.js) |
| CREADO | [tests/web27-phase7-native.test.js](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/tests/web27-phase7-native.test.js) |
| CREADO | [INFORME_IMPLEMENTACION_27_MEJORAS_WEB.md](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/01_EDUXFAC_WEB/INFORME_IMPLEMENTACION_27_MEJORAS_WEB.md) |

Pruebas adicionales de las correcciones aprobadas:

- tests/sales-product-visual.test.js: formato, valores originales, paginación y permisos de F50/F55.
- tests/f15-f26-messages.test.js: mensaje de apertura obligatoria y contadores de inventario, vacíos/cero/decimales y rollback.
- tests/cash-state-sales-sync-native.test.js: refresco automático de Caja, efectivo/Yape/tarjeta, movimientos manuales, anulación y replay sin duplicación.

Los scripts de ejecución, respaldos, logs, capturas y manifiestos están en [carpeta de evidencias](D:/EDUXFAC/01_DESARROLLO_WEB_PANEL/IMPLEMENTACION_27_MEJORAS_WEB_20261115) y no se incorporan como dependencias de WEB.

## Limitaciones y validación manual propuesta

1. **Impresión física 80 mm PENDIENTE.** Verificar impresora, driver, corte, contraste, márgenes, nombres largos y documentos con muchas líneas; contrastar 58 mm en equipo real. La simulación no aprueba esta prueba.
2. Validar manualmente en laboratorio los flujos con Administrador, Cajero y Almacén, y combinaciones de roles por sucursal; comprobar que costos/utilidades permanezcan inaccesibles en API y archivos.
3. Realizar una jornada ficticia de caja: apertura cero, cinco medios de pago, retiro/ingreso, cambio de fecha, caja anterior pendiente y cierre autorizado con conciliación. La fecha es la del servidor en Perú; la prueba manual de medianoche no debe cambiar el reloj de producción.
4. Verificar pérdida de conexión y recarga entre cobro y respuesta, doble pestaña y reintento original. El navegador debe ofrecer Web Locks en contexto seguro (HTTPS o localhost) y almacenamiento habilitado; si no dispone de ellos se bloquea el cobro de forma segura. No borrar localStorage de un intento pendiente.
5. Probar Excel ficticio con filas lejanas, filtros, orden distinto, ceros y vacíos; revisar historial y rechazo de productos incompatibles. Confirmar reglas con el propietario antes de ampliar la importación a sobrescrituras.
6. Revisar exportaciones con el volumen esperado del negocio; el laboratorio prueba miles de filas, no todos los tamaños posibles. La vista de productos usa unidades de cada presentación y no debe interpretarse su suma como unidades base.
7. La compatibilidad fiscal se ensayó localmente con simulaciones y contratos existentes. No constituye certificación real SUNAT, ni autoriza envío fiscal, instalación, publicación o despliegue. Se dispone de aprobación manual del propietario para F15, F26, sincronización de Estado de caja y F50/F55. Esto no constituye validación comercial del conjunto ni autorización fiscal.
8. Cualquier integración/despliegue requiere autorización expresa posterior, respaldo y restauración verificables, revisión de históricos y plan de reversión. Estos pasos no se iniciaron.

## Declaraciones finales

```text
LOCAL_BRANCH=desarrollo/web-27-mejoras-20261115
LOCAL_COMMIT=VER_HISTORIAL_DE_LA_RAMA
FILES_REVIEWED=61
OFFICIAL_BASE_COMMIT=de7b515552002fccb885360a565b407c089ae06f
APPROVED_IMPROVEMENTS=27
IMPLEMENTADAS=26
PENDIENTE_DE_PRUEBA_FISICA=F14
F09_IMPLEMENTED=NO
REGRESSION_PASS=784
REGRESSION_FAIL=0
REGRESSION_SKIP=1
BROWSER_CHECKS_PASS=11
PHYSICAL_PRINT_TEST=PENDIENTE
OFFICIAL_SOURCES_UNCHANGED=YES
DESKTOP_UNCHANGED=YES
PANEL_UNCHANGED=YES
GREENTER_UNCHANGED=YES
GITHUB_PUBLICATION=AUTHORIZED_DEVELOPMENT_BRANCH_ONLY
VPS_MODIFIED=NO
PRODUCTION_MODIFIED=NO
REAL_DATABASES_MODIFIED=NO
SUNAT_REAL_OPERATIONS=0
F15=PASS
F26=PASS
CASH_STATE_SALES_SYNC=PASS
F50_F55_INTACT=YES
READY_FOR_STAGING_OR_PRODUCTION_REVIEW=YES
READY_FOR_PRODUCTION=NO
```

El cierre autoriza únicamente commit local y publicación de la rama de desarrollo. No se integra main, no se despliega y no se modifica producción. El acta externa en D: registra el commit exacto y la verificación posterior del push.
