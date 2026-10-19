# Diagnóstico READ-ONLY — ABRILAR JARABE 120ML

Empresa: BOTICA PILOTO EDUXFAC, RUC 10460023039. Sucursal PRINCIPAL. Producto P000004.

Consultas ejecutadas exclusivamente en eduxfac_web_piloto con default_transaction_read_only=on y BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY. No se ejecutó POST /api/sales, ni funciones con UPDATE, ni despliegue. Se escribieron únicamente estos archivos de evidencia locales en D:.

## Resultado exacto

S/31.875 = (3×30 + 3×35 + 2×30) / 8 = 255/8. Costo correcto: 8×15 = S/120; ingreso 8×25 = S/200; utilidad S/80.

## Estado y consumo FEFO

| Lote | Vencimiento BD | Stock inicial | Stock actual | Costo BD | Apertura guardada | Valor movimientos netos | Valor usado por venta | Costo calculado/unidad | Consume | Costo imputado | Costo correcto |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| EDU1 | 2026-10-29 | 3.000 | 3.000 | 15 | 45 | 45.000 | 90.000 | 30.0000000000000000 | 3.000 | 90.0000000000000000000 | 45.000 |
| EDU2 | 2026-11-29 | 4.000 | 3.000 | 15 | 60 | 45.000 | 105.000 | 35.0000000000000000 | 3.000 | 105.0000000000000000000 | 45.000 |
| EDU3 | 2026-12-29 | 5.000 | 5.000 | 15 | 75 | 75.000 | 150.000 | 30.0000000000000000 | 2.000 | 60.0000000000000000000 | 30.000 |

## Trazabilidad

- Importación inicial 14/10/2026 16:06:22 America/Lima: EDU1 3×15=45, EDU2 4×15=60, EDU3 5×15=75. Total12unidades/S180. Un batch y tres movimientos; no existen movimientos iniciales duplicados.
- El importador guardó además valor_base_costos=45/60/75 en los mismos lotes; es el mismo valor contado nuevamente como apertura.
- Conteo físico 14/10/2026 16:07:53 America/Lima: EDU2 AJUSTE_EXCEL_STOCK −1×15=−15. Stock total12→11. Netos de movimientos: EDU1=45; EDU2=60−15=45; EDU3=75.
- No hay compras, ventas persistidas, anulaciones ni devoluciones de ABRILAR en esta empresa. Por tanto no existe costo_snapshot histórico de ABRILAR que explique el valor. El bloqueo ocurre dentro de la transacción de nueva venta.
- Precio vigente25; UNIDAD factor1. Producto tiene presentación descriptiva BOTELLA, sin equivalencia adicional. No es un factor de conversión.

## A/B/C

- A: buscador15.0000: no hay compras, por lo que consulta lotes por vencimiento descendente e ID; fallback EDU3. public/index.html muestra costo_compra.
- B: cada lote costo_unitario15. Stock3+3+5=11; valor físico coherente11×15=165.
- C: app.js obtiene valor_disponible=valor_base_costos+sum(cantidad_movimiento×costo_movimiento). Calcula snapshot antes del control como valor_disponible/stock×factor. De ahí30,35,30. sale-profitability prioriza estos snapshots positivos; costo_total255, promedio por presentación31.875, utilidad−55.

## Código y campos implicados

- server/src/initial-inventory.js: applyInitialInventory inserta cantidad inicial/disponible y valor_base_costos=stock×costo; también inserta movimiento INVENTARIO_INICIAL por el mismo stock/costo.
- server/src/app.js: POST /api/sales calcula valor_disponible y costo_snapshot con esa apertura + ledger. FEFO por vencimiento ascendente/ID; consumo3,3,2 correcto.
- server/src/stock-cost.js: prepareStockCosts solo reconstruye apertura cuando es NULL, por lo que conserva apertura importada incorrecta. reconcileStockCosts también usa apertura+movimientos y puede propagar la inflación si una operación llega a commit.
- server/src/sale-profitability.js: costo_snapshot>0 tiene prioridad; no se usaron fallbacks de compra, movimiento ni historial para esta simulación.
- Campos: lotes.valor_base_costos y derivado valor_disponible; venta_detalles.costo_snapshot simulado. Los costos guardados de los tres lotes siguen15. Los movimientos reales de ABRILAR tienen costo15.

No es suma indebida de tres costos unitarios ni promedio simple ni cruce de empresas/lotes ajenos: es doble valorización del saldo inicial. El promedio final de costos ya inflados sí está ponderado correctamente. EDU2 sube a35 por mantener apertura60 mientras su saldo y ledger bajaron a3/45.

## Corrección recomendada (NO aplicada)

1. Unificar el invariante: valor vigente=apertura no representada en ledger + movimientos valorizados. Si inventario inicial se representa íntegramente con movimiento, su apertura adicional debe ser0. Preservar las aperturas legítimas de saldos legacy sin movimientos.
2. Corregir el importador prospectivamente y validar importación→conteo→venta FEFO→anulación/devolución; no sustituir el costo backend por el dato del navegador.
3. Preparar plan de reparación auditado solo para lotes cuya procedencia y doble contabilización estén demostradas. Para estos tres, apertura coherente0: valores45,45,75; costos15,15,15. Mantener stock3,3,5=11 y todos los históricos. Dry-run y backup antes de cualquier autorización de reparación.
4. Revisar snapshots ya persistidos de otros productos si alguna venta rentable pese a costo inflado llegó a commit; no reescribir históricos automáticamente.

## Alcance y riesgos

En la empresa consultada, el patrón de importación inicial con apertura idéntica al movimiento se detectó únicamente en ABRILAR: tres lotes. No se auditó contenido de otras empresas. Todo producto importado por este mismo flujo está potencialmente expuesto: falsos bloqueos, costos_snapshot inflados si la venta se acepta, ganancias subestimadas y recálculo posterior de costo de lote incorrecto. No existe venta persistida ABRILAR afectada.

Todos los seis archivos de código leídos coinciden SHA256 D: vs VPS. 44 FORCE RLS vigentes. Sin cambios de código, datos, costos, stock, precios, configuración, PANEL, Nginx, certificados ni PostgreSQL global.
