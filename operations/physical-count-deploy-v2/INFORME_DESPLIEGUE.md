# Reintento V2 de despliegue de conteo físico

Resultado: NO-GO para validación manual de la mejora; rollback inmediato ejecutado y verificado. El WEB PILOTO conserva inventory-count.js anterior.

## Aplicación

Se creó un respaldo nuevo, con SHA256 comprobado, conservando los backups previos. Solo se reemplazó server/src/inventory-count.js. La copia descargada del VPS coincidió byte a byte con D:.

Antes y actualmente activo tras rollback:
1e99adfc02152a633bcc3724d5fdc5f5d7f6b3871ff1f6feaf30fa2ddb488e65

Candidato aplicado y posteriormente revertido:
d244957d7b5c6983b4e7f2a1c3037e2e99d90e8d403678a1cdf9203aa83b5656

Backup: /home/eduxadmin/.local/share/eduxfac/physical_count_deploy_v2_20261014_171559/backup/server/src/inventory-count.js

Se reinició solo WEB PILOTO. Readiness inicial concluyó en 10.809 segundos: loopback cinco intentos, HTTPS tres; ambos con tres respuestas estables consecutivas. Health 200/PILOTO; app/admin/eduxfac.com HTTPS 200.

## Pruebas después de aplicar

| Grupo | Aprobadas | Fallos funcionales |
|---|---:|---:|
| Excel generado en VPS por módulo real, consultas READ-ONLY | 12 | 0 |
| Windows/base ficticia | 21 | 0 |
| Linux/base ficticia, ruta corregida | 21 | 0 |
| PostgreSQL nativo Linux / 44 FORCE RLS | 9 | 0 |
| Total completado | 63 | 0 |

El archivo XLSX generado en VPS corresponde a la sucursal PILOTO y tiene cuatro productos, A–L, E editable, cinco fórmulas, protección, S/, resaltados e Información. Los costos ponderados se compararon contra SQL de la sucursal. Se probaron también casos ficticios de varios lotes y costo desconocido, sin escribir en la base real. No se realizó login ni importación en BOTICA PILOTO.

Windows/Linux confirmaron E vacío, E=0 válido, J/K manipulados sin cambio de costos/precios, importación exclusivamente de cantidades, política vigente de lotes, rollback e históricos/RLS intactos. Generación ficticia de 5.000 productos: Windows 1.783 ms, Linux 2.061 ms. Estas mediciones no representan tiempo de consultas del VPS.

La regresión Linux se ejecutó satisfactoriamente en /stage/EDUXFAC/EDUXFAC WEB/01_TRABAJO_ACTUAL/EDUXFAC_WEB_ACTUAL. Preflight confirmó ocho dependencias e imports y 192 versiones transitivas contra package-lock.json. El laboratorio quedó cerrado y su contenedor exclusivo eliminado.

## Motivo de detención

La automatización privada de Microsoft Excel falló antes de abrir el libro ficticio, en VERIFY_EXCEL_POSTDEPLOY.ps1 línea 39, al invocar Workbooks.Open: objeto nulo ("You cannot call a method on a null-valued expression."). Se completaron cero comprobaciones en esa automatización. El error observado es de acceso COM; no demuestra fallo de fórmulas ni del candidato. No se determinó la causa interna de la indisponibilidad de la colección Workbooks.

La validación previa de Microsoft Excel 10/10 permanece como antecedente, pero NO se contabiliza como aprobada en este reintento. La apertura nativa del XLSX recién generado en VPS quedó sin comprobar. No se cambiaron configuraciones de Office ni se accedió a libros personales; la instancia privada fue cerrada por el harness.

Por la regla de rollback ante fallo, se restauró el archivo anterior inmediatamente; no se reintentó Excel ni se volvió a desplegar.

## Recuperación final

Hash original restaurado. PM2 WEB PILOTO id4 online, PID351895, contador17. Health loopback y HTTPS 200/PILOTO, tres respuestas estables consecutivas en ambos. App/admin/eduxfac.com HTTPS 200.

Todos los fingerprints de datos, esquema, grants y RLS del PILOTO permanecieron iguales antes, durante y después. Los demás procesos se mantuvieron intactos. No se modificaron PANEL, Nginx, certificados, PostgreSQL global, base antigua eduxfac, ventas, compras, históricos, costos, precios ni existencias reales.

Bloqueante pendiente: comprobar disponibilidad/estabilidad de la automatización nativa de Excel ANTES de otro despliegue, para evitar aplicar y restaurar por un fallo local de herramientas. Este reintento termina tras verificar el rollback, sin nuevas modificaciones del VPS.
