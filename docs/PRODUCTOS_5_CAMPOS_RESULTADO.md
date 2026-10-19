# Crear nuevo producto — cinco campos obligatorios

**GO para despliegue controlado posterior. Candidato en D:; NO desplegado, sin acceso al VPS.**

Obligatorios de usuario: código de producto, nombre, unidad de medida válida, stock mínimo y precio de venta. La sucursal/empresa sigue proviniendo del contexto autorizado de la sesión.

Opcionales: código de barras, principio activo, concentración, presentación, stock máximo, categoría, laboratorio y equivalencias.

## Archivos

| Archivo | SHA256 candidato |
|---|---|
| server/src/app.js | fd0f19d0837546630626a825b66c6cd3c72496faa25319f8cc9feab9327666d1 |
| public/index.html | 4ead28dfbf60c2af42c30ddb373c24c269e8fbb565601450816d1ecb2d16ea9e |
| tests/product-required-fields.test.js | 1298d628d8e09a1ba6e76ebc57cff0c61bd6aa7ab0ac0119a35feab247a5f2e3 |

## Validaciones y base de datos

- Frontend: cinco atributos required/aria-required y validación JavaScript; rechaza campos ausentes, unidad inventada, números no finitos/negativos y texto numérico inválido.
- Backend POST: mismo contrato; no convierte mínimo/precio ausente o null en cero. Stock mínimo 0 válido; precio explícito 0 sigue permitido por la regla vigente. Cálculos/ventas no cambiados.
- Código permanece autogenerado en la interfaz; ahora se envía, valida y guarda. Código repetido se rechaza con 409. Si dos formularios obtuvieron el mismo código, se necesita obtener otro mediante Nuevo antes de reintentar; no se cambia silenciosamente el código.
- Textos opcionales blancos se normalizan a NULL. Categoría/laboratorio vacíos quedan NULL y se muestran como Sin categoría/Sin laboratorio; si se informan se verifica empresa y disponibilidad.
- Stock máximo vacío/null/omitido se normaliza a 0: columnas productos/producto_sucursal son NOT NULL DEFAULT 0; conserva diseño actual.
- Código/nombre tienen NOT NULL e índices únicos por empresa. Nombre mantiene normalización de espacios/mayúsculas. Barcode tiene índice único parcial solamente para valores no vacíos, de modo que varios productos pueden no tener barra.
- Precio de la presentación base: NOT NULL CHECK(precio_venta>=0). API exige entrada explícita válida.
- Unidad puede ser nullable en esquema legacy, pero alta exige una selección del listado actual. Edición conserva compatibilidad con unidades legacy existentes.
- Equivalencias no exigidas; se conservan validaciones originales si se agregan.
- Sin cambios de schema.sql ni migración. El validador compartido admite opcionales también al editar productos creados con mínimos; PUT conserva el código existente.

## Pruebas

| Suite | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| 27 casos nuevos, frontend/API/PostgreSQL nativo | 27 | 0 | 0 |
| WEB Linux (incluye los 27 con PostgreSQL PGlite) | 327 | 0 | 0 |
| PostgreSQL nativo: costos/rentabilidad/servidor RLS | 71 | 0 | 0 |
| Total de ejecuciones | 425 | 0 | 0 |

398 comprobaciones de suite; los 27 casos nuevos se ejecutaron además con PostgreSQL nativo, sumando 425 ejecuciones. Base ficticia aislada, sin red/puertos/mounts. Hashes D/laboratorio idénticos. Laboratorio detenido al terminar.

Cobertura: guardar con cinco campos; ausencia de cada obligatorio sin escrituras parciales; vacíos/nulls/omitidos en cada opcional; todos los opcionales vacíos juntos; equivalencias omitidas; mínimo/precio 0 explícitos; números maliciosos/negativos/no finitos; unidad inválida; duplicados código/nombre/barcode; barcode vacío repetido; referencias a catálogos ajenos; esquema/nulabilidad; catálogos/dialogos/frontend; regresión compras/stock/caja/ventas/devoluciones/costos/RLS.

## Alcance y respaldo

Originales locales de app.js e index.html: `D:\EDUXFAC\EDUXFAC WEB\01_TRABAJO_ACTUAL\EDUXFAC_WEB_ACTUAL\docs\PRODUCTOS_5_CAMPOS_ORIGINALES_20261014_014153`. SHA256.json y diffs preservan evidencia. Formato de líneas no alterado fuera de regiones modificadas.

Comparación protegida: backend fuera de alta/validador y frontend fuera de formulario/validación/guardado de productos idénticos al original. No se modificó código de compras, inventario, ventas ni reportes, ni lógica de rentabilidad/costos.

No se modificó PANEL, base real, APRONAX, Nginx/certificados ni VPS. Sin ZIP.

## Siguiente despliegue, pendiente de orden

Solo server/src/app.js y public/index.html. Sin migración. Crear backup remoto nuevo, contrastar hashes (VPS aún conserva versión previa), copiar esos dos archivos y reiniciar exclusivamente WEB PILOTO por caché HTML/CSP; readiness V2 y smoke aislado. NO se preparó/aplicó ninguna operación remota en esta tarea.

Logs: PRODUCTOS_5_CAMPOS_NATIVO.log; PRODUCTOS_5_CAMPOS_REGRESION_LINUX.log; PRODUCTOS_5_CAMPOS_REGRESION_COSTOS_RLS.log.
