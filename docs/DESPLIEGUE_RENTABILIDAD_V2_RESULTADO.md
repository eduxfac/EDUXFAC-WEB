# Despliegue V2 de CONTROL DE RENTABILIDAD — resultado

Resultado: OK. GO para prueba manual de APRONAX con utilidad negativa en WEB PILOTO.
Fecha: 13 de octubre de 2026. Reinicio solicitado a las 18:23:10.600 Lima; validación V2 finalizada 18:23:42.510.

## Aplicación y readiness

Se desplegaron únicamente los cuatro archivos autorizados. El candidato funcional no se modificó.
La herramienta y su payload fueron verificados SHA256 local/remoto antes de ejecutar una sola aplicación.

- Loopback tuvo dos CONNECTION_REFUSED transitorios; luego tres HTTP 200 consecutivos.
- Primer 200: 3,875 s desde solicitud de reinicio; tres muestras estables: 7,553 s.
- HTTPS empezó después del loopback: tres HTTP 200 consecutivos. Primer 200 a 7,988 s; estabilidad a 10,822 s.
- Validación completa tras reinicio: 31,91 s; includes contenido/CSP, dominios, inventario y health final.
- PM2 WEB PILOTO id 4, PID 300850, online, reinicios 4 -> 5. Se reinició exactamente una vez.
- PANEL PID 269525 y WEB antiguo PID 988 no se reiniciaron.
- Health loopback/HTTPS: HTTP 200, ok=true, database=true, data_mode=PILOTO.
- app/admin/eduxfac.com: HTTPS 200, también verificado desde esta PC mediante DNS público y validación TLS.
- Cinco hashes CSP y nuevo recurso frontend verificados en la aplicación desplegada.
- No hubo error persistente ni se ejecutó rollback.

Los rechazos transitorios observados confirman que esperar un segundo no es suficiente para este arranque. Refuerzan la hipótesis sobre V1; no recuperan el código/URL históricos perdidos.

## SHA256

Los cuatro hashes posteriores coinciden exactamente con la fuente oficial D: y el payload autorizado.

| Archivo | SHA256 antes | SHA256 después / D: |
|---|---|---|
| server/src/app.js | 58d31e00d2414804e636429a38fdd1662b1888d5dfe7c26f533d798c76e6af0d | c6af9f4f01782fc6fb94aaa8b5b3ab989135775fe8f4a2291e7430b08fe670d7 |
| server/src/sale-profitability.js | AUSENTE | 40ad48a5ab75088d1cf05c92f36137d33ec7b12f5515db71e4e76b7004a93220 |
| public/index.html | 981647b74c4c971a498f51dae74e089a2ce8b2e836f9083555ae81ec9b983430 | 6be2da56ac48a65bed53563e947d94f604e0e0b604236db10c9bf31e7143f34e |
| public/sale-profitability.js | AUSENTE | e67c194217b687f984a1334cf07d03c4a6c3d0987709582fe720a913b4fd2407 |

## Backup y rollback

Backup V2: /home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013/backup

Se conservaron copias individuales originales de server/src/app.js y public/index.html. Los dos módulos nuevos antes no existían: sus marcadores de ausencia permiten restaurar ese estado. Todos los hashes/markers fueron comprobados. Backups V1 conservados.

Rollback: /home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013/ROLLBACK_RENTABILIDAD_V2.py

El preflight de rollback se verificó READ-ONLY contra los archivos actuales. No se ejecutó. Solo restaura los cuatro archivos/ausencias originales y reinicia WEB PILOTO, con readiness y hash final. Comando disponible si realmente se necesita, como eduxadmin sin sudo:

/usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013/ROLLBACK_RENTABILIDAD_V2.py --apply

## Regresión posterior

338/338 aprobadas, 0 fallidas, 0 omitidas:
- Regresión WEB Linux: 300.
- PostgreSQL nativo, rentabilidad y concurrencia: 22.
- Entry point de servidor con roles mínimos y 44 FORCE RLS: 16.

La regresión se ejecutó DESPUÉS del despliegue en un laboratorio ficticio local aislado, con 91 hashes de fuente/pruebas verificados y los mismos cuatro archivos desplegados. No son ventas realizadas sobre el cliente del VPS.

Se revalidaron utilidad positiva/cero/negativa, costo no verificable, descuentos netos, carrito mixto, unidad/blíster/caja, equivalencias manipuladas, costo por lotes, concurrencia, API directa, roles, stock/caja intactos al bloquear, anulación/devolución, compras y aislamiento A/B.
El laboratorio quedó detenido, sin red/puertos/volúmenes y sin OOM.

En el VPS solo se hicieron checks de health/HTTPS, hashes/inventario, CSP/recurso frontend, procesos y preflight de rollback. No se realizaron ventas reales ni se usaron credenciales de cliente para hacer pruebas.

## Evidencias

- DESPLIEGUE_RENTABILIDAD_V2_PRECHECK.json
- DESPLIEGUE_RENTABILIDAD_V2_TRANSFERENCIA.json
- DESPLIEGUE_RENTABILIDAD_V2_EVIDENCIA.json
- DESPLIEGUE_RENTABILIDAD_V2_EVENTOS.jsonl
- DESPLIEGUE_RENTABILIDAD_V2_TIEMPOS.json
- DESPLIEGUE_RENTABILIDAD_V2_SMOKE_READONLY.json
- DESPLIEGUE_RENTABILIDAD_V2_HTTPS_EXTERNO.json
- REGRESION_POST_DEPLOY_RENTABILIDAD_V2_LINUX.log
- PRUEBAS_POST_DEPLOY_RENTABILIDAD_V2_NATIVO_RLS.log

Cada petición V2 preserva URL, timestamps UTC, status HTTP o clasificación de transporte, duración y cuerpo sanitizado. Cada muestra readiness conserva estado/PID/contador PM2. Los manifiestos de preparación son plantillas históricas; APPLY_DONE y este resultado son el estado operativo actual.

## Restricciones y prueba manual

No se modificaron PostgreSQL, Nginx, certificados, PANEL, la base antigua eduxfac, usuarios ni suscripciones. No se realizaron ventas reales ni ZIP.

GO para abrir https://app.eduxfac.com y probar APRONAX con utilidad negativa, después de recargar completamente (Ctrl+F5). Al intentar finalizar debe bloquear la venta con el mensaje de rentabilidad y detalle de producto/precio/costo/utilidad. No debe generarse venta ni cambios de stock/caja. La prueba específica APRONAX queda pendiente del usuario.
