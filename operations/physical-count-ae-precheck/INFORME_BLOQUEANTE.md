# Precheck de la regla absoluta A/E de conteo físico

NO-GO antes de despliegue. No hubo conexión al VPS, copia de código ni reinicio. No hizo falta rollback ni un backup nuevo porque la incompatibilidad se detectó en la fuente D: y un laboratorio ficticio antes de cualquier modificación remota.

El adjunto dd074919-8ce1-4a32-bd18-4f3f616638bb agrega un requisito que difiere de lo validado anteriormente: D debe ignorarse por completo, también para validaciones. La lógica vigente usa D como baseline para detectar cambios desde la exportación. No actualiza datos maestros desde D, pero su valor sí puede impedir aplicar E.

## Evidencia de código

server/src/app.js parseStockOnlyWorkbook lee codigo_interno A, codigo_barras B, nombre C, stock E y stock_exportado D. Exige D numérico. findStockOnlyProduct localiza solo por A con empresa/sucursal; no usa B/C para identificar. El conteo se aplica pasando el stock_exportado a countPlan.

server/src/inventory-count.js validateCount rechaza cuando current y baseline no coinciden, con el mensaje de stock cambiado.

Por tanto el archivo funcional autorizado inventory-count.js, sin modificar el parser de app.js, no puede garantizar que D se ignore incluso si está vacía o contiene texto. Cambiar solo la comparación de baseline dejaría pendiente la validación numérica en app.js y no cumpliría el requisito.

## Prueba obligatoria manipulada, BD ficticia en memoria

Producto A=P-A válido para empresa/sucursal. Stock actual10. E=8. Se modificaron simultáneamente B,C,D,F,G,H,I,J,K,L; D=1009, J=222, K=333.

Esperado por la nueva regla: HTTP201, stock8 y datos maestros/históricos iguales.

Obtenido: HTTP400, "El stock cambió desde la exportación. Descargue un nuevo conteo y revise las cantidades." Stock antes10, después10. La columna D no se ignora.

Comparación completa antes/después: productos2/2, producto_sucursal3/3, lotes2/2; tablas de precios/compras/detalles/ventas/movimientos/ajustes0/0. Los diez fingerprints SHA256 coinciden antes/después; no hubo ninguna escritura. Las tablas históricas estaban vacías en esta fixture; esta prueba demuestra el rechazo sin cambios, no una importación exitosa sobre históricos poblados.

Archivos de evidencia: RESULT.json (HTTP y hashes por tabla), DB_BEFORE_AFTER_FICTICIO.json (producto/lotes/precios antes y después), CONTEO_MANIPULADO_FICTICIO.xlsx y verify-ae-rule.mjs.

Prueba de aceptación de la regla A/E: FALLIDA (HTTP400 frente a201). La integridad sin cambios ante rechazo se verificó. Se detuvo el proceso, sin ejecutar un nuevo despliegue ni volver a repetir suites ajenas al bloqueante.

## Corrección mínima necesaria antes de desplegar

Ampliar el alcance autorizado a server/src/app.js además del exportador. Ajustar el parser para tomar únicamente A y E como datos del conteo y dejar de exigir/usar D. Obtener el stock actual dentro de la transacción y usarlo para calcular el ajuste, manteniendo locks, RLS, autorización de empresa/sucursal y reglas existentes de lotes. Añadir pruebas con D numérica distinta, vacía y texto, y con todas las demás columnas alteradas, incluyendo comparación BD antes/después con E aplicado correctamente. Revisar el texto de Información del exportador para que no prometa la antigua validación basada en D.

No se implementó esta corrección porque el adjunto autoriza desplegar exclusivamente server/src/inventory-count.js. No se debe afirmar todavía que solo A/E participan en la importación actual.

Candidato D: sin cambios:
d244957d7b5c6983b4e7f2a1c3037e2e99d90e8d403678a1cdf9203aa83b5656

app.js D: sin cambios:
7fd8b9361cfbd54d791aa07cbe160fe7ba69bce7589188c7d27e52e1dc3984ab

No se tocaron WEB PILOTO, PANEL, Nginx, certificados, PostgreSQL global ni datos reales. Backups y despliegues anteriores permanecen conservados. El resultado GO previo cubría la regla anterior que verificaba D; no certificaba el nuevo requisito de ignorarla.
