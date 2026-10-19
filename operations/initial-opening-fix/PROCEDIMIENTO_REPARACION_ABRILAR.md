# Reparación preparada — NO ejecutada

Este procedimiento solo se ejecutará después de autorización separada para desplegar y reparar. No requiere migración de esquema, sudo ni cambios globales.

1. Desplegar exclusivamente server/src/initial-inventory.js con backup/hash/readiness del WEB PILOTO. El candidato cambia solo la apertura de nuevas importaciones; NO repara lotes existentes automáticamente. SHA256 candidato: 6509028c9ab0d4a39a2671d87637fb99b8c6584ed407f6099b3e1c39971f8ccd. Confirmar origen y VPS idénticos. Conservar rollback del archivo anterior.
2. Revalidar READ-ONLY el estado actual contra PLAN_ABRILAR.json. Si hubo venta, compra, devolución, conteo, cambio de precio/maestro o cualquier variación del fingerprint, detenerse. No regenerar el plan ni adaptarlo silenciosamente.
3. Copiar (previa autorización) repair-abrilar-opening.mjs y PLAN_ABRILAR.json a una carpeta privada nueva dentro del home de eduxadmin. Verificar SHA256 local/remoto de ambos. No copiar secretos. Los comandos siguientes suponen la carpeta /home/eduxadmin/.local/share/eduxfac/initial_opening_fix_20261014, todavía NO creada/subida.

En SSH como eduxadmin, SIN sudo, primero dry-run:

```bash
NODE=/home/eduxadmin/.local/opt/eduxfac-node24/bin/node
OP=/home/eduxadmin/.local/share/eduxfac/initial_opening_fix_20261014
"$NODE" "$OP/repair-abrilar-opening.mjs" --plan "$OP/PLAN_ABRILAR.json" --dry-run
```

Backup verificable de los registros afectados y fuentes históricas consultadas, mediante transacción READ ONLY. Archivo privado nuevo, no sobrescribe uno existente:

```bash
"$NODE" "$OP/repair-abrilar-opening.mjs" --plan "$OP/PLAN_ABRILAR.json" --backup "$OP/ABRILAR_BEFORE.json"
sha256sum "$OP/ABRILAR_BEFORE.json"
```

Solo después de revisar el dry-run y verificar el backup, y con autorización expresa de reparación:

```bash
"$NODE" "$OP/repair-abrilar-opening.mjs" --plan "$OP/PLAN_ABRILAR.json" --apply --backup-file "$OP/ABRILAR_BEFORE.json"
```

La reparación abre UNA transacción SERIALIZABLE, bloquea producto/sucursal y los tres lotes, revalida los fingerprints/backup y ejecuta únicamente estos cambios de datos:

| Lote | ID | Apertura anterior | Apertura nueva | Stock intacto | Costo intacto |
|---|---|---:|---:|---:|---:|
| EDU1 | c77e5814-875d-4b7f-a818-82ba4140922f | 45 | 0 | 3 | 15 |
| EDU2 | 16a942c2-9776-4a80-8251-1187421adb6f | 60 | 0 | 3 | 15 |
| EDU3 | b1dedd3b-54b2-44f7-aa88-19bca8d64e04 | 75 | 0 | 5 | 15 |

Se agrega UN registro de auditoría REPARAR_APERTURA_INICIAL, con plan SHA256, antes/después, operador del SO, rol PostgreSQL y checksum del backup. No se agregan movimientos de inventario. No se actualizan costos, cantidades, vencimientos, compras, ventas, devoluciones, ajustes ni registros previos de auditoría.

Antes del COMMIT se comprueban: stock 3/3/5=11; costo 15; ledger 45/45/75=165; todos los demás campos de lotes y fingerprints históricos intactos. Cualquier discrepancia o error de auditoría causa ROLLBACK completo. El reintento se rechaza por baseline distinto.

Verificación posterior READ-ONLY: health 200/PILOTO, costo mostrado15, lotes15, ledger15/unidad, inventario ABRILAR165. Simulación SELECT de venta8: EDU1 3 + EDU2 3 + EDU3 2; costo120, ingreso200, utilidad80. No registrar una venta real como parte de esta reparación.

Si se detecta algo inesperado después del COMMIT, detenerse y conservar backup/evidencia. No reescribir históricos ni volver a ejecutar el script.
