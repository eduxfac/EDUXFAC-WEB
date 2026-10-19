# Despliegue de busqueda por principio activo - WEB PILOTO

GO para validacion manual. Aplicados solamente server/src/app.js y public/index.html.

## SHA256 antes/despues

| Archivo | Antes | Despues D: = VPS |
|---|---|---|
| server/src/app.js | fd0f19d0837546630626a825b66c6cd3c72496faa25319f8cc9feab9327666d1 | 7c32762622b79f77c5b3cb03ce0bc16f355eaf7c4766d865e6c29aab51ad02ab |
| public/index.html | 4ead28dfbf60c2af42c30ddb373c24c269e8fbb565601450816d1ecb2d16ea9e | 8fc52bdd77b584ddc84dc5c83a8f3022577b2cafbcfd3b5591c5a8416bf35ead |

HTML servido por HTTPS coincide byte por byte con D: y CSP valida para los cinco scripts inline.

## Backup y rollback

Backup individual verificado de ambos archivos: /home/eduxadmin/.local/share/eduxfac/active_search_deploy_20261014_150209/backup
Rollback preparado, no ejecutado: /home/eduxadmin/.local/share/eduxfac/active_search_deploy_20261014_150209/ROLLBACK_RENTABILIDAD_V2.py --apply

## Aplicacion y servicio

Un reinicio exclusivo WEB PILOTO id 4; PID 334480, contador 8 -> 9. Otros procesos sin cambios.
Reinicio + readiness: 14.026 s. Loopback primero: 6 intentos, ultimos 3 estables; HTTPS: 3 respuestas estables.
Health HTTP 200, ok=true, database=true, data_mode=PILOTO. app.eduxfac.com y admin.eduxfac.com HTTPS 200 desde VPS y PC.
Verificacion final: loopback/HTTPS 3 estables, mismo PID/contador, sin 500 finales.

## Pruebas post-deploy

91/91 ejecuciones aprobadas, 0 fallidas, 0 omitidas: Windows frontend/API 27; Linux frontend/API 27 + PostgreSQL nativo RLS 21 + regresion previa rentabilidad/compras/ventas/caja/anulaciones 16.
Laboratorio ficticio sin red, puertos publicados ni montajes. Fuente D/VPS/laboratorio con SHA256 identicos. No se crearon productos ni ventas en la base PILOTO para probar paginacion.
PILOTO real: 21 comprobaciones READ-ONLY aprobadas. Se ejecuto la consulta exacta extraida del backend desplegado bajo rol tenant sin BYPASS, empresa/usuario/sucursales asignadas y transaccion READ ONLY.
APRONAX se encuentra por nombre, NAPROXENO, NAPRO, minusculas, codigo interno y barras; null en principio activo no falla. Todas las coincidencias registradas estan accesibles, sin duplicados ni productos de otras empresas o lotes de sucursales no asignadas.
Coincidencias NAPROXENO reales actuales: 1. APRONAX no tiene codigo anterior registrado: ese criterio y multiples coincidencias/paginas de 30 se verificaron con fixtures ficticias (67 coincidencias), sin alterar el catalogo real.
No se inicio sesion HTTP con edwinpiloto ni se crearon tokens para ese usuario. La validacion interactiva con su sesion queda para el usuario.
44 tablas FORCE RLS verificadas en PILOTO y laboratorio. Datos de las 48 tablas de negocio, esquema, politicas, permisos, versiones de migraciones, usuarios y suscripciones conservan huellas antes/despues.
Sin cambios en stock, inventario, compras, ventas historicas ni PANEL. Sin migraciones, indices, Nginx, certificados o PostgreSQL global.

## Tiempos observados

Consulta SQL real PILOTO (no incluye HTTP/navegador): 8 muestras, mediana 11.59 ms, maxima 26.14 ms.
API HTTP laboratorio nativo con 10000 productos: mediana 106.35 ms, maxima 519.22 ms (8 muestras).
Son mediciones de esta ejecucion; no garantizan latencia de red del usuario.

## Interfaz

Placeholder HTTPS verificado exactamente: Buscar por nombre, principio activo, código interno o código de barras...
Ver mas resultados verificado: muestra paginas de 30, no recorta a 12, descarta respuestas obsoletas y bloquea doble solicitud concurrente.
Scope ventas mantiene criterios anteriores en los demas consumidores del endpoint. CSS de cabecera compacta se conservo.

## Evidencias

operations/active-ingredient-deploy/: APPLY_DONE.json, FINAL_READONLY.json, PILOT_READONLY_RESULT.json, DB_POST.json, HTTP_FROM_PC.json, EVENTS.jsonl y MANIFEST.json.
docs/BUSQUEDA_PRINCIPIO_ACTIVO_POST_DEPLOY_WINDOWS.log y ..._LINUX.log.

## Validacion manual

Abrir https://app.eduxfac.com y pulsar Ctrl+F5 antes de entrar a Ventas. Buscar APRONAX, NAPROXENO y NAPRO. No se cambia la contraseña ni se registra otro cliente.
Rollback de ambos archivos disponible y respaldos anteriores conservados. Laboratorio temporal retirado despues de guardar evidencias.
