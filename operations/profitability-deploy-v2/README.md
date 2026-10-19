## V2 preparada en D:

Directorio operations/profitability-deploy-v2.

- Exactamente cuatro archivos autorizados, idénticos al candidato 338/338. No se modificó código funcional.
- Workdir futuro separado /home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013. Rechaza reutilizar evidencia/backup previo.
- Preflight comprueba PILOTO, proceso id 4, puerto 3001, workers desactivados, rutas, baseline, payload y sintaxis Node.
- Antes de cambiar: readiness original, inventario protegido, backups individuales SHA256 y marcadores de ausencia.
- Un único restart WEB PILOTO. Reintentos solo de observación HTTP, no despliegues.
- Readiness primero http://127.0.0.1:3001/api/health, luego https://app.eduxfac.com/api/health: tres muestras consecutivas con PID/contador estable e intervalo de un segundo. Hasta 45 segundos por endpoint, timeout HTTP hasta tres segundos.
- Distingue HTTP, TLS, timeout, conexión rechazada, DNS, PM2 y probable proxy; ante fallo HTTPS consulta de nuevo loopback.
- Verifica HTML exacto, cinco hashes CSP, nuevo recurso frontend, dominios vecinos, fuentes, inventario y procesos no autorizados.
- Cada intento registra fase, URL, código HTTP incluyendo HTTPError, timestamps UTC, duración, cuerpo sanitizado. Solo booleanos/entorno/títulos HTTP estándar; HTML por tamaño/SHA256. Nunca cookies, headers, credenciales ni mensajes arbitrarios.
- Un error transitorio reinicia el conteo y espera dentro del límite. Fallo persistente: rollback automático una vez. Integridad/scope: detención inmediata.
- Rollback verifica hashes, ausencias, readiness, HTML y dominios; no declara OK solo por retorno PM2.
- Cambios de terceros impiden sobreescritura durante rollback y quedan registrados.

## Pruebas

34 escenarios únicos aprobados en Windows y los mismos 34 en Ubuntu Linux WSL, 0 fallos finales. Incluyen recuperación tras conexión rechazada/502/503, 500 persistente, TLS, timeout, DNS, PID inestable, hashes, sanitización, backups y rollback. HTTP/PM2 simulados, copias aisladas, sin VPS.

El laboratorio Docker Node no incluía python3; se detuvo nuevamente. Linux se comprobó con Python de Ubuntu WSL sobre D:.

No se repitió la regresión funcional 338/338; los cuatro hashes continúan idénticos. El smoke funcional post-deploy queda pendiente de futura ejecución autorizada. La V2 no modifica datos del cliente.

## Procedimiento futuro NO ejecutado

1. Revisar informe, manifiesto y scripts.
2. Con autorización, crear workdir privado nuevo y transferir solo scripts V2, MANIFEST y payload autorizado. Conservar backups V1.
3. Comparar todos los hashes local/remoto de BUNDLE_SHA256.json; detener ante diferencia.
4. Solo después, como eduxadmin SIN sudo:
   /usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013/APPLY_RENTABILIDAD_V2.py --apply
5. Si OK: revisar EVENTS/APPLY_DONE y hacer smoke autorizado en contexto ficticio aislado, sin ventas reales del cliente.
6. Si falla: revisar FAILURE/DIAGNOSTICS/ROLLBACK_DONE. No repetir despliegue/rollback automáticamente.
7. Rollback manual preparado, solo tras revisar estado y si aún hace falta:
   /usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/profitability_deploy_v2_20261013/ROLLBACK_RENTABILIDAD_V2.py --apply

V2 NO subida ni ejecutada. No se modificaron PostgreSQL, Nginx, certificados, PANEL, usuarios, suscripciones ni eduxfac antiguo. V2 lista para revisión; despliegue pendiente.
