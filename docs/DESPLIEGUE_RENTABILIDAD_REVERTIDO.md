# Intento de despliegue de control de rentabilidad — revertido

Fecha: 2026-10-13 (America/Lima). Resultado final: NO-GO PARA PROBAR LA NUEVA REGLA.
El candidato NO está activo. Se aplicó temporalmente y el procedimiento hizo rollback inmediato al fallar la validación HTTP. No se repitió el despliegue.

## Fallo y límite de diagnóstico

FAILURE.json registra error_code=HTTPError y rollback_ok=true.
El error ocurrió durante las verificaciones HTTP posteriores a copiar los archivos y reiniciar WEB PILOTO. Los cuatro hashes instalados se comprobaron antes de iniciar esas peticiones.
No quedó registrado el código HTTP concreto ni la URL que falló. Por eso no se atribuye con certeza a health, 500, RLS o al arranque/proxy. Una respuesta transitoria durante el reinicio es una hipótesis, no una causa demostrada.
Los logs reales son web-piloto-out-4.log y web-piloto-error-4.log. El primero tiene eventos de arranque listo; stderr está vacío. No hay errores de sintaxis, módulo ausente o perfiles RLS en esas evidencias. Nginx access.log no es legible por eduxadmin sin sudo; no se accedió ni se ejecutó sudo.
Se dejó de aplicar y se hicieron solamente comprobaciones READ-ONLY para verificar el rollback y documentar la situación.

## Archivos y SHA256

| Archivo | Antes / actual después del rollback | Candidato instalado temporalmente |
|---|---|---|
| server/src/app.js | 58d31e00d2414804e636429a38fdd1662b1888d5dfe7c26f533d798c76e6af0d | c6af9f4f01782fc6fb94aaa8b5b3ab989135775fe8f4a2291e7430b08fe670d7 |
| server/src/sale-profitability.js | AUSENTE | 40ad48a5ab75088d1cf05c92f36137d33ec7b12f5515db71e4e76b7004a93220 |
| public/index.html | 981647b74c4c971a498f51dae74e089a2ce8b2e836f9083555ae81ec9b983430 | 6be2da56ac48a65bed53563e947d94f604e0e0b604236db10c9bf31e7143f34e |
| public/sale-profitability.js | AUSENTE | e67c194217b687f984a1334cf07d03c4a6c3d0987709582fe720a913b4fd2407 |

Los dos módulos nuevos no existían antes. Se registró individualmente su ausencia; después del rollback volvieron a quedar ausentes. Los dos archivos preexistentes recuperaron exactamente sus hashes originales.
Inventario server/public/database tras rollback: 61 archivos, cero diferencias respecto al estado previo. No quedaron cambios funcionales de este intento.

## Backup conservado y verificado

Directorio VPS:
`/home/eduxadmin/.local/share/eduxfac/profitability_deploy_20261013_controlado/backup`

- server/src/app.js: copia individual verificada.
- public/index.html: copia individual verificada.
- server/src/sale-profitability.js.absent.json: constancia individual de ausencia previa.
- public/sale-profitability.js.absent.json: constancia individual de ausencia previa.

BEFORE.json, MANIFEST.json, FAILURE.json y scripts de operación conservados en la carpeta privada del intento. No se borraron backups anteriores.
Rollback preparado: ROLLBACK_RENTABILIDAD.py en esa carpeta. Ya se ejecutó automáticamente su restauración y está verificada; NO repetir rollback ni aplicación sin una nueva revisión.

## Reinicios

Se reinició exclusivamente EDUXFAC-WEB-PILOTO, PM2 4:
- Una vez para cargar el candidato.
- Una vez para cargar los originales tras rollback.
Contador 2→4; estado final online, PID 297349.
WEB anterior eduxfac: PID 988/reinicios 0 sin cambios.
PANEL PILOTO: PID 269525/reinicios 4 sin cambios.
No se reinició PostgreSQL y no se modificaron Nginx, certificados o configuración PM2 de otros procesos.

## Verificaciones posteriores al rollback

- Health HTTP 200, ok=true, data_mode=PILOTO.
- app.eduxfac.com: HTTPS 200.
- admin.eduxfac.com: HTTPS 200.
- eduxfac.com: HTTPS 200.
- Empresa BOTICA PILOTO EDUXFAC/PILOTO001 y edwinpiloto siguen activos; cambio obligatorio=false y formato del hash válido, sin mostrarlo ni usar su contraseña.
- auth_version=3, suscripción ACTIVA/version=2, mismas fechas/vigencia que antes. Estado READ-ONLY idéntico antes/después.
- No se hicieron ventas, compras, devoluciones o cambios de stock/caja sobre el cliente real; no se alteraron usuarios/suscripciones.

Las pruebas funcionales post-deploy de ventas y login con contraseña real NO se ejecutaron, porque la orden era rollback y detenerse ante cualquier fallo. Las 338 pruebas nativas/Linux anteriores siguen siendo evidencia del candidato previo, NO pruebas de un despliegue activo.

## Estado final

NO-GO para prueba manual del nuevo control, ya que no está instalado. WEB anterior al intento está restaurado y sano.
El siguiente trabajo sería investigar de forma READ-ONLY la petición HTTP fallida y revisar la validación de readiness, conservando todos los backups. No se preparó/aplicó otra versión ni se repitió el reinicio.
NO modificaciones a PANEL, Nginx, certificados, PostgreSQL global, base antigua eduxfac, usuarios o suscripciones. No ZIP.
