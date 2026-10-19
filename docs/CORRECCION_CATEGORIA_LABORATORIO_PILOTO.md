# Corrección de Nueva categoría / Nuevo laboratorio — WEB PILOTO

Aplicada y verificada: 13/10/2026 12:54 America/Lima.

## Causa común confirmada

Ambos botones tienen IDs correctos (paCategoryNew / paLabNew) y atributos data-edux-action que llaman createProductCatalog. El delegado exige window.eduxfacActions.createProductCatalog.
El único registro window.eduxfacActions estaba dentro de la cadena HTML de fallbackReportExcelXls. No era una instrucción ejecutada por la página. El delegado retornaba silenciosamente: no abría el diálogo ni emitía POST a la API.
El arreglo anterior de login resolvió la sintaxis y el cierre anticipado del script, pero dejó este registro dentro de la plantilla. Los cinco scripts ya compilaban; el defecto restante era de ubicación/ejecución, no de IDs ni de sintaxis.

## Investigación READ-ONLY

- HTML HTTPS 200 idéntico a fuente D:/VPS; checksum previo d5c51054a23d2a16fe65b0bf1226fb4cf5d1a6f24b72b88d7f8c4887695b5aa3.
- Empresa PILOTO001 y edwinpiloto activos; rol Administrador en PRINCIPAL; cambio obligatorio ya completado.
- categorias, laboratorios y productos tienen RLS y FORCE RLS; rol WEB posee SELECT/INSERT. Consultas con contexto de empresa muestran solo su tenant.
- Catálogos del cliente: cero categorías y cero laboratorios en la consulta inicial; no se crearon registros reales durante esta tarea.
- Endpoints revisados: GET /api/catalogs, POST /api/catalogs/:kind y POST /api/admin/products. Usan empresa de la sesión y validan rol/referencias.
- createProductCatalog agrega una Option, selecciona su ID y actualiza el catálogo en memoria sin recargar. Esa lógica ya existía y no se alteró.
- El diálogo es appDialogModal, gestionado por app-dialogs.js, con campos/botones existentes y IDs correctos.
- Logs stdout/stderr WEB vacíos. No contienen evidencia de 401/403/500 del intento real; no son un registro completo de peticiones HTTP.
- No se capturó la consola del navegador del usuario. La causa se verificó en código servido y se reprodujo en prueba; el delegado ignora la acción sin lanzar error. No se usó su contraseña, token o sesión.

## Cambio

Único archivo de aplicación modificado en VPS: public/index.html.
Se trasladó una sola línea del registro global de la plantilla Excel al script principal, fuera de cadenas/funciones, antes de cerrar ese bloque. Sin cambios de backend, permisos, endpoints o bases.
El despliegue verificó que el candidato equivale exactamente a retirar esa línea e insertarla en la ubicación revisada, sin otras diferencias.
Archivo de prueba añadido solamente en D: tests/catalog-frontend.test.js.

## Backup / checksums / rollback

Backup VPS creado antes del cambio: /home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625/catalog_frontend_fix_20261013/index.html.before
Backup D: docs/catalog_frontend_fix_20261013/index.html.before
SHA256 antes/backup: d5c51054a23d2a16fe65b0bf1226fb4cf5d1a6f24b72b88d7f8c4887695b5aa3
SHA256 después, idéntico en D:, candidato, VPS y HTML HTTPS: 981647b74c4c971a498f51dae74e089a2ce8b2e836f9083555ae81ec9b983430

Rollback privado: /home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625/catalog_frontend_fix_20261013/ROLLBACK_CATALOG_FRONTEND.py
Comando como eduxadmin, SIN sudo, únicamente si se decide revertir:

```bash
/usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/phase12b_20261013_0625/catalog_frontend_fix_20261013/ROLLBACK_CATALOG_FRONTEND.py --apply
```

El rollback verifica el SHA256 vigente y el backup, restaura solo el HTML y reinicia solo PM2 4. Sintaxis/backup verificados; no fue necesario ejecutarlo. La aplicación también tenía rollback automático.

## Pruebas

La prueba de ubicación del registro falló antes del parche, reproduciendo el defecto.
Resultado final: 100 aprobadas / 0 fallidas (incluye pruebas contenedoras según Node).
- Crear categoría desde el botón delegado y el diálogo real: POST 201, opción añadida/seleccionada.
- Crear laboratorio: POST 201, opción añadida/seleccionada, categoría anterior conservada.
- Guardar producto desde saveProduct real: POST 201 usando los dos IDs recién creados.
- GET confirma ambos catálogos; la empresa B no los ve ni puede usarlos y conserva su snapshot.
- 401 sin sesión, 403 sin permiso y 409 duplicado; el error se muestra sin perder selección ni recargar.
- Regresión de login/cambio obligatorio, CSP, eventos, aislamiento A/B, altas y suscripciones.

Comando Node 24, desde la fuente WEB oficial D:
`node --test --test-concurrency=1 tests/catalog-frontend.test.js tests/pilot-login-frontend.test.js tests/phase9-security.test.js tests/tenant-isolation.test.js tests/onboarding.test.js tests/subscriptions.test.js`

Las pruebas usan PostgreSQL PGlite y SQLite en memoria, datos ficticios y DOM controlado. Ejecutan código real de delegado, diálogo, funciones frontend y API; no equivalen a una aceptación visual en navegador completo. No se registró otro cliente ni se alteraron datos del piloto.

## Verificación del despliegue

- Health loopback y HTTPS 200 / ok / database / data_mode PILOTO, tres muestras consecutivas.
- app.eduxfac.com, admin.eduxfac.com y eduxfac.com: HTTPS 200, validación TLS conservada.
- Los cinco scripts inline servidos compilan y sus hashes CSP corresponden; tres archivos JS externos 200 con sintaxis/checksum correctos.
- Registro global comprobado fuera de la plantilla en el HTML realmente servido.
- De 63 archivos de aplicación protegidos, cambió únicamente public/index.html.
- Solo WEB PILOTO se reinició para cargar HTML/CSP: PM2 4, PID 281573, contador 1→2. PANEL y WEB anterior mantuvieron procesos/configuración.
- No se modificaron PostgreSQL, Nginx, certificados, PANEL, contraseñas, usuarios o base antigua eduxfac; sin sudo ni migraciones.

Resultado: puede probar ambos botones tras Ctrl+F5 en https://app.eduxfac.com. Los nuevos elementos deben aparecer seleccionados inmediatamente. Las creaciones del cliente deben hacerse mediante la interfaz normal.
