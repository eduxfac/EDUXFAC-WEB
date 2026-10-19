# Diagnóstico READ-ONLY de valorización APRONAX

Consulta del 13/10/2026 a las 19:05 Lima. Empresa BOTICA PILOTO EDUXFAC, sucursal PRINCIPAL. Las consultas se ejecutaron en eduxfac_web_piloto con default_transaction_read_only=on y BEGIN REPEATABLE READ READ ONLY, terminado por ROLLBACK. No se modificaron datos, código o archivos del VPS/PANEL.

## Causa exacta

La compra no perdió el costo. Creó el lote DFDF, 120 unidades a S/1,57, con compra_detalle_id y movimiento COMPRA correctamente vinculados. El producto no está duplicado: P000001 tiene dos registros de lote/saldo.

1. Compra 120 DFDF a S/1,57.
2. Venta de una caja de 120 agota DFDF; guarda costo_snapshot S/188,40.
3. Dos ventas posteriores, sin existencias, crean/usan saldo sin lote: cantidad -240, costo cero. El control de rentabilidad usa como referencia verificable la compra anterior, pero NO persiste ese costo recuperado en costo_snapshot; ambas ventas conservan snapshot cero.
4. Se anula la última venta sin stock: vuelve +120 al saldo sin lote, todavía queda -120.
5. Se anula la venta original: vuelve +120 a DFDF con costo S/1,57. applyPositiveStockEntry compensa la deuda: resta 120 a DFDF y suma 120 al saldo sin lote.
6. La compensación registra S/1,57 en movimientos, pero solo actualiza cantidades en lotes; el saldo sin lote mantiene costo cero.
7. Se anula la otra venta sin stock: devuelve +120 al saldo sin lote usando su snapshot cero. Resultado: DFDF 0 a S/1,57; sin lote +120 a S/0.

Las tres ventas están ANULADA y tienen devoluciones TOTAL de 120 unidades base. No hay ajustes ni importaciones de estos productos en la evidencia; el flujo causante es VENTA SIN STOCK -> DEVOLUCIONES -> COMPENSACIÓN_DEUDA.

## Reconstrucción (13/10, hora Lima)

| Hora | Movimientos del evento | DFDF | Sin lote | Total unidades |
|---|---|---:|---:|---:|
| 13:06:13 | COMPRA | 120.000 | 0 | 120.000 |
| 13:08:20 | VENTA | 0.000 | 0 | 0.000 |
| 18:33:55 | VENTA | 0.000 | -120.000 | -120.000 |
| 18:41:00 | VENTA | 0.000 | -240.000 | -240.000 |
| 18:41:28 | DEVOLUCION_VENTA | 0.000 | -120.000 | -120.000 |
| 18:41:43 | COMPENSACION_DEUDA, DEVOLUCION_VENTA | 0.000 | 0.000 | 0.000 |
| 18:41:58 | DEVOLUCION_VENTA | 0.000 | 120.000 | 120.000 |

Las cantidades cuadran con el kardex. Lo que no cuadra es el costo durable del saldo:
- DFDF: stock 0; suma cantidades movimientos 0; suma cantidad*costo de movimientos S/0.
- Sin lote: stock 120; suma cantidades movimientos 120; suma cantidad*costo de movimientos S/188,40; costo_unitario del saldo S/0.
Existe separación incorrecta entre costo registrado en movimientos y costo usado al valorizar saldo. No es ausencia de compra ni un error aritmético del reporte.

## Código exacto (D: y VPS SHA256 iguales)

- server/src/app.js, compra: 339-342 crea detalle, upsert lote por producto/sucursal/número, asigna costo ingresado y aplica entrada.
- Compra de producto existente: vincula sucursal, reutiliza lote si mismo número; suma unidades. El upsert reemplaza costo del lote con el costo de la nueva compra, no calcula promedio ponderado. Este riesgo con costos distintos no causó el caso actual, que tiene una compra APRONAX.
- Ventas, 436-442: faltante se registra en lote sin número/vencimiento con costo 0; costo_snapshot sale de costo_lote*factor.
- sale-profitability.js: recupera costo por lote/snapshot/compra/movimiento para VALIDAR, sin actualizar snapshots. Explica por qué se permitieron las cajas S/230 y S/190 frente al costo verificable S/188,40 pese al snapshot cero. La venta S/185 ocurrió antes del control.
- app.js, 594: devoluciones usan costo_snapshot/factor. Snapshot cero vuelve como costo cero.
- inventory-entry.js: entrada y compensación modifican cantidades y registran costos en movimientos; no actualizan el costo del saldo receptor.
- inventory-count.js e inventoryWorkbook en branch-catalog.js: valor = suma cantidad_disponible*costo_unitario, exclusivamente por lote/saldo; no sustituyen automáticamente por costo de compra.
- Reportes Compras usa AVG(compras.total), equivalente total/documentos con los filtros aplicados.

## Otros flujos examinados

| Flujo | Tratamiento de costo |
|---|---|
| Compra | Costo informado, detalle y lote; compensación de deudas puede llevar cantidad a un saldo sin costo. |
| Importación Excel de inventario | replace vacía saldos y recrea/reutiliza lotes del Excel; costo ausente se transforma en cero. Mantiene costo anterior solo si reutiliza el mismo lote existente. Nuevo INVENTARIO-EXCEL puede quedar con costo cero. |
| Ajuste de lote específico | Entrada positiva conserva el costo de ese lote; puede ser cero si ya lo era. |
| Ajuste manual de stock total | Sobrante va a AJUSTE-MANUAL, creado con costo cero; no hereda el costo del lote comprado. |
| Conteo físico / Excel solo stock | Sobrante se asigna al último lote real; si no existe, al saldo sin lote creado con costo cero. |
| Devolución / anulación | Devuelve al lote de venta con su snapshot; compensación puede desplazar las unidades hacia deuda sin conservar costo en lotes. Causa real de APRONAX. |

No atribuir a Excel o al conteo el caso real, porque su trazabilidad muestra ventas/anulaciones.

## Tablas y campos

- compras: id, sucursal_id, total, created_at.
- compra_detalles: cantidad, costo_unitario, numero_lote, total.
- lotes: cantidad_disponible, costo_unitario, numero_lote, compra_detalle_id.
- venta_detalles: lote_id, cantidad_base, factor_unidades, costo_snapshot, importe_neto.
- movimientos_inventario: tipo, cantidad, costo_unitario, lote_id, referencia_id.
- devoluciones_venta / devolucion_venta_detalles: relación venta, cantidad_base y monto.
- producto_sucursal: vinculación/activo; no es almacén alternativo de costo o stock.
- ajustes_inventario: sin registros para el caso.
- auditoria: trazabilidad sin modificar.

## Valor esperado

APRONAX: 120 x S/1,57 = S/188,40.
PARACETAMOL: 390 x S/0,08 = S/31,20.
Total S/219,60. Actualmente se contabilizan S/31,20 porque el costo del saldo APRONAX es cero.

Sí: con la única compra identificada, las tres ventas APRONAX íntegramente anuladas y el stock confirmado, la valorización de este caso debe reconciliarse a S/219,60. La identificación del lote físico debe confirmarse antes de devolverle número/vencimiento.

## Corrección recomendada, NO implementada

- Unificar el costo verificable usado para validar ventas con el snapshot persistido, incluyendo equivalencias. No debe validarse con S/1,57 y guardar cero para devoluciones.
- Corregir la conservación de cantidad/costo/procedencia al compensar deuda y deshacer ventas sin existencias. Debe restaurarse el valor neto original para cualquier orden de anulaciones.
- Tratar costo desconocido como condición explícita; no ocultarlo con cero ni tomar la última compra indiscriminadamente para todos los lotes.
- Mantener la valorización por lotes; no modificar el SUM para ocultar el problema.
- Mostrar aviso de stock positivo sin costo verificable.
- Definir política para entradas al mismo lote con costos diferentes: preservar trazabilidad o promedio ponderado, sin alterar historia.
- Mantener bloqueo de rentabilidad, transacciones y RLS.

## Reparación segura de APRONAX, NO ejecutada

1. Backup real previo y extracto de las filas afectadas; preservar todos los históricos.
2. Ensayar en copia aislada la secuencia exacta y la reparación, verificando stock, costo, caja e historial.
3. Confirmar identidad física DFDF. Si las 120 unidades corresponden a él, reubicar AUDITADAMENTE 120 del saldo sin lote al DFDF existente, conservando total 120, costo S/1,57 y vencimiento ya documentado.
4. Registrar el par de reclasificación -120/+120 a S/1,57, respaldado por compra y compensación. No usar cero en la salida por el costo corrupto del saldo: eso duplicaría el valor acumulado del kardex. El par monetario debe ser -S/188,40/+S/188,40, neto cero.
5. Si no puede confirmarse lote físico, no inventar número/vencimiento: rectificar de forma auditada solo el costo del saldo sin lote a S/1,57, con respaldo de compra/kardex y sin aumentar stock.
6. En una transacción con bloqueos y precondiciones sobre los saldos/hashes del diagnóstico, aplicar únicamente la alternativa autorizada; detener si cambió el stock o aparecen otros orígenes.
7. Verificar APRONAX 120 / S/188,40, PARACETAMOL 390 / S/31,20, total S/219,60; caja, compras, ventas/devoluciones históricas y usuarios intactos.

No registrar otra compra, no duplicar stock, no editar ventas/costos históricos ni borrar el saldo histórico sin lote.

## Pruebas a agregar

1. Compra -> venta -> anulación restaura cantidad, costo y valor original.
2. Caso exacto: dos sobreventas, tres anulaciones en todos los órdenes; final 120/S188,40.
3. Deuda sin lote compensada por compra/devolución: conserva trazabilidad y valor.
4. Costo recuperado para validar queda persistido para devolución; costo desconocido bloqueado.
5. Devoluciones parciales y unidad/blíster/caja, precisión exacta y varios costos/lotes.
6. Importación replace/add con costo ausente, lote distinto y mismo lote con costo existente.
7. Ajuste físico/sobrante a lote real y caso sin lote/costo verificable.
8. Concurrencia, reintento idempotente, aislamiento A/B y stock/caja intactos al rollback.
9. Reparación auditada: total stock e historia intactos; lotes y kardex monetario reconciliados.
10. Dos compras con costo diferente en lote reutilizado: política definida y verificable.

## Costo promedio S/110,20

Dos documentos: S/188,40 + S/32,00 = S/220,40; AVG(total) = S/110,20.
No es costo unitario promedio ni costo promedio ponderado. Recomiendo etiqueta Compra promedio por documento o Importe promedio por compra. No se modificó.
