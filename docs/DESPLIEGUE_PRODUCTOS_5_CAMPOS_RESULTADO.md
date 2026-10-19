# Despliegue PRODUCTOS — cinco campos obligatorios

**GO para validación manual. Desplegado únicamente en WEB PILOTO.**

## Archivos y SHA256

| Archivo | Antes | Después, D: = VPS |
|---|---|---|
| server/src/app.js | aea688d15a8022b8c5fbb38616c4aa50a86c0efe65e14c788a18f0278cd03d16 | fd0f19d0837546630626a825b66c6cd3c72496faa25319f8cc9feab9327666d1 |
| public/index.html | a03b1cf10bddd39ccb171accdf0e724498903f3656e20fdc5b31136e460c2392 | 4ead28dfbf60c2af42c30ddb373c24c269e8fbb565601450816d1ecb2d16ea9e |

## Backup y rollback

Backup individual verificado de ambos archivos: `/home/eduxadmin/.local/share/eduxfac/products_five_fields_deploy_20261014_015653/backup`. Todos los backups anteriores conservados.

Rollback preparado, no ejecutado:

```bash
/usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/products_five_fields_deploy_20261014_015653/ROLLBACK_RENTABILIDAD_V2.py --apply
```

Restaura ambos originales solamente si hashes actuales corresponden al despliegue; rechaza cambios de terceros. Reinicia solo WEB PILOTO y verifica readiness/CSP/HTTPS. No modifica bases, Nginx, certificados ni PANEL.

## Aplicación y health

- Precheck: health 200/PILOTO, hashes originales correctos, backups verificados.
- Se copiaron solo server/src/app.js y public/index.html. Siete archivos auxiliares/candidatos de otros proyectos no fueron tocados.
- Un reinicio exclusivo EDUXFAC-WEB-PILOTO id 4, PID 308466, online/puerto 3001. Contador 7 → 8. PANEL y WEB anterior sin cambios.
- Readiness V2: loopback primero (cinco intentos, últimos tres estables) y luego HTTPS (tres estables). Restart + readiness 9.731 s. Dos CONNECTION_REFUSED mientras arrancaba, luego estabilidad; sin HTTP 500.
- Health 200/PILOTO; app/admin/eduxfac.com HTTPS 200 desde VPS y PC. HTML HTTP SHA igual a D/VPS y CSP válida.
- Error log WEB 0 bytes.

## Pruebas post-deploy

| Suite | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| PostgreSQL nativo: 27 casos nuevos + 71 costos/ventas/RLS | 98 | 0 | 0 |
| WEB Linux | 327 | 0 | 0 |
| Total ejecuciones | 425 | 0 | 0 |

Pruebas funcionales en laboratorio sin red/mounts/puertos, con bases ficticias y hashes D/VPS/laboratorio iguales. No se crearon productos ni se usaron datos reales del PILOTO para probar. Laboratorio detenido.

Se verificó: guardar solo código/nombre/unidad/mínimo/precio; ausencia separada de cada obligatorio rechazada sin escrituras parciales; barras/descriptivos/máximo/categoría/laboratorio/equivalencias opcionales; mínimo 0; máximo vacío → 0; duplicados de código/nombre y barcode solo informado; unidad válida y números finitos/no negativos. Precio explícito 0 conserva regla de creación vigente, sin alterar regla de rentabilidad en ventas.

## Sin cambios en datos/configuración

Comparación READ-ONLY completa antes/después: las 48 tablas mantienen sus huellas; esquema, políticas FORCE RLS y permisos iguales. APRONAX DFDF120/costo1.57 y sin lote0 conservados. Usuarios y suscripciones iguales. Ninguna migración o escritura en PostgreSQL real.

No se modificó PANEL, Nginx, certificados, base antigua eduxfac, compras/inventario/ventas/reportes ni otros módulos. Sin ZIP.

## Validación manual

Recargar https://app.eduxfac.com con **Ctrl+F5** antes de abrir Crear nuevo producto. El frontend actualizado envía el código requerido; una página antigua abierta podría omitirlo. Código sigue generándose automáticamente. Completar nombre/unidad/mínimo/precio y dejar opcionales vacíos.

Informe/Evidencias: DESPLIEGUE_PRODUCTOS_5_CAMPOS_RESULTADO.json, DESPLIEGUE_PRODUCTOS_5_CAMPOS_EVIDENCIAS.json y logs PRODUCTOS_5_CAMPOS_POST_DEPLOY_NATIVO/LINUX.log.
