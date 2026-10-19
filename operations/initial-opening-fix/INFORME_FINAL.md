# Corrección de doble valorización del inventario inicial

**Resultado: GO para despliegue controlado y reparación posterior con precondiciones. No desplegado. No reparados datos reales.**

## Cambio funcional

Solo server/src/initial-inventory.js. La apertura del lote nuevo pasa de stock×costo a0. Se conservan cantidad inicial/disponible, lote, vencimiento, costo, movimiento INVENTARIO_INICIAL y auditoría; todo en la misma transacción de importación. No se requiere migración. No se modificaron ventas, rentabilidad, stock-cost, inventario físico, reportes ni frontend.

Regla: valor vigente = apertura legítima NO representada por movimientos + suma(cantidad×costo de movimientos). Una importación inicial completa tiene apertura0 y movimiento completo. Los saldos legacy sin movimientos mantienen apertura reconstruida. No se hace una exclusión general de movimientos ni se pone a cero la apertura de todos los productos.

SHA256 anterior: 57abcde45bc6b165875e1f8b6ad6c956e87bc4759a4483476f3bfef159b62377
SHA256 candidato: 6509028c9ab0d4a39a2671d87637fb99b8c6584ed407f6099b3e1c39971f8ccd

## Pruebas finales

| Entorno | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Windows | 206 | 0 | 0 |
| Linux/PostgreSQL16/RLS | 147 | 0 | 0 |
| Total | 353 | 0 | 0 |

Incluyen importación1/2/3lotes; costos distintos; conteo físico posterior con Excel descargado del servidor de prueba; venta parcial y multilot; costo_snapshot por presentación; utilidad neta; inventario y ledger coherentes; devolución parcial/anulación; equivalencias; margen cero/negativo bloqueado; legacy sin movimientos; concurrencia de importaciones y ventas; empresa/sucursal ajena;44FORCE RLS; rol runtime sin superusuario/BYPASS; compras, caja, productos, buscador, requerimiento y UI existentes.

Seis pruebas del procedimiento de reparación: dry-run inmutable; rechazo sin backup; error de auditoría provoca rollback de las tres aperturas; aplicación solo sobre tres aperturas+una auditoría; rechazo del reintento/baseline modificado; venta8 tras reparar cuesta120 y utilidad80, devolución restaura11/S165.

La primera corrida encontró expectativas antiguas de importación legacy en dos pruebas de costos. Se actualizaron al contrato vigente: importación inicial exige costo y no admite producto con saldo ya existente. También se reemplazó la dependencia de pruebas al cliente PANEL por fixtures WEB y llamadas HTTP propias. La corrida final completa está en cero fallos. Las verificaciones de aislamiento y rentabilidad no se eliminaron.

5.000 productos/lotes importados en PostgreSQL con RLS en aproximadamente31.4s. El contenedor propio, sin red externa ni datos reales, se cerró y eliminó. La preparación inicial que copió un laboratorio histórico se canceló; el runner final copia solo pruebas JS/helpers necesarios. No se eliminaron laboratorios históricos de D:.

## Auditoría READ-ONLY de toda la empresa PILOTO

Empresa RUC10460023039: cuatro productos auditados, incluyendo inactivos/todas sus sucursales. Solo ABRILAR/P000004 presenta apertura positiva + INVENTARIO_INICIAL valorizado. Un producto, tres lotes:

| Lote | Stock | Costo | Apertura duplicada | Ledger erróneo | Valor correcto actual |
|---|---:|---:|---:|---:|---:|
| EDU1 | 3.000 | 15 | 45 | 90.000 | 45.000 |
| EDU2 | 3.000 | 15 | 60 | 105.000 | 45.000 |
| EDU3 | 5.000 | 15 | 75 | 150.000 | 75.000 |

Total apertura duplicada180. Ledger erróneo345 frente a valor actual correcto165. Para la venta8: costo erróneo255 frente a120 correcto, exceso135. No confundir exceso de apertura total con exceso de la venta parcial. No existen ventas persistidas/compras/devoluciones de ABRILAR. No se revisaron datos de otras empresas.

## Reparación preparada

Consultar PROCEDIMIENTO_REPARACION_ABRILAR.md. Solo tras autorización y despliegue del importador corregido: copiar script/plan a home privado, comprobar hashes, dry-run READ ONLY, backup verificable nuevo, aplicar una transacción SERIALIZABLE con bloqueos y precondiciones. Actualizar únicamente valor_base_costos EDU1 45→0, EDU2 60→0, EDU3 75→0. Stock3/3/5, costos15, vencimientos, iniciales3/4/5, movimientos y ajuste físico−1 permanecen. Crear un único registro de auditoría, sin movimientos inventados ni reescrituras históricas. Si el estado o fingerprints varían, detenerse; no actualizar el plan automáticamente.

Comprobado en réplica PostgreSQL: tras reparación costo visible15/lotes15/control15. Venta8 consume3+3+2, costo120, ingreso200, utilidad80. El inventario de ABRILAR antes de esa venta es11×15=165.

## Archivos modificados/agregados

- Funcional: server/src/initial-inventory.js.
- Pruebas ajustadas: tests/cost-consistency-native.test.js, tests/initial-inventory-rls-native.test.js, tests/initial-inventory.test.js, tests/product-required-fields.test.js, tests/sale-profitability-native.test.js, tests/sale-profitability.test.js, tests/tenant-isolation.test.js.
- Pruebas nuevas: tests/initial-opening-cost.test.js, tests/helpers/initial-cost-checks.js, tests/helpers/native-web-cost-fixture.js.
- Operaciones nuevas: repair-abrilar-opening.mjs, PLAN_ABRILAR.json, auditoría, runner, evidencia y documentación bajo operations/initial-opening-fix/.

RESULT.json contiene hashes completos. CANDIDATE.diff muestra el cambio funcional mínimo. AUDIT_PILOT.json/CSV conservan evidencia; FINAL_READONLY.json confirma importador remoto anterior, aperturas reales45/60/75, stock11, cero auditorías de reparación,44FORCE RLS y health200/PILOTO.

No se subieron archivos al VPS. No se desplegó ni aplicó el script real. No se tocaron PANEL, Nginx, certificados, PostgreSQL global ni base antigua eduxfac.
