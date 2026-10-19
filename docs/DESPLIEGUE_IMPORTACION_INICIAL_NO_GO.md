# Despliegue importación inicial — NO-GO y rollback verificado

Resultado: detenido al primer fallo, sin repetir despliegue. WEB PILOTO original restaurado.

## Causa exacta
URL: http://127.0.0.1:3001/. HTTP 200; sin error de conexión, TLS o aplicación.
Candidato index.html: 2.204 saltos CRLF. El módulo existente csp-header.js normaliza CRLF a LF para servir webIndexHTML y calcular CSP. Por ello el cuerpo HTTP coincide exactamente con el candidato normalizado y difiere del hash del archivo.
Hash archivo: fa057a968001d037e63a41760911a9f5e5adbd1038c2c31ee320b0f700b7031d
Hash HTTP / archivo normalizado: 72abe70e9da810f7bc3c76b271f52e24cb3a800c0f5f2ba7f7db9e7f76a88a32
La validación previa no cubrió esta comparación byte a byte del HTML servido. No se corrigió el candidato en esta acción.

## Hashes
server/src/app.js
Antes: 7c32762622b79f77c5b3cb03ce0bc16f355eaf7c4766d865e6c29aab51ad02ab
Aplicado temporalmente: 7fd8b9361cfbd54d791aa07cbe160fe7ba69bce7589188c7d27e52e1dc3984ab
Después del rollback: 7c32762622b79f77c5b3cb03ce0bc16f355eaf7c4766d865e6c29aab51ad02ab

server/src/initial-inventory.js
Antes: None
Aplicado temporalmente: 57abcde45bc6b165875e1f8b6ad6c956e87bc4759a4483476f3bfef159b62377
Después del rollback: None

public/index.html
Antes: 3e73a96aa412757b51409f2783fa84e8112fff8af623664a1d3bfecacb0a3295
Aplicado temporalmente: fa057a968001d037e63a41760911a9f5e5adbd1038c2c31ee320b0f700b7031d
Después del rollback: 3e73a96aa412757b51409f2783fa84e8112fff8af623664a1d3bfecacb0a3295

## Backup y rollback
Backup: /home/eduxadmin/.local/share/eduxfac/initial_inventory_deploy_20261014_202648/backup
Backup individual de app.js e index.html y marcador initial-inventory.js.absent.json. Tras rollback el módulo nuevo vuelve a estar ausente.
Readiness antes del fallo: función V2 completó estabilidad loopback y HTTPS; luego falló comparación de contenido.
Readiness del rollback: loopback cuatro intentos, tres estables; HTTPS tres intentos, tres estables.
Reinicios: solo WEB PILOTO, uno para aplicar y otro para restaurar. PM2 online, PID 344657, contador 12.

## Recuperación
Health loopback/HTTPS HTTP 200, ok/database true, PILOTO. app/admin/eduxfac.com HTTPS 200.
48 huellas de tablas sin cambios; RLS/grants/esquema intactos. Procesos WEB antiguo y PANEL sin cambios.
Nginx conserva hash 8c59627f6f46d3ed6d799eacbd4976b635823dbbde3a4cb29078ba21e4cb51d2: importación 90s, location / 30s.
No nuevas migraciones, importaciones, escrituras en stock/productos reales ni cambios PostgreSQL global, PANEL, certificados o base antigua.

## Pendiente
No se ejecutaron pruebas post-deploy de laboratorio ni descarga nueva de plantilla, por la orden de rollback y detenerse.
El candidato funcional previo continúa con su validación 152/152; esto no constituye validación del despliegue fallido.
Para un intento posterior: normalizar exclusivamente finales de línea del HTML en D a LF, actualizar su hash y validar explícitamente archivo frente al HTML servido antes de repetir un despliegue autorizado. No requiere cambio de lógica.

Evidencias: operations/initial-inventory-deploy/PREPARE_RESULT.json, APPLY_RESULT.json, ROLLBACK_FINAL_READONLY.json, ROLLBACK_CAUSE_CONFIRMED.json y RESULT.json.