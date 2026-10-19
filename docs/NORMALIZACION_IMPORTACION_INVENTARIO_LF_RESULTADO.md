# Normalización LF — candidato importación inicial

GO para un reintento controlado autorizado. NO desplegado. Sin conexión al VPS en esta acción.

Archivo funcional modificado: public/index.html. Se reemplazaron exclusivamente 2.204 CRLF por LF; no quedan CR.
Hash CRLF anterior: fa057a968001d037e63a41760911a9f5e5adbd1038c2c31ee320b0f700b7031d
Hash LF nuevo: 72abe70e9da810f7bc3c76b271f52e24cb3a800c0f5f2ba7f7db9e7f76a88a32
Diff lógico cero: bytes LF actuales idénticos a bytes CRLF originales después de sustituir únicamente finales de línea.

## Verificación
Nuevo procedimiento local: operations/initial-inventory-deploy-v2/DEPLOY_INITIAL_INVENTORY.py y html_integrity.py.
El precheck exige candidato LF y hash nuevo exacto; rechaza el hash CRLF anterior.
La comparación no normaliza ninguna respuesta ni acepta equivalencia aproximada: bytes candidato, archivo VPS y cuerpo HTTPS deben coincidir exactamente.
Tras estabilidad y CSP válidas, registrará HTML_HASHES.json con hash_D_LF, hash_VPS y hash_HTTPS. Si difieren, fallará y usará rollback.
VPS/HTTPS todavía no comparados con el candidato nuevo: pendiente de futuro despliegue autorizado. No se subió ni ejecutó la herramienta.
No reutilizar el directorio remoto del despliegue fallido; el próximo intento requiere work nuevo y precheck de baseline actual.

## Validación local
Servidor local con base ficticia: HTTP 200, archivo D LF = cuerpo HTTP byte a byte y CSP exacta.
129/129 node:test (importación, plantilla de 15 columnas/Información/2 lotes, productos, rentabilidad, costos, búsqueda y modal).
7/7 pruebas de verificación estricta: candidatos antiguos CRLF y diferencias del archivo/HTTP rechazados.
5/5 comparaciones visuales: 1920, 1366, 1024, 768 y 375. Mismo texto, tipografía y geometría en Inventario.
Total: 141 aprobadas, 0 fallidas, 0 omitidas. No se repitió Linux nativo porque no cambió backend; su validación previa permanece como evidencia histórica.

## Alcance
Backend (app.js, initial-inventory.js, csp-header.js, db.js) y CSS con SHA256 intactos. Sin cambios de lógica, Nginx, PostgreSQL, PANEL o datos reales. Todos los datos de pruebas fueron ficticios en memoria. Laboratorio y pestaña de prueba cerrados.

Evidencias: operations/initial-inventory-lf/RESULT.json, TEST_REGRESSION.log, TEST_INTEGRITY.log y docs/initial_inventory_lf/VISUAL_RESULT.json.