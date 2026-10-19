# Ventas por mes — estado final actualizado, 15/10/2026

**GO técnico. Docker recuperado; repetición PostgreSQL/RLS y SQL/HTTP: 36/36 aprobadas, 0 fallidas y 0 omitidas. Windows: 480/480. Hashes funcionales conservados; laboratorio temporal eliminado. No desplegado.**

El NO-GO anterior queda sustituido por la validación actual descrita en [INFORME_DOCKER_RLS.md](docker-recovery/INFORME_DOCKER_RLS.md). RESULT.json refleja el GO. Informe histórico preservado en docker-recovery/INFORME_PREVIOUS.md.

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

## Validación final y rendimiento

Windows: 480/480. Repetición actual: 36/36 (19 nativas PostgreSQL/RLS y 17 SQL/HTTP), sin fallos ni omisiones. 44 FORCE RLS intactas. PostgreSQL con 100.000 ventas/10.000 devoluciones: 916,7 ms inicial y 550,4–556,8 ms en caliente. Salud, aislamiento, limpieza y hashes verificados. Consultar el informe de recuperación para causa, recursos y evidencia completa.
