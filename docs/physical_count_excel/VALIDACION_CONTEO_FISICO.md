# Conteo físico de inventario: Excel ampliado

Resultado: GO para despliegue posterior al WEB PILOTO. No desplegado ni conectado al VPS en esta tarea.

## Archivos

Código de aplicación: server/src/inventory-count.js (solo exportación del Excel).
Pruebas añadidas: tests/physical-count-excel.test.js y tests/physical-count-rls-native.test.js.
Herramientas/evidencias: operations/physical-count-excel/. Libros ficticios: docs/physical_count_excel/.

No se cambiaron app.js, stock-cost.js, inventory-entry.js, public/index.html ni database/schema.sql. Se verificaron SHA256. La planificación de ajustes y el resumen de inventario en inventory-count.js se conservaron byte a byte.

## Columnas

| Columna | Nombre | Regla |
|---|---|---|
| A | Código interno | Informativo; texto para conservar ceros |
| B | Código de barras | Informativo; texto para conservar ceros |
| C | Producto | Informativo |
| D | Stock del sistema | Existencias de la sucursal al exportar; importación verifica vigencia |
| E | Stock físico | Única columna editable; 0 válido; vacío omite producto |
| F | Falta | MAX(D-E,0), 3 decimales |
| G | Sobra | MAX(E-D,0), 3 decimales |
| H | Precio falta | F×J, 2 decimales |
| I | Precio sobra | G×J, 2 decimales |
| J | Costo | Costo de referencia verificable por sucursal; 4 decimales visibles |
| K | Precio venta | Precio vigente de unidad base: sucursal, luego general si no existe el de sucursal |
| L | Valorizado | E×J, 2 decimales |

F/G/H/I/L contienen fórmulas nativas de Excel. E vacío mantiene los resultados vacíos. J no verificable mantiene H/I/L vacíos. Excel recalcula al abrir.
Fórmulas de fila 2:

- F: `IF(E2="","",ROUND(MAX(D2-E2,0),3))`
- G: `IF(E2="","",ROUND(MAX(E2-D2,0),3))`
- H: `IF(OR(E2="",NOT(ISNUMBER(J2))),"",ROUND(F2*J2,2))`
- I: `IF(OR(E2="",NOT(ISNUMBER(J2))),"",ROUND(G2*J2,2))`
- L: `IF(OR(E2="",NOT(ISNUMBER(J2))),"",ROUND(E2*J2,2))`

D/E/F/G numéricos; H/I/J/K/L moneda S/. E amarilla; F>0 naranja; G>0 verde. Hoja protegida con solo E editable, filtro y encabezados inmovilizados. Protección orientada a evitar errores, no una frontera de seguridad: el backend ignora F–L aunque se manipulen.

## Costo y varios lotes

El sistema ya valoriza por SUM(cantidad_disponible × costo_unitario) de los lotes de cada producto/sucursal. Con stock positivo, J = valor actual / stock actual, siempre que los costos del saldo sean verificables. Ejemplo: 50×1.57 + 50×1.65 = 161; stock100; J=1.61. No se utiliza promedio simple.

Con stock cero/negativo se reutiliza countPlan para obtener el lote destino de un eventual sobrante y su costo verificable. Si falta evidencia, J queda vacío y resaltado; no se inventa costo. Costo cero documentado mediante compra o inventario inicial es válido y se distingue de cero desconocido.

H/I/L son estimaciones con un costo único. El valor real después del ajuste puede diferir con varios lotes, porque se mantienen las reglas actuales de descuento de lotes antiguos y asignación de sobrantes al lote correspondiente. Sus costos propios no se sobrescriben. Esta diferencia se explica en Información y en la nota de J.

## Importación

Una fila por producto. El backend conserva el parser existente: A/B identifican producto, D valida el stock exportado y E determina cantidad física. F–L no producen cambios de costo/precio. J/K alterados manualmente y fórmulas falsas se ignoraron en pruebas. No se modificaron reglas de compras, ventas, costos, precios ni históricos.

## Validación final

- Windows/base ficticia: 19 aprobadas, 0 fallidas, 0 omitidas.
- PostgreSQL nativo Linux: 7 aprobadas, 0 fallidas, 0 omitidas; 44 tablas FORCE RLS, empresa/sucursal y datos históricos intactos.
- Microsoft Excel 16: 10 aprobadas, 0 fallidas: apertura, cálculo, decimales, ponderación, vacíos, protección, condicionales y copia calculada.
- Total: 36 aprobadas / 0 fallidas / 0 omitidas.
- 5.000 productos: 1.823 ms en este laboratorio, 3 consultas; fórmulas hasta fila 5.001. Medición local, no garantía de tiempo del VPS.

Resultados calculados por Excel: 100/95 costo1.57 -> Falta5, Precio falta7.85, Valorizado149.15; 100/105 costo2 -> Sobra5, Precio sobra10, Valorizado210; 100/100 -> Falta0/Sobra0; 95.125 costo1.2345 -> Falta4.875, Precio falta6.02, Valorizado117.43.

Incidencias resueltas: las propiedades locked=true se omiten por defecto en ExcelJS; se verifica que no sean false. El formato condicional usa relleno diferencial bgColor para que Excel aplique los fondos. La automatización privada de Excel rechazó llamadas mientras estaba ocupada: la ejecución final con espera tras abrir aprobó 10/10. No se cambiaron configuraciones de Office ni libros del usuario.

No hay bloqueantes funcionales encontrados. Importes estimados y costos desconocidos se muestran explícitamente; no sustituye la valoración real por lote.

La base QA y el contenedor exclusivos de prueba se cerraron. No se tocaron bases reales, PANEL, Nginx, certificados ni PostgreSQL global. El Excel ficticio calculado es material de revisión; NO debe importarse a una sucursal real.
