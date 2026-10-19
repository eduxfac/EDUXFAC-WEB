# Despliegue controlado de consistencia de costos — WEB PILOTO

**GO. Despliegue finalizado y verificado.**

Migración 007_consistencia_costos aplicada únicamente a eduxfac_web_piloto, en una transacción. Versión registrada en web_schema_migrations. Las 48 tablas históricas/funcionales conservaron filas y huella de contenido; vistas, security_invoker, permisos y RLS conservados. 44 tablas siguen FORCE RLS. Nueva apertura nullable, sin backfill.

## Archivos y SHA256

| Archivo | Antes | Después, idéntico D: y VPS |
|---|---|---|
| server/src/app.js | c6af9f4f01782fc6fb94aaa8b5b3ab989135775fe8f4a2291e7430b08fe670d7 | aea688d15a8022b8c5fbb38616c4aa50a86c0efe65e14c788a18f0278cd03d16 |
| server/src/sale-profitability.js | 40ad48a5ab75088d1cf05c92f36137d33ec7b12f5515db71e4e76b7004a93220 | 0eb7a95cfe300f8649fb6e8dd5c6a71795bb0fec52b6018a1d7803644eafae5b |
| server/src/inventory-entry.js | 8ab55caf191240b9fd4b69239e930967f75dd4de9dfb3275d700819852e8e1e9 | 0b3a49ac0ea077db9bc29fb8dbc08aa2d92d20aa8761a47f81652eb1c4de897f |
| server/src/stock-cost.js | NO EXISTÍA | f2f1bb2c8f05f8ee4b1a9b6a2d468a141575281680afb0b41e43c871819ddab8 |
| database/schema.sql | 71a5d8d80d8d2236a6773ae6e9fafa1e52bb38e43b44f25e96db5764fde24856 | 693f6f2ba6f4b2aa35d7103375d9780c7db80b63d78ccd24b24886a6b2225e40 |
| database/migrations/007_consistencia_costos.sql | NO EXISTÍA | 523f57aaad2cf517158306ae7ca623549cee722cb3f6aee59673a2add7924079 |
| public/index.html | a08a0ec8aa8837d92842682ea56f467081d6a1d247d05732faedf6c8560d1c04 | a03b1cf10bddd39ccb171accdf0e724498903f3656e20fdc5b31136e460c2392 |

## Respaldos y rollback

- Archivos: `/home/eduxadmin/.local/share/eduxfac/cost_consistency_deploy_20261014_005646/backup`. Cinco copias previas verificadas y dos marcadores de ausencia para los archivos nuevos.
- Base PILOTO pre007: `/home/eduxadmin/.local/share/eduxfac/cost_consistency_deploy_20261014_005646/backup/eduxfac_web_piloto_pre007.dump`.
- SHA256 dump: `6ed5a644b12e6b53fde3c552d6f1aec88094754f585d854e42e2114849ac496c`.
- Backup privado PostgreSQL custom con inserts y migrator RLS. Archivo/TOC legible y filas verificadas para 48 tablas históricas. No se restauró sobre una base real. Backups anteriores conservados.

Comando de rollback preparado; NO ejecutado:

```bash
/usr/bin/python3 /home/eduxadmin/.local/share/eduxfac/cost_consistency_deploy_20261014_005646/ROLLBACK_RENTABILIDAD_V2.py --apply
```

Rollback verifica hashes y cambios de terceros, restaura archivos originales/ausencias, reinicia exclusivamente WEB PILOTO y valida readiness/CSP/HTTPS. Retiene el esquema 007 compatible con el código previo; no elimina historia ni estrecha numeric.

## Readiness y PM2

- Loopback 127.0.0.1:3001: tres muestras estables HTTP 200/PILOTO, 6.146 s desde solicitud de restart.
- HTTPS app: tres muestras estables HTTP 200/PILOTO, 9.745 s desde solicitud de restart.
- Restart + ambas verificaciones: 10.019 s.
- Dos CONNECTION_REFUSED durante arranque, observadas y registradas antes de estabilidad. Ningún HTTP 500.
- PM2 EDUXFAC-WEB-PILOTO id 4, PID 306007, online, puerto 3001. Un restart (contador 6 → 7).
- PANEL PID 269525 y WEB anterior PID 988 sin cambios.
- app/admin/eduxfac.com HTTPS 200 desde VPS y PC. HTML D/VPS/HTTP idéntico y CSP vigente.
- Error log WEB: 0 bytes. Sin errores de módulos/sintaxis/RLS.

## Pruebas posteriores

| Suite aislada | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Linux WEB | 300 | 0 | 0 |
| PostgreSQL nativo: costos, rentabilidad, servidor RLS | 71 | 0 | 0 |
| Total | 371 | 0 | 0 |

Laboratorio con siete hashes idénticos a D/VPS; sin red, mounts ni puertos publicados. PostgreSQL efímero ficticio. Contenedor detenido al terminar.

Cobertura: login/empresa/cambio obligatorio/frontend; venta rentable; utilidad <=0/costo desconocido/API; snapshot; unidad/blíster/caja; varios lotes; sobreventas/descuentos; devoluciones/anulaciones en seis órdenes; compensación parcial/total; concurrencia; stock/caja; compras/importaciones/ajustes; aislamiento A/B/RLS; inventario/reportes y etiqueta.

Cuenta edwinpiloto verificada READ-ONLY: activa, empresa PILOTO001 activa, suscripción ACTIVA/vigente, auth_version 3, sin cambio obligatorio pendiente. No se utilizó/cambió su contraseña ni se realizaron ventas o cambios de cliente en VPS. Login real con su contraseña queda como validación manual; el flujo está aprobado en laboratorio.

Etiqueta HTTP: **Compra promedio por documento**. Cálculo conservado.

## APRONAX y siguiente paso

**APRONAX NO reparado.** DFDF: stock 0/costo 1.57; sin lote: stock 120/costo 0.00. Compras/ventas/devoluciones/kardex/usuarios/suscripciones conservan sus huellas. Inventario sigue S/31.20.

**GO técnico para reparación controlada posterior**, pendiente de orden explícita, precheck/backup actualizado y confirmación física del lote DFDF. No se subió ni ejecutó repair-apronax.mjs en VPS. Si el caso no cambia: S/188.40 APRONAX + S/31.20 PARACETAMOL = S/219.60, sin alterar cantidad física.

PANEL, Nginx, certificados, PostgreSQL global, base antigua eduxfac, usuarios y suscripciones no modificados. Sin ZIP.

Evidencias: DESPLIEGUE_CONSISTENCIA_COSTOS_EVIDENCIAS.json; DESPLIEGUE_CONSISTENCIA_COSTOS_RESULTADO.json; CONSISTENCIA_COSTOS_POST_DEPLOY_PRUEBAS.json; NATIVO_POST_DEPLOY_CONSISTENCIA_COSTOS.log; LINUX_POST_DEPLOY_CONSISTENCIA_COSTOS.log.
