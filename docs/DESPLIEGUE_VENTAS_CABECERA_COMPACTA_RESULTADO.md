# Despliegue: cabecera compacta Ventas

GO para validacion manual. Desplegado exclusivamente public/desktop-responsive.css en WEB PILOTO.

## Hashes y respaldo

Antes: 3309210a7c0602c7559171c7f04183191a6e4ad55c798a0bd72a3217de20fe7c
Despues (D: = VPS = HTTPS): bd8eb2433919c82b67eb0b9b83603cd7a388b0e441c62018cad89296a1522271
Backup verificado: /home/eduxadmin/.local/share/eduxfac/sales_compact_deploy_20261014_140844/backup/public/desktop-responsive.css
Rollback preparado, no ejecutado: /usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/sales_compact_deploy_20261014_140844/DEPLOY_CSS.py --rollback

## Servicio

Health loopback y HTTPS 200, ok=true, database=true, data_mode=PILOTO. Tres respuestas consecutivas estables en cada endpoint.
app.eduxfac.com y admin.eduxfac.com HTTPS 200. CSS por loopback y HTTPS: 200 y hash identico al candidato.
HTTP registrados: 54 aprobados, 0 fallidos.
PM2 WEB PILOTO online, PID 308466, contador de reinicios 8. No se reinicio el proceso.
Archivos protegidos server/public/database/esquema/package conservan sus hashes; otros procesos y WEB PILOTO mantienen estado anterior.
Sin modificaciones HTML, JavaScript, backend, PostgreSQL, PANEL, Nginx, certificados, usuarios, suscripciones ni datos reales.

## Resultado visual

35 comprobaciones aprobadas, 0 fallidas: 5 de Ventas y 30 comparaciones de los otros seis modulos.
Misma tipografia en todos los elementos visibles; sin solapamientos ni scroll horizontal de pagina; geometria igual al candidato validado.

| Ancho | Antes px | Despues px | Reduccion | Espacio ganado hasta productos px |
|---|---:|---:|---:|---:|
| 1920 | 296 | 199 | 32.77% | 113 |
| 1366 | 296 | 199 | 32.77% | 113 |
| 1024 | 349 | 231 | 33.81% | 134 |
| 768 | 472 | 231 | 51.06% | 257 |
| 375 | 663 | 419 | 36.8% | 260 |

## Alcance y evidencias

Capturas en una fixture visual aislada con HTML oficial (identico por hash a HTTPS) y CSS descargado del VPS, datos ficticios, scripts de negocio deshabilitados y sin sesion autenticada. No sustituyen la validacion manual con la sesion del usuario.
Anchos probados 1920,1366,1024,768,375 px; altura 1080. Medicion de DOM completo; capturas de viewport y detalle movil.
docs/sales_compact_deploy_visual/MATRIX.json, RESULT.json, sales_<ancho>.jpg y sales_375_detail.jpg.
operations/sales-compact-deploy/APPLY_DONE.json, FINAL.json, HTTP_EVENTS.jsonl y HTTP_FROM_PC.json.

## Validacion manual

Abrir https://app.eduxfac.com, recargar Ctrl+F5 y abrir Ventas. El CSS viejo podria persistir en una pestaña abierta antes del despliegue.
Rollback disponible sin reiniciar WEB PILOTO; no fue necesario ejecutarlo. Fixture local detenida tras la verificacion.
