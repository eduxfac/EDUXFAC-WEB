> Estado actual: V2 desplegada correctamente; 338/338 comprobaciones post-deploy en laboratorio ficticio. GO para prueba manual negativa. Ver DESPLIEGUE_RENTABILIDAD_V2_RESULTADO.md.

# Control de rentabilidad en ventas — candidato previo a despliegue

Fecha: 2026-10-13. Estado: IMPLEMENTADO Y VALIDADO EN LA FUENTE OFICIAL D:, DESPLEGADO EN WEB PILOTO MEDIANTE V2; GO PARA PRUEBA MANUAL.

## Diagnóstico

El punto de control es POST /api/sales en server/src/app.js. La ruta utiliza una transacción: comprueba sucursal/caja, prepara venta, consume lotes FEFO, calcula detalles/importe neto, registra pagos/movimientos de caja y confirma.
Antes del candidato no existía comprobación de utilidad positiva. El factor de equivalencia provenía de la petición y no se validaba contra las presentaciones del producto.

## Solución

- Validar factor y presentación contra el producto y precios_producto vigentes en su sucursal; unidad base con factor 1. Rechazar factores inventados y precisión fuera de precio 2 / cantidad y factor 3 decimales.
- Ejecutar assertSaleProfitability dentro de la misma transacción, después de asignar el importe neto definitivo y ANTES de pagos, caja y commit.
- Utilidad total = ingreso neto asignado a la línea − costo de las unidades base efectivamente consumidas. PostgreSQL numeric compara valores exactos, sin depender de cálculos enviados por el navegador.
- Agrupar por producto/presentación/factor/precio: no compensar pérdidas con ganancias de otro producto o con una línea de precio diferente.
- Para varios lotes de la misma línea, usar costo ponderado de las unidades realmente consumidas. No multiplicar cantidades fraccionarias de presentación redondeadas: un blíster repartido en tres lotes con cantidades 0.333 no debe esconder margen cero.
- Permitir solo utilidad estrictamente positiva. Si alguna línea tiene utilidad cero/negativa, lanzar un error y revertir TODA la transacción.
- Bloqueo idéntico para administrador y cajero/vendedor; sin excepción ni override.

El control usa el costo positivo del lote bloqueado por la venta. Si falta, busca evidencia de compra vinculada/última compra de esa empresa y sucursal, movimientos de costo válidos o lotes con costo registrado. Si no existe evidencia, bloquea. Un costo cero respaldado por una compra sí es verificable; el cero por defecto sin respaldo no lo es.
No se escribe ni modifica ningún costo para aplicar la regla.

Las inserciones y descuentos de stock previos dentro de la transacción son provisionales: al bloquear se hace rollback. No quedan venta, detalles, pagos, movimientos de inventario ni caja persistentes. No se cambian ventas históricas. La regla solo se invoca en nueva venta, no en devolución/anulación.

## Respuesta API y frontend

HTTP 422 con error, code y productos. Cada elemento incluye producto_id, producto, presentación/factor, cantidad, precio bruto, precio neto, costo por presentación, utilidad por presentación, utilidad total y motivo.
Códigos: VENTA_SIN_RENTABILIDAD o VENTA_COSTO_NO_VERIFICABLE. Los factores inválidos/precisión inválida devuelven 400.

Modal para utilidad no positiva:

“Venta no permitida.
El precio de venta es igual o menor al costo del producto.
Modifique el precio antes de continuar.”

Muestra producto, presentación, precio de venta/neto, costo y utilidad estimada. Si falta costo, pide registrarlo/revisarlo y muestra No verificable en vez de una utilidad inventada.
El carrito permanece para corregir precios; no recarga la página. app-dialogs renderiza texto, evitando HTML inyectado por nombres de productos.

## Archivos del candidato

- Modificado: server/src/app.js (integración de comprobación y respuesta estructurada).
- Nuevo: server/src/sale-profitability.js (presentaciones, costo verificable y utilidad exacta).
- Modificado: public/index.html (preservar datos del error API, cargar el módulo y abrir modal al bloquear).
- Nuevo: public/sale-profitability.js (detalle del modal).
- Nuevo, solo pruebas: tests/sale-profitability.test.js.

## Validación final

176 comprobaciones aprobadas / 0 fallidas / 0 omitidas (incluye pruebas contenedoras según Node). Duración aproximada: 47 segundos.
21 comprobaciones corresponden a rentabilidad y frontend, incluida la prueba contenedora; las demás son regresión relacionada.

Casos verificados:
- Utilidad positiva: venta 201, consumo normal, costos originales conservados.
- Utilidad cero y negativa: 422 con desglose.
- Carrito mixto: una línea con pérdida bloquea todo.
- Unidad, blíster y caja: costo proporcional y cantidades base.
- Tres lotes/fracciones de presentación: margen cero detectado. La prueba falló con el cálculo inicial por cantidades redondeadas y pasó al usar unidades base.
- API directa con costos/utilidades/override ficticios: sin bypass.
- Factores falsificados y cantidades submilésimas: rechazo sin alteración.
- Descuentos globales y costos con cuatro decimales.
- Costo desconocido, stock faltante sin costo, costo negativo inválido y costo cero documentado.
- Mismo producto con dos precios: no compensar línea con pérdida.
- Administrador y cajero/vendedor: misma prohibición.
- Snapshot antes/después de bloqueos idéntico en ventas/detalles/pagos, lotes/producto_sucursal, movimientos de inventario, sesiones/movimientos de caja, auditoría, compras/detalles y devoluciones.
- Devolución parcial y anulación total siguen operativas.
- Modal ejecutado desde el manejador real de checkout y API conserva campos de error.
- Regresión de catálogo, login/cambio obligatorio, CSP, aislamiento A/B, alta, suscripciones, operaciones/workers y configuración.

Todas las bases fueron PGlite/PostgreSQL en memoria y SQLite en memoria con datos ficticios. La prueba de interfaz usa VM/DOM controlado; no se ingresó al navegador o sesión de edwinpiloto. No se probó aún este candidato contra PostgreSQL nativo Linux ni se hizo smoke en el VPS.

Comando desde D: con Node 24:
`node --test --test-concurrency=1 tests/sale-profitability.test.js tests/catalog-frontend.test.js tests/pilot-login-frontend.test.js tests/phase9-security.test.js tests/tenant-isolation.test.js tests/onboarding.test.js tests/subscriptions.test.js tests/operations.test.js tests/phase10-configuration.test.js`

Salida: docs/PRUEBAS_RENTABILIDAD_CANDIDATO.log.

## Backup y SHA256

Backup local de los dos archivos preexistentes: docs/profitability_candidate_20261013/server/src/app.js y docs/profitability_candidate_20261013/public/index.html.
Antes:
server/src/app.js: 58d31e00d2414804e636429a38fdd1662b1888d5dfe7c26f533d798c76e6af0d
public/index.html: 981647b74c4c971a498f51dae74e089a2ce8b2e836f9083555ae81ec9b983430

Después / nuevos archivos:
server/src/app.js: c6af9f4f01782fc6fb94aaa8b5b3ab989135775fe8f4a2291e7430b08fe670d7
server/src/sale-profitability.js: 40ad48a5ab75088d1cf05c92f36137d33ec7b12f5515db71e4e76b7004a93220
public/index.html: 6be2da56ac48a65bed53563e947d94f604e0e0b604236db10c9bf31e7143f34e
public/sale-profitability.js: e67c194217b687f984a1334cf07d03c4a6c3d0987709582fe720a913b4fd2407
tests/sale-profitability.test.js: a4803b6d7fd3f9b725a83ecf76ac908f6bef5653b37f051a3e4ec028113cbfbe

## Despliegue pendiente

Antes de aplicar: cotejar versión VPS vs backup/base de D:, validar en laboratorio PostgreSQL nativo/Linux, respaldar exactamente los archivos existentes en VPS y preparar rollback. Copiar únicamente los cuatro archivos de aplicación anteriores y comprobar SHA256. Reiniciar solo WEB PILOTO para cargar backend y HTML/CSP; verificar health PILOTO, HTTPS, CSP y smoke aislado.
No se necesita migración de esquema ni modificar PostgreSQL global, Nginx, certificados o PANEL.
Rollback: restaurar app.js e index.html previos, retirar únicamente los dos módulos introducidos si conservan sus hashes, y reiniciar exclusivamente WEB PILOTO.

Durante esta tarea NO se desplegó, no se conectó al VPS, no se modificaron datos/inventario/costos reales ni usuarios/contraseñas, y no se modificó PANEL/PROPIO/TECNICO.
