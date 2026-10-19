# Ventas: cabecera compacta

GO para despliegue controlado del CSS. No desplegado al VPS.

Archivo de producto modificado: public/desktop-responsive.css.
Cabecera compartida condicionada con #app:has(#sales.active); fuera de Ventas conserva su geometria.
Solo espaciado, padding, margenes, alturas, gaps y distribucion. Sin reglas font-size nuevas, sin ocultar controles ni textos.

## Medicion del tramo superior
Desde el borde superior de sucursal/usuario hasta el borde inferior del bloque de documentos. No incluye la navegacion lateral/superior.

| Ancho | Antes px | Despues px | Reduccion | Espacio ganado hasta productos px |
|---|---:|---:|---:|---:|
| 1920 | 296 | 199 | 32.77% | 113 |
| 1366 | 296 | 199 | 32.77% | 113 |
| 1024 | 349 | 231 | 33.81% | 134 |
| 768 | 472 | 231 | 51.06% | 257 |
| 375 | 663 | 419 | 36.8% | 260 |

## Alturas de subbloques

| Ancho | Cabecera antes/despues | Nueva Venta antes/despues | Documentos antes/despues |
|---|---:|---:|---:|
| 1920 | 75/53 | 73/59 | 118/75 |
| 1366 | 75/53 | 73/59 | 118/75 |
| 1024 | 75/53 | 126/76 | 118/90 |
| 768 | 131/53 | 126/76 | 195/90 |
| 375 | 131/53 | 207/139 | 305/215 |

## Pruebas y alcance

35 comparaciones aprobadas / 0 fallidas, basadas en 70 observaciones antes/despues.
5 casos Ventas: altura reducida >=30%, misma tipografia en todos los elementos visibles, botones presentes, sin solapamientos, sin desborde de pagina.
30 comparaciones de Productos, Inventario, Compras, Reportes, Usuarios y Configuracion: geometria y fuentes identicas antes/despues.
Documentos: una fila en 1920/1366/1024/768; dos columnas y tres filas en 375. Seleccion conserva borde azul de 2px y fondo activo.
Se conservaron Buscar, Cliente, Limpiar y Precio, asi como el estado de caja. El HTML actual no incluye un boton Opciones; no se agregaron HTML, JavaScript ni funciones.
Datos ficticios y scripts de negocio deshabilitados en la fixture. No se ejecutaron operaciones de ventas, API ni base de datos. No se conecta al VPS para estas pruebas.
Sin bloqueantes en los estados verificados. En tablet se obtiene mayor reduccion (51%) al evitar varias filas de cabecera/documentos, sin retirar contenido.
Altura de prueba 1080 px; mediciones DOM completas y capturas de viewport. Vista movil adicional desplazada al bloque superior.
JavaScript inline/HTML y backend mantienen SHA256 previo. No se modificaron PANEL ni otros proyectos.

## Evidencias

docs/sales_compact_visual/MATRIX.json, RESULT.json, EXTRA_CHECKS.json y capturas sales_<ancho>_<before|after>.jpg.
Prueba repetible de evidencias: python tests/sales-compact/validate_results.py
Fixture para comparacion manual: python tests/sales-compact/serve_fixture.py; URL http://127.0.0.1:4401/?screen=sales ; agregar &baseline=1 para CSS previo; detener con Ctrl+C.
El servidor de pruebas de esta ejecucion fue detenido.

SHA256 candidato: bd8eb2433919c82b67eb0b9b83603cd7a388b0e441c62018cad89296a1522271
