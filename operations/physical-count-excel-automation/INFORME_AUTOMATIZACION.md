# Automatización local de Microsoft Excel: conteo físico

Resultado: GO para reintentar posteriormente el despliegue. Esta tarea no se conectó al VPS y no desplegó nada. WEB PILOTO mantiene el estado restaurado anterior.

## Causa y límites de la evidencia

El error anterior fue de PowerShell: "You cannot call a method on a null-valued expression." en $excel.Workbooks.Open(...), antes de abrir el libro. La referencia COM de la cadena no estaba disponible y el script la utilizó sin verificar que Workbooks estuviera listo. El registro antiguo NO guardó un HRESULT ni el estado de cada objeto; no permite recuperar con certeza la causa interna de esa referencia nula.

No se encontró defecto del XLSX: el archivo original existía, era legible, tenía permisos normales, 13.079 bytes y ruta de 120 caracteres; lectura exclusiva correcta, sin bloqueo de archivo ni Zone.Identifier. La ruta original también se abrió exitosamente con el nuevo acceso COM, por lo que no se demostró un límite de longitud o problema de espacios/caracteres. La generación anterior esperaba el cierre de Node; no hay evidencia de copia incompleta. La nueva preparación comprueba hash y tamaño estable antes de abrir.

Se encontró inicialmente una sesión del usuario PID19068 /dde. No se enviaron Close/Quit/Stop a esa sesión. No había instancias huérfanas de las pruebas anteriores. En el diagnóstico COM directo, Workbooks existía y Count era0; no se reprodujo un fallo permanente de registro/instalación COM.

Durante las ejecuciones nuevas se capturaron rechazos transitorios reales de Excel ocupado: HRESULT 0x80010001 RPC_E_CALL_REJECTED. La espera/reintento acotado permitió continuar. Esto confirma que las llamadas pueden ser rechazadas mientras Excel procesa el libro y explica por qué una espera fija era insuficiente para un harness estable; es evidencia compatible con el fallo anterior, no un HRESULT recuperado retrospectivamente de aquel fallo.

Protected View/Trust Center: sin marca de Internet en el archivo, no se encontraron overrides en las rutas ProtectedView HKCU/policies consultadas y ProtectedViewWindows.Count=0 después de cada apertura. No se cambió ningún ajuste de seguridad ni se sacó ningún archivo de Protected View mediante bypass.

## Corrección

ExcelQaSession.cs conserva referencias COM explícitas a Application/Workbooks/Workbook y registra operación, UTC, tipo, mensaje y HRESULT. Antes de acceder a libros comprueba el PID de la nueva instancia y que no pertenezca a procesos existentes; espera Workbooks no nulo y Application.Ready. Exige Count0, abre únicamente la copia esperada y verifica FullName.

Cada ejecución usa una instancia privada limpia y una COPIA en D:\ExcelQA\<id>\countN.xlsx, con ruta de 35 caracteres. Comprueba existencia, tamaño estable en tres muestras y SHA256 idéntico. Open de solo lectura, macros/eventos deshabilitados únicamente en la instancia, sin vínculos externos ni agregar a recientes. Se fuerza CalculateFullRebuild.

Los rechazos 0x80010001/0x8001010A tienen retry de 250ms hasta12s por llamada; otros errores fallan inmediatamente y quedan registrados. No se aceptan errores de archivo o resultados incorrectos como "busy".

Al terminar se cierra Workbook sin guardar el original, se cierra Excel, se liberan referencias COM en orden inverso y se comprueba el proceso privado. Solo si fuera necesario se cierra ese PID comprobado, excluyendo procesos existentes y exigiendo /automation -Embedding. La limpieza tolera que ese PID haya terminado entre la consulta y Stop-Process, evitando falsos errores por proceso ya cerrado. Ningún cierre indiscriminado.

## Archivos y entradas

- operations/physical-count-excel-automation/ExcelQaSession.cs
- operations/physical-count-excel-automation/GENERATE_FIXTURE.mjs
- operations/physical-count-excel-automation/VALIDATE_EXCEL.ps1
- operations/physical-count-excel-automation/RUN_EXCEL_VALIDATION.ps1
- operations/physical-count-excel-automation/VERIFY_READONLY_XLSX.ps1
- Entradas anteriores VERIFY_EXCEL.ps1 y VERIFY_EXCEL_POSTDEPLOY.ps1 delegan en este validador. Sus versiones antiguas se conservaron en esta carpeta. La integración post-deploy se ensayó únicamente contra una copia local previamente descargada; no realizó SSH ni despliegue.

Comando reproducible desde la fuente oficial D:

```powershell
pwsh -NoProfile -File operations/physical-count-excel-automation/RUN_EXCEL_VALIDATION.ps1 -Runs 3
```

El generador importa countWorkbook desde la fuente oficial y usa datos ficticios y un adaptador de consultas simulado: cero conexiones a BD, cero uso de PostgreSQL. No depende de archivos históricos C:.

## Validación final

Tres aperturas consecutivas correctas con tres instancias distintas y cierre comprobado. Diez pruebas por apertura: 30/30 aprobadas,0 fallidas. Se verificaron 12 columnas, fórmulas F/G/H/I/L, J/K informativos, recálculo real de 100/95,100/105,100/100, decimales, costo ponderado1.61, costo desconocido vacío, E vacío, protección, S/, colores, Información y copia calculada.

Además,2/2 comprobaciones aprobadas sobre la copia local del Excel que se generó en VPS antes del rollback: apertura A–L/Información y fórmulas recalculadas vacías/protección/formatos. El archivo original no cambió. Se comprobó adicionalmente la apertura directa de la ruta original larga. Resultado de pruebas finales:32 aprobadas,0 fallidas; prueba de ruta original correcta.

Las incidencias detectadas durante preparación fueron exclusivamente del harness: FormatConditions.Item necesita invocación de método en COM y la limpieza debe tolerar un PID ya terminado. Ambas se corrigieron. No se tocó el candidato para resolverlas.

Los procesos privados de prueba finalizaron. Las copias ficticias y calculadas de rutas cortas se conservaron como evidencia, sin datos secretos; pueden regenerarse con el comando. La lista final no contiene procesos huérfanos de esta prueba.

SHA256 inventory-count.js antes/después:

d244957d7b5c6983b4e7f2a1c3037e2e99d90e8d403678a1cdf9203aa83b5656

También se verificaron intactos app.js, stock-cost.js, inventory-entry.js, public/index.html y schema.sql. No se tocaron WEB PILOTO, PANEL, PostgreSQL, Nginx ni configuraciones globales de Office. No se modificaron datos reales. No se desplegó.

Bloqueantes encontrados en la validación final: ninguno. GO de la automatización local, pendiente de una nueva orden de despliegue.
