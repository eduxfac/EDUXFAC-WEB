# Corrección del laboratorio Linux de conteo físico

Resultado final: GO para reintentar posteriormente el despliegue. NO desplegado en esta tarea; no se realizó ninguna conexión al VPS.

## Causa exacta

El despliegue anterior creó /stage/EDUXFAC/WEB y copió server, public, database y archivos de pruebas. No copió package.json, package-lock.json ni node_modules a esa ubicación. La imagen ya tenía las dependencias WEB en:

/stage/EDUXFAC/EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL

Los imports ESM de profit-native-cluster.js buscaban pg desde el árbol de la ruta nueva; las dependencias del árbol hermano no eran visibles. Por ello ERR_MODULE_NOT_FOUND: pg apareció antes de iniciar PostgreSQL o ejecutar casos funcionales. La imagen usa eduxfac, no node, como usuario. Su working directory predeterminado es PANEL, por lo que el laboratorio ahora establece explícitamente el working directory WEB, sin leer ni modificar código PANEL.

No faltaba un paquete global ni un runtime PostgreSQL completo. NODE_PATH no es la solución para estos imports ESM. No fue necesario npm install ni npm ci: los paquetes ya instalados coinciden exactamente con package-lock.json de D:.

## Corrección mínima y reproducible

Herramientas: RUN_LINUX_LAB.ps1 y preflight.mjs, dentro de operations/physical-count-lab-repair.

- Imagen fijada por digest sha256:0a77b086357153cbf0092d178c66f1f4cd882538a246cfed02ce10c5a5b571e2.
- Docker --network none, sin puertos publicados, sin montaje del VPS ni datos reales.
- Raíz y cwd explícitos: /stage/EDUXFAC/EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL.
- Usuario explícito eduxfac. Los cambios de permisos se limitan al árbol WEB del contenedor propio.
- Se copian desde D: package.json/package-lock.json, código WEB y únicamente las pruebas/helpers necesarios. Se reutilizan las dependencias WEB que ya estaban en esa misma ruta de la imagen.
- Preflight ANTES de pruebas: ocho imports, versiones directas del lockfile y 192 versiones transitivas almacenadas, hash del candidato, acceso a PostgreSQL 16.
- Node 24.21.0; PostgreSQL 16.15. pg 8.23.0; ExcelJS 4.4.0, exactamente las versiones resueltas en el lockfile de D:.
- Si cualquier preparación o prueba falla, el runner se detiene. No contiene SSH ni acciones de deploy.
- La base PostgreSQL se inicializa dentro del contenedor con datos ficticios y puerto loopback aleatorio. Se detiene al terminar; el contenedor exclusivo se retira en finally. La imagen y todas las evidencias quedan disponibles para repetirlo.

Comando reproducible desde la fuente oficial D: (sin sudo):

```powershell
pwsh -NoProfile -File operations/physical-count-lab-repair/RUN_LINUX_LAB.ps1
```

No se instalaron paquetes globales, no se modificó Docker global ni PostgreSQL instalado.

## Pruebas finales

| Grupo | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Windows/base ficticia | 21 | 0 | 0 |
| Linux/base ficticia | 21 | 0 | 0 |
| PostgreSQL nativo Linux / 44 FORCE RLS | 9 | 0 | 0 |
| Microsoft Excel 16 | 10 | 0 | 0 |
| TOTAL | 61 | 0 | 0 |

Se añadieron dos casos explícitos a cada suite existente, únicamente de prueba: E completamente vacío no produce cambios y se rechaza por no tener filas de conteo; E=0 sí se confirma y vacía la existencia del producto indicado, sin tocar los otros productos omitidos ni costos/precios. Estas pruebas cubren también J/K manipulados.

Validado: 12 columnas A–L, cinco fórmulas por fila, protección con solo E editable, S/, fondos condicionales, ponderado de múltiples lotes, costo desconocido vacío, decimales, faltante/sobrante con política vigente, rollback, aislamiento empresa/sucursal y 44 FORCE RLS. La exportación no escribe datos. Importar ajusta solo cantidades; J/K manipulados se ignoran. Productos, precios y históricos de compras/ventas permanecen iguales en la base ficticia.

5.000 productos: Windows 1.872 ms, Linux 1.928 ms; tres consultas, fórmulas hasta fila 5.001. Estas cifras miden generación con fixture; no son benchmark del VPS.

Microsoft Excel abrió y recalculó el libro ficticio, confirmó fórmulas monetarias, faltantes/sobrantes, decimales, costo ponderado, celdas vacías, protección y colores; guardó copia calculada. Se usó instancia privada, macros deshabilitadas, entrada de solo lectura; ningún libro personal fue modificado.

Durante la preparación se corrigieron también dos incidencias de herramientas: lectura de metadatos por ruta física en vez de package.json restringido por exports; preservación UTF-8 de los archivos de prueba al añadir casos. La ejecución final aprobó todos los casos. Ninguna incidencia requirió cambios del candidato.

## Integridad y alcance

Únicamente se corrigieron herramientas/documentación del laboratorio y se ampliaron dos archivos de prueba. No cambió server/src/inventory-count.js ni ningún archivo funcional.

SHA256 candidato antes/después:

d244957d7b5c6983b4e7f2a1c3037e2e99d90e8d403678a1cdf9203aa83b5656

También se verificaron sin cambios app.js, stock-cost.js, inventory-entry.js, public/index.html y database/schema.sql frente a los hashes previos.

No se conectó al VPS, no se desplegó, no se modificaron WEB PILOTO ni datos reales. No se tocaron PANEL, Nginx, certificados, PostgreSQL global, usuarios ni precios. Los backups anteriores permanecen conservados.

Bloqueantes pendientes del laboratorio: ninguno. El runner reproducible debe pasar antes de iniciar el próximo despliegue. Se requiere una nueva instrucción de despliegue; esta tarea termina con GO de laboratorio.
