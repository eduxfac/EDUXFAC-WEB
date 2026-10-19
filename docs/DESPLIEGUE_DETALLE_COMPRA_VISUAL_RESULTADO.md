# Despliegue visual Detalle de compra — WEB PILOTO

Resultado: GO para validación manual. 17/17 comprobaciones aprobadas; 0 fallidas; 0 omitidas.

## Archivos y SHA256

public/index.html
ANTES: 8fc52bdd77b584ddc84dc5c83a8f3022577b2cafbcfd3b5591c5a8416bf35ead
DESPUÉS: 3e73a96aa412757b51409f2783fa84e8112fff8af623664a1d3bfecacb0a3295

public/desktop-responsive.css
ANTES: bd8eb2433919c82b67eb0b9b83603cd7a388b0e441c62018cad89296a1522271
DESPUÉS: 5d1678f53d5a2e375aa29c2532d7f34d1f78f54817bdf5409bc2aa366ae94eb6

D: = VPS = HTML/CSS servidos por HTTPS. app-dialogs.css verificado sin modificación.

Backup: /home/eduxadmin/.local/share/eduxfac/purchase_visual_deploy_20261014_190949/backup
Rollback verificado: /usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/purchase_visual_deploy_20261014_190949/ROLLBACK_RENTABILIDAD_V2.py --apply

Health loopback y HTTPS: HTTP 200; ok=true; database=true; data_mode=PILOTO. Tres muestras estables consecutivas en ambos.
app.eduxfac.com, admin.eduxfac.com y eduxfac.com: HTTPS 200.
PM2 WEB PILOTO online, PID 341404. Único reinicio necesario para recargar HTML y hashes CSP en memoria. Readiness: 10.856 segundos.

## Validación
6 pruebas automatizadas: contenido/nulos/texto escapado; importes; 9 columnas; venta anulada idéntica; apertura/cierre/API preservados; respuestas obsoletas ignoradas; compilación de scripts.
10 comparaciones responsive: compra y venta anulada en 1920, 1366, 1024, 768 y 375 px. Contenido y totales idénticos antes/después; cancelación con geometría idéntica.
1 comprobación adicional: última columna accesible mediante scroll interno móvil.
Sin solapamientos ni scroll horizontal global. Tipografía constante entre resoluciones. Encabezado degradado, tarjetas, secciones y resumen correctos.

Alcance visual: laboratorio local con datos ficticios y HTML/CSS descargados de HTTPS; los handlers reales del modal fueron ejercitados sin iniciar sesión ni consultar documentos privados. No se realizó una sesión autenticada real en Reportes > Compras; esa revisión queda para el usuario.

48 huellas de tablas intactas, políticas RLS/grants/esquema intactos, cuentas y stock sin cambios. Otros procesos PM2 intactos. No se modificaron backend, API, SQL, PostgreSQL, PANEL, Nginx, certificados ni datos reales.

Evidencias: docs/purchase_detail_deploy/MATRIX.json, RESULT.json, purchase_1920.jpg, purchase_1366.jpg, purchase_1024.jpg, purchase_768.jpg, purchase_375.jpg y purchase_375_table.jpg.

Para validar manualmente: recargar https://app.eduxfac.com con Ctrl+F5 y abrir Reportes > Compras > Detalle.