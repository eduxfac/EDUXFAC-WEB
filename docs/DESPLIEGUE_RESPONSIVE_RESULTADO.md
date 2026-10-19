# Despliegue responsive WEB PILOTO
Fecha UTC: 2026-10-14T13:05:46.707226+00:00
Resultado: GO para validacion manual. Aplicado exclusivamente public/desktop-responsive.css.
## SHA256
Antes: 2f14c508ae82fc96843e63dde768aabf8884565b584e36a8064672fab9f2a0f9
Despues (D: = VPS = CSS servido HTTPS): 3309210a7c0602c7559171c7f04183191a6e4ad55c798a0bd72a3217de20fe7c
## Backup y rollback
Backup individual verificado: /home/eduxadmin/.local/share/eduxfac/responsive_deploy_20261014_130348/backup/public/desktop-responsive.css
Rollback preparado, no ejecutado:
/usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/responsive_deploy_20261014_130348/DEPLOY_CSS.py --rollback
Restaura solo CSS, preserva su modo y verifica hash/health/HTTPS. No reinicia servicios.
## Servicio
Health loopback y HTTPS: HTTP 200, ok=true, database=true, data_mode=PILOTO.
app.eduxfac.com y admin.eduxfac.com: HTTPS 200, tres respuestas estables consecutivas.
Comprobaciones HTTP registradas: 54 aprobadas, 0 fallidas.
PM2 WEB PILOTO online: PID 308466, reinicios 8; ambos iguales al precheck.
Reinicios realizados: ninguno. No era necesario para un CSS estatico.
Archivos protegidos server/public/database/esquema/package y procesos conservan sus huellas/estado.
No se ejecutaron comandos de PostgreSQL, Nginx, certificados ni operaciones de negocio.
## Matriz visual post-deploy
35/35 combinaciones, 0 fallidas: Ventas, Productos, Inventario, Compras, Reportes, Usuarios y Configuracion.
Anchos: 1920, 1366, 1024, 768 y 375 px; altura 1080.
Tipografia constante entre anchos; sin scroll horizontal de pagina; sin elementos fuera del viewport.
Inventario (historial 768): filtro entre x=25 y x=728, dentro de viewport de 753 px.
Productos (modal 375): tarjeta entre x=8 y x=352, dentro de viewport de 360 px.
Reportes 375: scroll horizontal localizado en report-center-table (338 px disponibles, tabla 640 px); resto de pagina sin desborde.
## Alcance de capturas
No habia sesion autenticada disponible en el navegador de pruebas.
Las capturas de las siete pantallas se tomaron en fixture local aislada con el HTML oficial (hash D: = respuesta HTTPS) y CSS descargado del VPS (hash D: = VPS = HTTPS), datos ficticios y scripts de negocio deshabilitados.
No son capturas de una sesion autenticada en vivo ni una prueba funcional de negocio.
Capturas completas en 1920/1366; de viewport en 1024/768/375. Medicion de toda la geometria DOM visible, incluidos elementos fuera del primer viewport vertical.
Evidencias: docs/responsive_deploy_visual/MATRIX.json, RESULT.json y 36 capturas JPEG.
HTTP, backup, hashes y PM2: operations/responsive-deploy/APPLY_DONE.json, FINAL.json, HTTP_EVENTS.jsonl.
## Validacion manual
Abrir https://app.eduxfac.com y recargar con Ctrl+F5 para evitar CSS anterior en cache.
Revisar las siete pantallas con la sesion propia. No se usaron ni cambiaron usuarios, contrasenas, suscripciones ni datos reales para estas pruebas.
