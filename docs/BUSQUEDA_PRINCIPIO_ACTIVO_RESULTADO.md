# Busqueda de productos por principio activo - Ventas
Resultado: GO para despliegue controlado al WEB PILOTO. NO desplegado.
## Archivos de producto
- server/src/app.js: solo GET /api/products.
- public/index.html: solo buscador Ventas, placeholder y carga de resultados.
CSS de cabecera compacta intacto. Sin cambios de esquema o migraciones.
## Consulta y funcionamiento
Ventas envia search_scope=ventas. Solo en ese contexto se agrega al predicado de busqueda el principio activo con ILIKE parcial, utilizando parametros enlazados.
Se conservan nombre, codigo interno, codigo anterior y codigo de barras, asi como prioridades de coincidencia exacta.
Normalizacion de mayusculas acentuadas españolas mediante translate para ÁÉÍÓÚÜÑ, sin quitar acentos: evita dependencia de locale C para SÓDICO/sódico. No cambia PostgreSQL global ni necesita extensiones.
Productos sin principio activo se tratan como cadena vacia con coalesce.
empresa_id, ensureBranchAccess, vinculo producto_sucursal y stock/precios/costos de la sucursal se conservan. RLS sigue fuera del control de parametros del cliente.
Los demas consumidores de /api/products mantienen los criterios anteriores al no enviar search_scope=ventas.
## Varias coincidencias
Se elimino el recorte visual a 12 elementos. Ventas solicita 30 por pagina y ofrece Ver mas resultados para acceder a todas las coincidencias. No requiere cargar todo el catalogo de una vez.
Orden estable por prioridad, nombre e ID; limite Ventas acotado a 100 por request API. Cambiar consulta/sucursal invalida respuestas anteriores; doble clic no duplica requests.
Placeholder exacto:
Buscar por nombre, principio activo, código interno o código de barras...
El codigo anterior sigue siendo buscable aunque no figure en el placeholder solicitado.
## Pruebas definitivas
Windows D: 27/27; Linux 64/64; total 91/91 ejecuciones, 0 fallidas, 0 omitidas.
Linux: 27 frontend/API + 21 busqueda con PostgreSQL nativo y RLS global + 16 regresion anterior de rentabilidad, ventas, compras, caja, equivalencias y anulaciones.
Incluye APRONAX, NAPROXENO, naproxeno, NAPRO, varias palabras, codigo interno/anterior/barras, principio null, 67 coincidencias en tres paginas, aislamientos empresa/sucursal y cajero, inyeccion textual y lecturas sin cambio en stocks/historicos.
Se comprobaron 44 tablas FORCE RLS, rol tenant sin BYPASS/superusuario y restricciones de sucursales asignadas.
Los archivos probados en Linux tienen SHA256 igual a D:. Laboratorio ficticio sin red, sin puertos publicados y sin montajes del host; no usa PILOTO real ni PANEL.
## Rendimiento
Catalogo ficticio PostgreSQL nativo: 10000 productos, 67 coincidencias, paginas de 30.
8 muestras: mediana 107.73 ms, maxima 119.20 ms.
El nuevo campo añade una comparacion por fila. ILIKE con comodin inicial y normalizacion puede requerir escaneo; no se afirma que un indice B-tree acelere esa condicion.
No se crearon indices ni extensiones. Para catalogos mucho mayores o carga concurrente real, evaluar un indice de texto adecuado y medir sobre una copia aislada antes de aplicar cualquier migracion.
La medicion es de laboratorio, no una garantia de latencia del VPS.
## Alcance y evidencias
SOURCE_HASHES.json y originales: tests/active-ingredient/.
BUSQUEDA_PRINCIPIO_ACTIVO_RESULTADO.json conserva recuentos, rendimiento y hashes.
Pruebas: tests/active-ingredient-search.test.js, active-ingredient-frontend.test.js, active-ingredient-rls-native.test.js; helper exclusivamente WEB: tests/helpers/active-search-fixture.js.
Guardas finales: backend fuera de GET /api/products identico; frontend fuera de buscador/paginacion identico al original; CSS sin cambios.
No se modificaron ventas, inventario, stock, compras ni datos reales. No se modifico PANEL, VPS, Nginx, certificados ni PostgreSQL instalado/global.
## Incidencias resueltas
La primera copia del laboratorio incluyo accidentalmente bases antiguas de tests/.native-fase4 (aprox. 4 GB); se cancelo y elimino solo el contenedor creado por esta tarea. La nueva copia incluyo solo codigo y pruebas necesarias. Los originales de D: no se borraron ni alteraron.
Se ajustaron restricciones de las fixtures ficticias (longitud de codigo y plan multisucursal) sin cambios al candidato.
El fallo real de comparacion acentuada en locale C se corrigio y se repitieron todas las suites indicadas con 0 fallos finales.
## Despliegue posterior
Solo server/src/app.js y public/index.html, con backup de ambos, SHA256 D/VPS, reinicio exclusivo WEB PILOTO y readiness/rollback controlados. No requiere migracion. NO ejecutado en esta tarea.
