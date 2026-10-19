# Despliegue Excel de conteo físico: detenido con rollback

Resultado final: NO-GO para validar manualmente la mejora; WEB PILOTO conserva el archivo anterior.

Se respaldó y desplegó exclusivamente server/src/inventory-count.js. D: y VPS coincidieron con SHA256 d244957d7b5c6983b4e7f2a1c3037e2e99d90e8d403678a1cdf9203aa83b5656. El reinicio del proceso WEB PILOTO y readiness concluyeron en 9.329 s (loopback 5 intentos, HTTPS 3, tres respuestas consecutivas estables). App, admin y eduxfac.com respondieron HTTPS 200.

El módulo desplegado generó el conteo de la sucursal PILOTO mediante consultas READ-ONLY, sin login ni importación. Pasó 12/12 comprobaciones: columnas A–L, fórmulas, información, formatos monetarios, protección, colores, comparación del costo ponderado con SQL actual, costo desconocido vacío y un producto ficticio de dos lotes. El archivo generado se conservó como evidencia local, no se importó.

Las pruebas Windows con código idéntico al desplegado pasaron 19/19. Confirmaron importación exclusivamente de cantidades, J/K manipulados ignorados, costos/precios intactos, política de lotes preservada, decimales y 5.000 filas. Tiempo de generación 5.000 productos: 1.669 ms en laboratorio.

La preparación del laboratorio Linux usó una ruta nueva /stage/EDUXFAC/WEB que no tenía node_modules. Se corrigió primero el nombre del usuario del contenedor (eduxfac, no node). Al arrancar la regresión apareció ERR_MODULE_NOT_FOUND: pg. El suite no alcanzó a ejecutar casos de negocio. Esto es un error de preparación del laboratorio, no evidencia de fallo de la lógica candidata ni del VPS. Por la regla de rollback ante fallo, se restauró inmediatamente el archivo anterior y no se volvió a desplegar. No se repitió la prueba nativa de Microsoft Excel tras este despliegue; conserva su validación previa 10/10.

Recuento post-deploy: 31 comprobaciones aprobadas, 1 arranque de suite Linux fallido; 0 casos funcionales Linux ejecutados. No presentar las 36 pruebas previas como 36 post-deploy.

SHA256 original y activo tras rollback: 1e99adfc02152a633bcc3724d5fdc5f5d7f6b3871ff1f6feaf30fa2ddb488e65.
Backup: /home/eduxadmin/.local/share/eduxfac/physical_count_deploy_20261014_165735/backup/server/src/inventory-count.js

Recuperación READ-ONLY verificada: health loopback/HTTPS 200, PILOTO, tres respuestas consecutivas en ambos; app/admin/eduxfac.com HTTPS 200; PM2 WEB PILOTO id4 online, pid349879, reinicios15. Se reinició solo WEB PILOTO al desplegar y al restaurar. Los demás procesos permanecieron iguales.

Fingerprints de datos, esquema, RLS, grants y configuración de la base PILOTO permanecieron iguales antes, durante y después. Ninguna importación real, costo, precio, compra, venta o inventario real cambió. No se modificaron PANEL, Nginx, certificados, PostgreSQL global ni base antigua eduxfac. No se generaron ZIP.

Rollback operativo: python3 \home\eduxadmin\.local\share\eduxfac\physical_count_deploy_20261014_165735\DEPLOY_COUNT.py --rollback (ya ejecutado; no repetir).

El contenedor exclusivo de esta prueba fue detenido y retirado. Backups y evidencias conservados.

Pendiente antes de un reintento: corregir y verificar la ruta de dependencias del laboratorio Linux, ejecutar su regresión aislada y después solicitar/reanudar un nuevo despliegue autorizado. Esta ejecución terminó tras verificar el rollback.
