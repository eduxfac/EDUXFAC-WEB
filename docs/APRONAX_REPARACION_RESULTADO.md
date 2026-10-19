# Reparación controlada APRONAX — WEB PILOTO

**GO para validación manual del usuario. Reparación completada en una sola transacción SERIALIZABLE.**

Lote físico DFDF confirmado expresamente por el usuario. Helper repair-apronax.mjs y PLAN_APRONAX.json usados sin cambios; checksums del candidato validados. Base exclusiva: eduxfac_web_piloto. Migración 007 aplicada antes de ejecutar.

## Antes y después

| Elemento | Antes | Después |
|---|---:|---:|
| APRONAX DFDF, unidades | 0 | 120 |
| APRONAX DFDF, costo unitario | S/1.57 | S/1.57 |
| APRONAX sin lote, unidades | 120 | 0 |
| APRONAX sin lote, costo verificable actual | S/0.00 | S/1.57 |
| APRONAX total físico | 120 | 120 |
| Valor APRONAX | S/0.00 | S/188.40 |
| PARACETAMOL unidades | 390 | 390 |
| PARACETAMOL costo | S/0.08 | S/0.08 |
| Valor PARACETAMOL | S/31.20 | S/31.20 |
| Valor total inventario | S/31.20 | **S/219.60** |

Saldo sin lote permanece como registro histórico, en cero; el helper conserva costo verificable para operaciones futuras. No se inventó número de lote/vencimiento ni se modificaron metadatos del DFDF. No se reescribieron snapshots históricos, incluso los snapshots cero del defecto anterior.

## Precheck y dry-run

Compra comprobada: detalle 137a3877-c8c7-4d4d-ac62-22e1378f36b8, 120 × S/1.57 = S/188.40. Tres ventas ANULADAS y tres devoluciones coinciden exactamente con el diagnóstico previo. Los saldos/kardex/compra/históricos y 48 huellas de tablas iniciales coincidieron con las evidencias del despliegue; sin cambios posteriores.

Dry-run ejecutó el helper con apply:false, verificó saldos/valor/históricos/permisos/health y realizó ROLLBACK. El snapshot de todos los registros comprobados coincidió al salir. Los movimientos/auditorías del dry-run no quedaron persistidos; los identificadores seriales pueden tener huecos normales por rollback.

La ejecución real verificó de nuevo la base, ámbito, actor, compra, ventas y saldo, bloqueó los registros y aplicó el helper. El cliente de ejecución interceptó COMMIT para comprobar primero todos los valores, PARACETAMOL, otras tablas/lotes, kardex previo, RLS/ACL/esquema, fuentes WEB y health/HTTPS. Cualquier fallo en esas validaciones habría provocado ROLLBACK antes de COMMIT.

## Movimientos nuevos y auditoría

Referencia común: `2a34059b-c614-4cbe-9e77-af7e20d3583a`.

| Movimiento | Lote | Cantidad | Costo | Valor |
|---|---|---:|---:|---:|
| d603b816-7d6f-44ae-b13b-31e134d8083c | Sin lote | -120.000 | S/1.57 | S/-188.40 |
| 6d6b61c4-e8e1-4bc5-b863-d31c30af9ce7 | DFDF | 120.000 | S/1.57 | S/188.40 |

Ambos: RECLASIFICACION_COSTO / REPARACION_COSTO. Cantidad neta 0; valor neto de movimientos 0. Se reclasifica el valor ya presente en el kardex, sin duplicarlo. Motivo auditable: REPARAR_VALORIZACION_APRONAX, con origen/destino/cantidad/costo/referencia/historia_preservada.

- Auditoría 30: CONCILIAR_COSTO_STOCK.
- Auditoría 31: REPARAR_VALORIZACION_APRONAX.

45 tablas funcionales/históricas conservan huellas completas. En las otras tres: solo los dos saldos APRONAX se modificaron; todos los movimientos/auditorías anteriores conservan sus huellas, con exactamente dos movimientos y dos auditorías nuevos. Otros productos/lotes y números/vencimientos intactos. Las 44 FORCE RLS, políticas, roles/permisos, vistas, usuarios y suscripciones no cambiaron.

## Backup verificable

`/home/eduxadmin/.local/share/eduxfac/apronax_repair_20261014_011938/backup/eduxfac_web_piloto_before_apronax.dump`

SHA256: `753d4c7a3c4a7843be53143f54d7456a42d2b6db9d5bc38e4712bd762c41cd72`.

Backup completo de base PILOTO incluye tablas afectadas, datos y esquema. Archive/TOC legibles, contenido descomprimido validado y cantidades de filas verificadas para 48 tablas históricas; snapshot adicional AFFECTED_BEFORE.json de lotes y movimientos APRONAX. Archivo privado. No se restauró sobre una base real; todos los backups anteriores se conservaron.

## Verificación posterior READ-ONLY

Commit verificado de forma independiente: APRONAX 120/S188.40; PARACETAMOL 390/S31.20; total S219.60. Kardex y auditorías nuevos coinciden con los validados dentro de la transacción.

Health loopback y HTTPS: 200/PILOTO, tres respuestas estables cada uno. app/admin/eduxfac.com HTTPS 200 desde VPS y desde PC. PM2 WEB PID 306007 online, sin restart; todos los procesos y siete hashes fuente WEB permanecen iguales.

Sin cambios en PANEL, Nginx, certificados, PostgreSQL global, base antigua eduxfac, usuarios ni suscripciones. Sin ZIP. No se registró cliente ni venta nueva.

La reparación ya está aplicada: no repetir RUN_REPAIR --apply ni el helper. El helper rechaza un segundo intento porque los saldos iniciales dejaron de coincidir.

Para validar manualmente: recargar app.eduxfac.com, revisar Inventario y su valorización/Excel. DFDF debe tener 120 a S/1.57 y el total de inventario S/219.60.

Evidencia completa: APRONAX_REPARACION_PRECHECK_READONLY.json y APRONAX_REPARACION_RESULTADO.json.
