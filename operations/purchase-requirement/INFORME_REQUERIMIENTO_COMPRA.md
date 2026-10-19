# Requerimiento de compra por stock mínimo

Resultado: GO para despliegue posterior al WEB PILOTO. Implementado solo en la fuente oficial D:. NO desplegado; no se realizó conexión al VPS.

## Pantalla

Se reutilizó la pantalla Reposición (identificador interno replenishment y su permiso existente), ahora titulada Requerimiento de compra. Se sustituyó su interfaz de sugerencias/cobertura/órdenes por una lista simple, cantidades manuales y un resumen informativo. No se añadieron botones ni lógica de marcar comprado, quitar de lista o completar.

Columnas: Código, Producto, Stock actual, Stock mínimo, Sucursal, Último costo de compra, Proveedor habitual y Cantidad a pedir. En el documento/Excel: Código, Producto, Stock actual, Stock mínimo, Cantidad a pedir, Último costo, Proveedor y Sucursal. Las cantidades inician vacías. Solo se incluyen en el resumen y documentos las mayores a cero. No se calcula una cantidad sugerida ni se persiste un pedido/compra.

## Regla y mínimo cero

La regla única es SUM(lotes.cantidad_disponible de la sucursal) <= producto_sucursal.stock_minimo, para el catálogo activo de la empresa/sucursal. Incluye existencias negativas y el caso stock0/mínimo0. Los productos sin lotes tienen stock0.

Diagnóstico previo: Dashboard ya aplicaba <= e incluía mínimo0; Alertas usaba mínimo>0 y sugería mínimo×2 menos stock. Además el frontend sobrescribía el contador Dashboard con la lista de Alertas, limitada a200 filas. Se mantuvo coherencia con la regla matemática solicitada y con la consulta original del Dashboard, sin modificar el módulo Alertas. El nuevo requerimiento no utiliza sus sugerencias ni su exclusión de mínimo0.

La tarjeta Stock bajo tiene contador real, lista preliminar y Ver todos abre el requerimiento. El indicador existente de stock bajo también usa el mismo total. No se cambiaron las otras tarjetas ni sus cálculos.

## Costo y proveedor

Último costo: compra_detalles.costo_unitario de la compra más reciente del producto en la misma empresa y sucursal. Orden: fecha del documento DESC, created_at DESC, compra.id DESC y detalle.id DESC para desempate determinista, siguiendo el criterio por fecha de las consultas históricas existentes. No se usa costo de lote, promedio, precio de venta, otra sucursal ni un cero inventado. Un costo real0 se muestra0; sin compra se muestra vacío. Se conserva la moneda registrada (PEN, USD u otra), sin conversión.

Proveedor habitual: proveedor de la compra más reciente que tenga proveedor registrado en esa misma empresa/sucursal, con el mismo orden cronológico. No se aplica ranking de frecuencia. Puede corresponder a una compra anterior a la del último costo si la última no tiene proveedor. El nombre se obtiene de proveedores de la misma empresa. Sin evidencia se muestra Sin proveedor en pantalla y vacío en el Excel. No se inventa ni asigna proveedor al producto.

## Actualización, generación y seguridad

La lista se consulta al abrir/cambiar de sucursal, buscar, volver al foco y cada30s mientras el módulo está visible. Se pagina100 filas; servidor acepta hasta200 por página, sin truncar el total. La recarga con datos idénticos no recrea inputs ni pierde la edición. La selección se limpia al cambiar de sucursal. Cantidades solo permanecen en memoria del navegador: recargar/cerrar pierde el borrador, deliberadamente sin almacenamiento en BD.

Generar, exportar e imprimir reconsultan stock, mínimo, costo y proveedor en el servidor; el cliente solo envía ID de producto y cantidad manual. Los productos que ya superaron el mínimo o no pertenecen al ámbito no aparecen en el documento, con aviso de omisión. Un pedido íntegramente vacío/0 o sin productos aún elegibles se rechaza con mensaje claro. No se reserva stock; los documentos son una consulta en el momento de generarlos.

Rutas: GET /api/purchasing/requirements y POST /api/purchasing/requirements/{generate,export,print}. Los POST son operaciones de lectura que requieren permiso ver de replenishment. Mantienen autenticación, empresa de sesión, acceso de usuario a sucursal y RLS. El servidor ignora nombres/costos/proveedores aportados por el cliente, normaliza UUID, evita duplicados, valida cantidad finita/no negativa/hasta3 decimales y limita10.000 productos seleccionados. No permite bypass por empresa_id.

La impresión genera HTML escapado con empresa, sucursal, fecha y ocho columnas, preparado para A4 horizontal, y abre el diálogo nativo desde la interfaz. No se enviaron documentos a una impresora física. Excel contiene ocho columnas, códigos como texto, cantidades con3 decimales, costos informativos y hoja Información. El exportador genérico anterior se excluyó solo de este módulo para evitar una segunda exportación que incluyera filas no seleccionadas.

## Archivos funcionales

Modificados:
- server/src/app.js: registrar módulo y compartir conteo por sucursal del Dashboard.
- server/src/access-policy.js: permiso ver para operaciones informativas.
- public/index.html: pantalla reutilizada, vínculo/contador Dashboard e integración del controlador.
- public/desktop-responsive.css: estilos limitados al módulo y al contador Stock bajo.

Nuevos:
- server/src/purchase-requirement.js: consultas, validación manual, documento, Excel e impresión; solo SELECT.
- public/purchase-requirement.js: lista, borrador manual, resumen, exportación, impresión y refresco.

Pruebas nuevas: tests/purchase-requirement.test.js, purchase-requirement-native.test.js, purchase-requirement-ui.test.js y helpers purchase-requirement-seed.js/checks.js. Herramientas y resultados: operations/purchase-requirement. Los hashes y el diff completo están en RESULT.json y CHANGE_REVIEW.diff.

Se conservaron sin cambios inventory-count.js, schema.sql, stock-cost.js e inventory-entry.js. No se intentó corregir ni desplegar el requisito A/E de Conteo Físico pendiente del trabajo anterior.

## Validación final

| Grupo | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Windows, módulo/UI y regresión de compras/conteo |52|0|0|
| Linux, módulo con BD ficticia |16|0|0|
| PostgreSQL nativo Linux con44 FORCE RLS |18|0|0|
| TOTAL |86|0|0|

Tras añadir el contador visible en la propia tarjeta Stock bajo se repitieron las9 pruebas UI, incluidas en las52 del grupo Windows (no se suman dos veces). La consulta y pruebas RLS no cambiaron.

Cubierto: cinco casos de stock/min2, mínimo0, decimales, varias sucursales/empresas, permisos, datos ausentes, cantidades vacías/0/positivas/inválidas, generación, Excel, impresión, columnas/costos manipulados, históricos poblados y doce tablas idénticas antes/después de las operaciones informativas. Una compra normal de laboratorio llevó stock2 a12 y retiró el producto de lista/Dashboard y generación, sin marcar estados manuales.

La base de pruebas tiene compras históricas y una venta anulada ficticias, además de productos/lotes/precios: se comparan todos los registros, no solo totales. Ningún dato real intervino. Las44 tablas FORCE RLS están verificadas antes y después del módulo.

Rendimiento con5.000 productos adicionales en la BD: primera página por HTTP Windows/PGlite114ms, PostgreSQL nativo Linux195ms. Página51 y total5006 verificados. El costo/proveedor se consulta con joins SQL y lateral solo para la página, sin consultas por producto desde Node. Se usan índices existentes; no se añadieron migraciones ni índices. El resultado es de laboratorio, no una garantía de tiempo con un historial de compras mucho mayor en VPS.

Navegador real local: login ficticio, Dashboard7 productos, Ver todos, cantidad12 manual, resumen de una fila, descarga Excel y cambio a sucursalA2 (el producto con stock10/mínimo2 desaparece y se limpia el resumen). El archivo descargado se inspeccionó: ocho columnas, una fila RQ-equal, cantidad12 y costo4.4. Vista1265px: ancho global1265px, sin desborde global. Captura REQUERIMIENTO_FICTICIO.jpg. No se afirma una matriz de cinco resoluciones: esta tarea comprobó la vista del navegador disponible.

Incidencias de desarrollo corregidas: configuración de cuota finita2 sucursales en la fixture nativa respetando empresa_condiciones_validas; separador de sentencia en integración de carga; referencia obsoleta rpSupplier eliminada; exportador genérico duplicado; recarga innecesaria de inputs; recuperación tras error de red; UUID con mayúsculas. Todas las pruebas finales están aprobadas. No requirieron cambios en datos reales.

## Riesgos / límites

Sin bloqueantes encontrados. Datos de costo/proveedor son históricos informativos y no una recomendación comercial. El borrador no persiste al recargar y no reserva stock. El refresco visible es periódico (hasta30s); generar/exportar/imprimir revalidan inmediatamente. No se probó una impresora física ni se conectó producción. Se deberá hacer backup/readiness y validación controlada cuando el usuario autorice un despliegue.

El contenedor y la base PostgreSQL exclusivos del laboratorio fueron cerrados. La fixture del navegador fue detenida al finalizar. No se tocaron PANEL, Nginx, certificados, PostgreSQL global, datos reales, compras/ventas/históricos del PILOTO. No se crearon ZIP ni instaladores. GO para un despliegue posterior; NO desplegado.
