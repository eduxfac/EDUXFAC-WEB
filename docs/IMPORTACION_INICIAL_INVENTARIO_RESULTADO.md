# Importación inicial de inventario desde Excel — candidato D

GO para preparar un despliegue controlado al WEB PILOTO. NO desplegado.

## Alcance y archivos
- server/src/app.js
- server/src/initial-inventory.js
- public/index.html
- tests/initial-inventory.test.js
- tests/initial-inventory-ui.test.js
- tests/initial-inventory-rls-native.test.js
- tests/helpers/initial-inventory-fixture.js

## Plantilla
Hoja Inventario inicial: Código interno | Código de barras | Producto | Principio activo | Concentración | Presentación | Unidad de medida | Categoría | Laboratorio | Stock del lote | Stock mínimo | Precio de compra | Precio de venta | Lote | Vencimiento.
Obligatorios: código, producto, unidad, stock del lote, mínimo, costo y precio. Opcionales: las otras ocho columnas.
Sin Stock máximo ni Valor del stock; nuevo producto usa máximo 0. No se importa ni se sobrescribe máximo de un producto existente.
Hoja Información: instrucciones y ejemplo P000003, 4+6 unidades, lotes EDED/DEDEEE, fechas 29/10/2026 y 29/11/2026. La hoja de carga se entrega sin datos de ejemplo para evitar importaciones accidentales.

## Reglas
Código interno identifica producto. Filas repetidas deben coincidir en maestros, precio y mínimo. Errores indican código, filas y campos.
Un producto, varios lotes: costo/fecha por lote. Filas del mismo lote, costo y fecha se agregan; mismo número de lote con costo/fecha distintos se rechaza, pues el esquema permite un solo número por producto/sucursal. Sin lote se conserva NULL, y vencimiento vacío NULL; distintos costos/fechas sin número se almacenan en saldos separados.
No se aceptan fórmulas, unidades desconocidas, fechas inexistentes, valores negativos, requeridos vacíos ni identidades duplicadas. Se preservan códigos y ceros iniciales cuando Excel los guarda como Texto.
Costo explícito cero permitido como valor no negativo informado; muestra advertencia y no aporta valor. La importación no modifica el control de rentabilidad ni concede excepciones a ventas.
Valorización por lote = cantidad × costo; suma exacta mediante enteros escalados en el resumen; redondeo monetario a dos decimales al presentar el total.
Solo saldo inicial: no reemplaza stock ni crea proveedor/factura/compra. Producto con cualquier lote o movimiento en la sucursal se bloquea, incluso saldo cero. Esto evita reimportaciones y sobreescritura de históricos.
Producto maestro existente: debe ser compatible; se vincula a la sucursal sin reescribir maestros. Precio activo diferente bloquea; precio coincidente se conserva. Stock mínimo de la sucursal se registra desde Excel.

## Flujo y seguridad
Descarga -> archivo -> preview con errores de todas las filas y primeras 100 filas visibles -> resumen -> confirmación -> transacción -> resumen final.
Commit vuelve a analizar el archivo y comprobar permisos y maestros. SHA256 enlaza archivo preview/commit. Cambio de sucursal exige nueva vista previa.
Administrador/Almacén en la sucursal exacta; no basta ser administrador en otra. tx aplica contexto tenant/RLS. Lock empresarial + locks de producto_sucursal; concurrencia confirmada sin duplicados.
Movimientos nuevos INVENTARIO_INICIAL, referencia al UUID de importación y auditoría con usuario, empresa, sucursal, filas, cantidades, valor y SHA256. Sin cambios a compras/ventas/devoluciones previas.
Ante error de cualquier fila o fallo SQL, rollback de toda la transacción (incluidos maestros, precios, vínculos, lotes y movimientos).

## Pruebas y rendimiento
Windows: 120/120; Linux PostgreSQL nativo/RLS: 27/27; frontend VM: 5/5. Total 152/152, 0 fallidas, 0 omitidas. Las cifras incluyen los tests padre que reporta node:test.
Parser de 5.000 filas: 692 ms, incluyendo construir y leer XLSX ficticio. Importación real HTTP de 5.000 productos y lotes bajo 44 FORCE RLS: 37.495 ms en laboratorio aislado.
Regresión: rentabilidad, costo snapshot, compensación, productos con 5 requeridos, búsqueda, compra, devolución/anulación y modal visual.

## Límites y riesgos para despliegue
Máximo 5.000 filas y 20 MB comprimidos. Miles de productos requieren una transacción de decenas de segundos; comprobar timeout del proxy antes de un despliegue, sin cambiarlo todavía.
XLSX antiguo no se acepta. Una exportación de Excel que ya perdió ceros iniciales no puede recuperarlos; se recomienda formato Texto.
El esquema actual ya permite numero_lote NULL y valor_base_costos (actualizaciones existentes, incluida 007). No requiere nueva migración; verificar esas precondiciones en el precheck del futuro despliegue.
La importación inicial sustituye el flujo antiguo de reemplazar/sumar desde Excel. Conteo físico conserva su flujo independiente sin cambios.

## Restricciones conservadas
No se accedió al VPS. Sin deploy, ZIP, Nginx, certificados, PANEL ni datos reales. Módulos de rentabilidad/entradas/costos y schema.sql conservan SHA256; cambios de app.js limitados a import y registro de las tres rutas del importador.

Evidencia: operations/initial-inventory/RESULT.json y logs TEST_REGRESSION_WINDOWS.log, TEST_NATIVE_LINUX.log, TEST_UI.log.