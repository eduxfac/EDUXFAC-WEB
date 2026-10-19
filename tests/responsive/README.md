# Pruebas responsive WEB local
Fuente exclusiva: proyecto oficial de D:. No requiere instalar dependencias, base de datos ni credenciales.
## Fixture visual aislada
Desde la raiz del proyecto: python tests/responsive/serve_fixture.py
Abrir http://127.0.0.1:4399/?screen=sales. Para detener: Ctrl+C en esa terminal.
Pantallas: sales, productsAdmin, inventory, purchases, reports, usersAdmin, settings.
El servidor muestra HTML y CSS oficiales con datos ficticios; elimina scripts de aplicacion y no realiza operaciones de negocio. Productos incluye el modal real de alta. Inventory incluye su filtro de historial.
Agregar &baseline=1 usa la hoja CSS anterior para comparar.
## Matriz ejecutada
Navegador integrado Chromium, anchos 1920/1366/1024/768/375 y altura 1080. Medicion DOM de toda la pagina, incluidos elementos debajo del primer viewport.
Se verifican desbordes de pagina y elementos, tipografia constante, columnas de formularios y contenedores con scroll local.
Capturas full-page para 1920/1366; de viewport para 1024/768/375 por limitacion de captura del navegador. Vistas adicionales del carrito movil y del historial.
Resultados: docs/responsive_visual/FINAL_MATRIX.json; primera pasada: INITIAL_MATRIX.json.
## Validacion repetible
python tests/responsive/validate_results.py
Comprueba las 35 combinaciones registradas, capturas, fuentes constantes y SHA256 de la fuente probada. No vuelve a abrir el navegador. Si cambia CSS, repetir la matriz visual y renovar evidencias/hashes.
No sustituye pruebas funcionales de API ni cubre todos los subpaneles, estados de error o modales secundarios.
