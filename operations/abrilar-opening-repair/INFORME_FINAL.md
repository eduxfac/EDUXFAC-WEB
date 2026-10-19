# Despliegue del importador y reparación controlada de ABRILAR

**ETAPA1 GO. ETAPA2 GO. GO para validación manual.**

## ETAPA1 — archivo único

Archivo desplegado: server/src/initial-inventory.js. No se cambiaron otros archivos de la release.
SHA256 anterior: 57abcde45bc6b165875e1f8b6ad6c956e87bc4759a4483476f3bfef159b62377
SHA256 después D=VPS: 6509028c9ab0d4a39a2671d87637fb99b8c6584ed407f6099b3e1c39971f8ccd
Backup: /home/eduxadmin/.local/share/eduxfac/initial_opening_deploy_20261014_223159/backup/server/src/initial-inventory.js

Único reinicio: EDUXFAC-WEB-PILOTO id4, PID362852, restart19. Readiness loopback tres muestras estables (cinco intentos), HTTPS tres muestras estables (tres intentos); reinicio+readiness9.585s. App/admin/dominio raíz HTTPS200. Durante ETAPA1 BD completa sin cambios,44FORCE RLS intactos, procesos PANEL y WEB anterior intactos. No se cambió Nginx/certificados/PostgreSQL global.

Regresión post-deploy: Windows206/206 y Linux/PostgreSQL147/147, cero fallidas/omitidas. Incluye nueva importación ficticia con apertura0 y movimiento completo,1/2/3lotes, conteo, venta parcial/multilot, devoluciones, margen, concurrencia, RLS, compras, caja, requerimiento y catálogo. Linux usó exactamente el importador desplegado y conservó inventory-count.js remoto1e99...; no se desplegó el candidato de conteo físico pendiente.

ETAPA1 terminó y se informó GO ANTES de iniciar backup/dry-run/reparación de ABRILAR.

## ETAPA2 — backup y precondiciones

Backup privado verificable: /home/eduxadmin/.local/share/eduxfac/abrilar_opening_repair_20261014_223757/ABRILAR_BEFORE.json
SHA256 backup: d657cc090122b0dfa629f2a3ca8c83b60188eb89eb9944c44a53e203b3eb22c2
SHA256 snapshot contenido: 173c3e635f8af6e92656b52eb500137e6c04e15ad8459ad204879423b4a411bf

Script/plan validados copiados solo a directorio privado de operación, SHA256 local/remoto idénticos. Alcance fijo empresa/sucursal/producto/tres IDs. Backup READ ONLY y dry-run confirmaron fingerprints exactos, stock3/3/5, costos15 y aperturas45/60/75. No se regeneró ni relajó el plan.

## Cambios reales aplicados

| Lote | Apertura antes | Apertura después | Stock antes/después | Costo antes/después | Valor final |
|---|---:|---:|---:|---:|---:|
| EDU1 |45|0|3|15|45|
| EDU2 |60|0|3|15|45|
| EDU3 |75|0|5|15|75|
| Total |180|0|11|15 por unidad|165|

UNA transacción SERIALIZABLE con bloqueos del producto/sucursal y los tres lotes. Se actualizaron únicamente tres valor_base_costos y se agregó UN registro de auditoría id43, acción REPARAR_APERTURA_INICIAL, con cambios antes/después, hash de plan, operador SO, rol PostgreSQL y hash de backup. Auditorías previas intactas.

Antes del COMMIT se comprobaron stock, costo, vencimientos y todos los demás campos físicos de lote; movimientos, conteo físico−1 de EDU2, compras, ventas, devoluciones y todos los demás datos de todas las tablas; también RLS/políticas, roles y esquema. Solo se excluyeron del checksum global los tres lotes autorizados y la nueva auditoría con hash de plan, comprobados por separado.

Simulación SELECT real dentro de la transacción: EDU1 3×15=45; EDU2 3×15=45; EDU3 2×15=30. Costo120, ingreso200, utilidad80. No se ejecutó POST/api/sales contra PILOTO. Health/app/admin se verificaron también antes del COMMIT.

## Validación posterior

VERIFIED.json confirmó stock11, valor165, apertura0, costo15, datos protegidos intactos,44FORCE RLS, health loopback/HTTPS200/PILOTO y app/adminHTTPS200. FINAL_SCOPE.log confirmó solo el importador como diferencia de release y procesos PANEL/WEB anterior intactos.

Venta posterior con base ficticia en memoria y mismo candidato: POST/api/sales consumió3/3/2, snapshots15, costo120, venta200, utilidad80. Devolución ficticia restauró3/3/5=11/S165. Ninguna venta o devolución real registrada.

353 pruebas de regresión +1 escenario ficticio posterior aprobados,0fallidas/omitidas. Las comprobaciones adicionales de checksum, backups, health y datos protegidos no se sumaron artificialmente al total.

## Rollback conservado

Fuente: python3 /home/eduxadmin/.local/share/eduxfac/initial_opening_deploy_20261014_223159/DEPLOY_IMPORTER.py --rollback
Datos: /home/eduxadmin/.local/opt/eduxfac-node24/bin/node /home/eduxadmin/.local/share/eduxfac/abrilar_opening_repair_20261014_223757/CONTROLLED_REPAIR.mjs --undo

No se necesitó rollback. Undo exige que el estado reparado siga idéntico y conserva auditoría, agregando una reversión. No ejecutar sin necesidad/autorización concreta.

Evidencias: RESULT.json, APPLIED.json, VERIFIED.json, REPAIR_READY.json, DRY_RUN.json, BEFORE_COMMIT_VALIDATIONS.json, ABRILAR_BEFORE.json, FICTITIOUS_SALE_8.json y FINAL_SCOPE.log; ETAPA1 en operations/initial-opening-deploy/.
