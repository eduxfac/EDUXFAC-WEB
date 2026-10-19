# Detalle de compra - rediseño visual
Resultado: GO para despliegue controlado. NO desplegado al VPS.
## Archivos
public/index.html: envoltorios visuales de Información general y Detalle de productos, clase de tabla y una clase condicional en apertura de compra.
public/desktop-responsive.css: estilos exclusivos de #reportDocumentModal.purchase-detail-view.
No se modifican nombres internos, IDs, llamadas API, formateadores, campos, expresiones de importes ni cálculo alguno.
## Diseño
Encabezado azul degradado, icono documental, título 24px, subtítulo existente y cerrar con icono X.
Diez tarjetas con etiquetas discretas, valores destacados, iconos, fondo claro, bordes suaves.
Sección de productos con nueve columnas originales, encabezados legibles, filas alternas y números alineados.
Franja inferior con descuento a la izquierda y total destacado a la derecha.
Tarjetas 4/3/2/1 columnas según espacio. Tabla con scroll horizontal interno desde 1024 en la fixture; cuerpo con scroll vertical independiente. Fuentes constantes entre resoluciones (título 24, valores 15, celdas 14, encabezados 13, etiquetas 12 y total 28 px).
## Validación
6/6 pruebas automatizadas: mismo contenido antes/después, importe total/descuento idénticos, campos y celdas completos, nulos/moneda/escapado, venta anulada idéntica, apertura/cierre/ruta API y respuesta obsoleta preservados, cinco scripts inline compilan.
10/10 comparaciones responsive: compra y venta anulada en 1920,1366,1024,768,375 (altura 1080).
1 comprobación móvil de scroll interno hasta las columnas finales.
Total 17 comprobaciones aprobadas, 0 fallidas.
Sin solapamientos ni scroll horizontal de página; modal contenido en viewport. Venta anulada conserva contenido y geometría exactos. Cabecera, cuerpo y resumen no se pisan.
## Alcance
Fixture exclusivamente local con datos ficticios y funciones reales de render/apertura/cierre extraídas del HTML. API sustituida por respuesta ficticia dentro de la fixture; no se inició el backend ni se accedió a bases reales.
Fuente oficial de D:. Backend y lógica de rentabilidad conservan SHA256. Fuera del renderer visual y una clase de presentación, HTML/JavaScript idénticos.
Reglas nuevas CSS condicionadas a detalle de compra; no aplican al modal de anulaciones ni otros módulos.
No hubo SQL, cambios en compras históricas, PANEL, VPS, Nginx, certificados ni ZIP.
Sin bloqueantes en los casos probados. La tabla mantiene sus nueve columnas mediante desplazamiento interno en pantallas estrechas.
## Evidencias y reproducción
docs/purchase_detail_visual/MATRIX.json, RESULT.json y capturas purchase_<ancho>_<before|after>.jpg, purchase_375_table.jpg.
node --test tests/purchase-detail-visual.test.js
python tests/purchase-detail-visual/serve_fixture.py ; URL http://127.0.0.1:4403/ ; Abrir detalle. Agregar ?baseline=1 para antes, ?kind=cancellations para anulación. Detener con Ctrl+C.
La fixture de esta ejecución se cerró después de las pruebas.
