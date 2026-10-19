# Ventas por mes — cierre de continuación, 15/10/2026

**Implementación completa en D:. NO-GO temporal para despliegue: queda pendiente repetir la validación nativa con Docker operativo. No se desplegó ni se accedió al VPS en esta continuación.**

## Punto recuperado

La tarea anterior estaba interrumpida después de implementar el bloque y ejecutar pruebas, antes del informe final. Se recuperó el chat 01a128e1-b0f9-7ca2-8fbd-8b2db2a9fa46, el requerimiento adjunto, operations/monthly-sales/before, los checksums BEFORE.json, los logs y las capturas. No se reconstruyó el proyecto ni se reemplazó el gráfico semanal. La carpeta C: de esta conversación contiene PANEL; toda modificación de la tarea se realizó en la fuente oficial D:/EDUXFAC/EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL.

## Archivos funcionales modificados o agregados en toda la tarea

- server/src/app.js: import y GET /api/dashboard/monthly-sales; la validación de sucursal/global se aplica también a los subendpoints de dashboard.
- server/src/monthly-sales.js (nuevo): agregación SQL mensual, años disponibles y total anual en una consulta parametrizada.
- public/index.html: tarjeta bajo la fila del gráfico semanal/caja y antes de los bloques inferiores; carga independiente del módulo mensual.
- public/monthly-sales.js (nuevo): selector, doce barras, importes PEN, ceros, importes negativos, carga/error, control de respuestas tardías y total anual.
- public/desktop-responsive.css: barras azules, tarjeta y scroll horizontal interno en pantallas estrechas.

Pruebas nuevas o modificadas:

- tests/monthly-sales.test.js
- tests/monthly-sales-native.test.js
- tests/monthly-sales-ui.test.js
- tests/helpers/monthly-sales-checks.js
- tests/initial-inventory-lf.test.js

En esta continuación solo se corrigió funcionalmente public/monthly-sales.js: al perder la sucursal se eliminan importes, años, eje negativo y estado de carga; al recuperarla se solicita el año predeterminado. Dos pruebas nuevas cubren también una respuesta pendiente. Se actualizó la prueba histórica LF, que exigía el HTML anterior completo: conserva checksum de la normalización histórica, comprueba LF del HTML vigente, compilación de scripts, hashes CSP y equivalencia del HTML servido. La aserción anterior intentaba imprimir un diff enorme y agotaba memoria al detectar los cambios esperados de la nueva tarjeta.

FILES.json contiene SHA256 de los diez archivos; CANDIDATE.diff incluye modificaciones y archivos nuevos. Los respaldos previos y logs iniciales se conservaron. Bajo operations/monthly-sales se agregan informe, resultado, logs de continuación, manifiesto y copia de evidencia responsive.

## Contrato y lógica

GET /api/dashboard/monthly-sales?sucursal_id=<uuid>&year=2026 devuelve year, years, months[12], total_year, timezone y definition. Año omitido: año actual en America/Lima. Acepta 1900–9998 y rechaza valores ambiguos o inyección. Los años disponibles provienen de ventas de la empresa/sucursal autorizada y se agrega el año actual. La UI incluye el año consultado aunque no tenga ventas.

Usa exactamente reporte_ventas_netas y estados EMITIDA/DEVOLUCION_PARCIAL como Reportes > Ventas. Neto = total de venta menos sum(monto) de devoluciones. ANULADA y BORRADOR quedan fuera. Una devolución realizada después se atribuye al mes original de la venta, como el reporte existente. No se vuelve a restar una venta totalmente anulada. Las notas de crédito conservan el signo, estado e importe existentes; no se inventa otro descuento por el nombre del comprobante. Admite meses negativos con eje divergente. Los doce totales y el anual se calculan en SQL numeric; meses ausentes reciben cero.

El periodo usa límites semiabiertos de timestamps en America/Lima; los cambios de año a UTC04:59/05:00 están probados. La comparación de los doce meses se ejecuta contra /api/reports/center/sales. Empresa de JWT, permisos dashboard y sucursal se validan. Global solo para administrador autorizado en todas las sucursales activas, según la regla existente; Inicio mantiene su selector de sucursal activa. No se modifica RLS ni se utilizan roles de bypass en el runtime de la prueba nativa previa. Cache-Control: no-store. Las lecturas no alteran históricos.

## Pruebas

Corrida final Windows: **480/480 aprobadas, 0 fallidas, 0 omitidas**. Evidencia: TEST_FINAL_WINDOWS.log. Incluye las 29 comprobaciones específicas del bloque; no se suman dos veces. Sintaxis de backend, módulo y scripts inline aprobada.

El primer intento ampliado terminó con 477 aprobadas y un archivo fallido por la prueba LF obsoleta. Tras corregirla: 3/3 en TEST_RESUME_LF.log y después corrida completa final aprobada. Se conservó TEST_RESUME_WINDOWS_ALL.log para trazabilidad.

Cobertura: doce meses/suma anual; años y ceros; anulaciones; devolución posterior; signos de notas de crédito; doce comparaciones con reportes; fronteras Lima; cambio de sucursal; permisos; empresa ajena; JWT; global restringido; entradas inválidas; una consulta por agregación; snapshot de históricos/stock/precios; respuestas y errores tardíos; falta de sucursal; sintaxis y conservación byte a byte del gráfico/función/endpoint semanal. Regresión ampliada incluye inventario, compras, costos/utilidad, conteo físico, suscripciones, login, catálogos, permisos y aislamiento con datos ficticios.

Evidencia PostgreSQL previa del 14/10: **36/36 aprobadas, 0 fallidas, 0 omitidas**, incluyendo 44 tablas FORCE RLS y consultas con rol runtime NOSUPERUSER/NOBYPASSRLS. TEST_LINUX.log se conservó intacto. Hoy no se repitió exitosamente: Docker creó el contenedor, pero falló durante preparación con API500; el motor quedó sin responder y docker desktop restart terminó por timeout. No se contabiliza este bloqueo como prueba funcional fallida ni se presenta la evidencia anterior como ejecución de hoy.

Responsive recuperado: 1920,1366,1024,768,375 px; doce barras en las cinco medidas, sin overflow horizontal global ni solapamiento de encabezado/pie. Scroll interno a 1024/768/375. Se revisaron las capturas recuperadas; no se rehízo la medición hoy. CSS y markup del bloque se conservaron durante esta continuación. Evidencia en responsive/monthly-responsive.json y JPG.

## Rendimiento e índices

Hoy, PGlite/SQL/HTTP con 10,000 ventas y 1,000 devoluciones: 75.5 ms, 79.1 ms, 66.5 ms. Total monetario completo comprobado, sin truncamiento.

PostgreSQL16 previo, 100,000 ventas y 10,000 devoluciones con RLS: 1104.6 ms, 553.5 ms, 548.9 ms. EXPLAIN ANALYZE: 598.1 ms. Primera petición ≈1.10 s; calientes ≈0.55 s. Son mediciones de laboratorio, no del VPS.

Una consulta de agregación para los doce meses, años y total; autenticación/permisos requieren consultas adicionales habituales. El plan previo usa idx_devoluciones_venta para la resta correlacionada. En ventas, el optimizador eligió escaneos secuenciales al seleccionar gran proporción de la tabla ficticia. Los límites de fecha no envuelven created_at en una función y permiten aprovechar índices existentes cuando el plan lo considere selectivo. No se afirma que haya usado un índice de ventas. No se creó índice ni migración nueva: el volumen ensayado no lo justificó. PERFORMANCE_PG.json conserva el plan, buffers y tiempos íntegros.

## Dictamen y pendientes concretos

**NO-GO temporal para desplegar al WEB PILOTO**, por validación nativa actual bloqueada en infraestructura. Código terminado, regresión Windows aprobada y evidencia nativa anterior favorable. Para cambiar a GO:

1. Recuperar el motor Docker local y ejecutar operations/monthly-sales/RUN_LINUX.ps1; exigir 36/36 sin fallos ni omisiones.
2. Verificar la eliminación del contenedor propio identificado en CLEANUP_RESUME.json. El fallo del motor impidió comprobar su limpieza; CLEANUP.json corresponde al laboratorio anterior y no demuestra la limpieza de hoy.
3. Revisar RESULT.json/FILES.json si se cambia el candidato. El GO técnico posterior no implica autorización para desplegar.

No se forzó el cierre de procesos ni se reinició Windows/WSL. No se accedió al VPS, no se desplegó y no se tocaron datos del PILOTO, PANEL, Nginx, certificados ni PostgreSQL global. Las bases de las pruebas fueron ficticias/aisladas.
