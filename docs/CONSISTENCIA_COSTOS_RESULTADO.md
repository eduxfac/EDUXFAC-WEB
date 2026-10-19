# Consistencia de costos — candidato validado en D:

Resultado técnico: GO para el procedimiento de reparación controlada ensayado. NO desplegado. APRONAX real NO reparado. No se conectó al VPS durante la implementación.
371/371 comprobaciones aprobadas, 0 fallidas, 0 omitidas.

## Causa corregida

La venta validaba con un costo recuperado, pero dejaba snapshot/movimiento nuevos en cero; la devolución usaba ese cero. Al compensar deuda solo se cruzaban cantidades, sin mantener costo del saldo. Ahora costo usado, snapshot y movimientos de la venta nueva se registran coherentemente antes del commit.

## Reglas implementadas

1. El snapshot se persiste dentro de la transacción de la venta NUEVA. Los movimientos de esa misma venta se completan con costo verificado si inicialmente estaban en cero. No se actualizan movimientos/ventas históricos.
2. Costo por presentación y retorno a costo base se calculan con PostgreSQL numeric, sin multiplicaciones/divisiones JavaScript de costos. Se conserva snapshot exacto para factores fraccionarios y promedios periódicos; margen cero continúa bloqueado sin tolerancia/excepción.
3. La devolución usa el snapshot de cada detalle. No inventa lote o vencimiento.
4. El valor acumulado se obtiene del kardex más un valor fijo de apertura cuando existe stock legado sin movimientos. La apertura se registra solo al tocar el producto, no mediante backfill masivo.
5. El valor se conserva en los movimientos aunque la cantidad pase por cero; al volver a positivo se calcula costo coherente del saldo. Compensar deuda no aumenta el total físico ni altera movimientos anteriores.
6. Un costo verificable positivo queda persistido/auditado. Si no hay evidencia de costo, no se inventa un precio; el bloqueo por costo desconocido sigue activo.
7. Lotes reutilizados por compras/importaciones/transferencias no sobrescriben costo previo antes de la conciliación. Si se mezclan entradas con costos distintos, el saldo usa costo ponderado y la auditoría conserva costo anterior real.
8. Los bloqueos de producto se ordenan para las ventas; las entradas concurrentes conservan saldo/valor sin perder actualizaciones.
9. CONCILIAR_COSTO_STOCK registra costo anterior/nuevo, stock, evidencia monetaria y referencia. Una discordancia legado con stock positivo y valor no positivo queda marcada requiere_revision_valor; no se fabrican compras ni se borran rastros.

## Migración preparada, no aplicada al VPS

007_consistencia_costos.sql amplía costos a numeric sin escala fija y añade lotes.valor_base_costos (nullable). No reescribe compras, ventas, devoluciones o kardex.
Si existe la vista dependiente reporte_detalles_netos, conserva definición, opciones (incluyendo security_invoker) y permisos. No utiliza CASCADE. Si dueño/dependencias no permiten hacerlo, se detiene.
El inicio sin migraciones exige el esquema nuevo; no intenta aplicar DDL durante la operación normal. La migración debe autorizarse y ejecutarse con el rol migrador ANTES del nuevo código.
La prueba de migración legacy conservó snapshots, vista, permisos e idempotencia.

## Reportes

Solo se cambió la etiqueta Compras: Costo promedio -> Compra promedio por documento.
La expresión rcMoney(d.summary.promedio) y AVG(compras.total) permanecen iguales.
Las etiquetas Venta total / Costo total / Ganancia del cambio anterior se conservan.

## Archivos y SHA256

| Archivo | SHA256 candidato |
|---|---|
| server/src/app.js | aea688d15a8022b8c5fbb38616c4aa50a86c0efe65e14c788a18f0278cd03d16 |
| server/src/sale-profitability.js | 0eb7a95cfe300f8649fb6e8dd5c6a71795bb0fec52b6018a1d7803644eafae5b |
| server/src/inventory-entry.js | 0b3a49ac0ea077db9bc29fb8dbc08aa2d92d20aa8761a47f81652eb1c4de897f |
| server/src/stock-cost.js | f2f1bb2c8f05f8ee4b1a9b6a2d468a141575281680afb0b41e43c871819ddab8 |
| database/schema.sql | 693f6f2ba6f4b2aa35d7103375d9780c7db80b63d78ccd24b24886a6b2225e40 |
| database/migrations/007_consistencia_costos.sql | 523f57aaad2cf517158306ae7ca623549cee722cb3f6aee59673a2add7924079 |
| public/index.html | a03b1cf10bddd39ccb171accdf0e724498903f3656e20fdc5b31136e460c2392 |
| tests/cost-consistency-native.test.js | e0c15abba1aa98f35a78b6e3cc159594b35d486daea52e1aa3e1b737043bb82c |
| operations/repair-costs/repair-apronax.mjs | be7c9bb5c18dbe4bd9e9e55c8b834ed48fc616bc99f3b2a3070b23c2a21fb1dc |
| operations/repair-costs/PLAN_APRONAX.json | 5bb692035e0c96c55cb900bfc316951abbdc437b2c85969815d581db6c9c7105 |

Originales y hashes preservados en docs/costos_consistentes_candidato_original. No hay ZIP ni reinstalación.

## Pruebas finales

- Regresión completa WEB Linux: 300/300.
- Nuevas comprobaciones de costos/etiqueta/migración/reparación: 33/33.
- Rentabilidad nativa y concurrencia anterior: 22/22.
- Entry point con roles mínimos y 44 FORCE RLS: 16/16.
- TOTAL: 371/371, cero fallos y cero omisiones.

Cobertura: venta normal, sin stock, sobreventa, snapshot, seis órdenes con costo igual y seis con costos distintos, deuda/devolución, compensación parcial/total, varios lotes, unidad/blíster/caja/factor fraccionario, devolución parcial, costo ponderado periódico con margen cero, concurrencia independiente, importación/ajuste sin costo, importación al mismo lote con costo distinto, historial inmutable, reintento y empresa ajena.

Pruebas y logs:
- tests/cost-consistency-native.test.js
- docs/PRUEBAS_CONSISTENCIA_COSTOS_NATIVO.log
- docs/REGRESION_CONSISTENCIA_COSTOS_LINUX.log

Solo fuentes D: y PostgreSQL ficticio local. Contenedor sin red, sin montajes/puertos; quedó detenido, OOM=false. No se tocaron bases reales ni PANEL.

## Reparación de APRONAX — preparada y ensayada, NO ejecutada

Plan exacto: operations/repair-costs/PLAN_APRONAX.json.
Helper: operations/repair-costs/repair-apronax.mjs, exporta repairApronax(client,plan,options).
No abre conexiones ni ejecuta operaciones al importarlo.

Empresa: 8678361e-91ec-4bb2-877f-42ea2893d39e.
Sucursal: 11b36867-46b5-40a1-9d0a-8a773b318d8d.
Producto APRONAX: dfade78c-7cd3-4fc0-8660-ae7e608cdf79.
Saldo sin lote: e422a936-92c7-4a97-9354-06b84c10f5b0.
Lote real DFDF: 771bf66f-44b6-4d61-beed-ce6bef93ba68.
Actor: resolver edwinpiloto activo en esa empresa; no se modifica su usuario.

Procedimiento:

1. Autorizar por separado el despliegue/migración y la reparación. Confirmar físicamente que las 120 unidades corresponden al lote DFDF ya documentado.
2. Crear backup real previo, verificar SHA256 y validar restore aislado; conservar todos los backups anteriores.
3. Reconsultar READ-ONLY empresa/sucursal/producto, compra 120 x 1,57 = 188,40, las tres ventas anuladas, saldos DFDF=0 y sin lote=120/costo0, y kardex sin lote=120/S188,40. Verificar también PARACETAMOL y demás stock; detener si difiere.
4. Autorizar/aplicar migración 007 y candidato mediante procedimiento de despliegue controlado. No ejecutar el helper sobre el esquema antiguo.
5. Ensayar helper en clon aislado usando apply:false. Es una simulación transaccional con ROLLBACK; debe conservar estado inicial al salir. NO es una consulta READ-ONLY.
6. Con cliente PostgreSQL previamente autorizado conectado SOLO a eduxfac_web_piloto, cargar PLAN_APRONAX.json y ejecutar:
   await repairApronax(client,plan,{apply:true,backupVerified:true,physicalLotConfirmed:true});
7. El helper abre SERIALIZABLE, limita espera de bloqueos, verifica ámbito/compra/ventas/kardex y bloquea los dos saldos. Se detiene ante cualquier diferencia o intento repetido.
8. Resta 120 del saldo sin lote y suma 120 a DFDF. Añade únicamente dos movimientos nuevos RECLASIFICACION_COSTO a S/1,57: -S188,40 / +S188,40, neto monetario cero. No usa costo cero para la salida, porque duplicaría el valor del kardex.
9. Concilia costos y registra auditoría. No elimina el saldo histórico sin lote; queda en cero. DFDF conserva número y vencimiento existentes.
10. Antes de COMMIT verifica stock total APRONAX=120 y valor S188,40. Si falla, ROLLBACK. Reintento después del éxito es rechazado.
11. Verificar PARACETAMOL sin cambios: si sigue en 390 x0,08, S31,20; total esperado S219,60. Compras, ventas, devoluciones/caja, usuarios y otros productos intactos.

El ensayo reprodujo el defecto antiguo usando la función de entrada original conservada en D: y snapshots ficticios cero. Dry-run dejó stock120/valor0 intactos; aplicación ficticia dejó stock120/valor188,40 y exactamente dos movimientos nuevos, con compras/snapshots históricos inmutables; segundo intento rechazado.

## Estado y límites

GO técnico del candidato y del procedimiento probado. La ejecución real sigue pendiente de autorización, backup verificado, confirmación física DFDF, migración y despliegue.
No se presentó ningún bloqueante técnico en las pruebas. No se han aplicado ni migración, candidato o reparación en el VPS. No se cambiaron Nginx/certificados/PANEL/usuarios/suscripciones ni la base antigua.
