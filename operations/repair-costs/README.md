## Reparación de APRONAX — preparada y ensayada, NO ejecutada

Plan exacto: operations/repair-costs/PLAN_APRONAX.json.
Helper: operations/repair-costs/repair-apronax.mjs, exporta repairApronax(client,plan,options).
No abre conexiones ni ejecuta operaciones al importarlo.

Empresa: 8678361e-91ec-4bb2-877f-42ea2893d39e.
Sucursal: 11b36867-46b5-40a1-9d0a-8a773b318d8d.
Producto APRONAX: dfade78c-7cd3-4fc0-8660-ae7e608cdf79.
Saldo sin lote: e422a936-92c7-4a97-9354-06b84c10f5b0.
Lote real DFDF: 771bf66f-44b6-4d61-beed-ce6bef93ba68.
Actor: resolver edwinpiloto activo en esa empresa; no se modifica su usuario.

Procedimiento:

1. Autorizar por separado el despliegue/migración y la reparación. Confirmar físicamente que las 120 unidades corresponden al lote DFDF ya documentado.
2. Crear backup real previo, verificar SHA256 y validar restore aislado; conservar todos los backups anteriores.
3. Reconsultar READ-ONLY empresa/sucursal/producto, compra 120 x 1,57 = 188,40, las tres ventas anuladas, saldos DFDF=0 y sin lote=120/costo0, y kardex sin lote=120/S188,40. Verificar también PARACETAMOL y demás stock; detener si difiere.
4. Autorizar/aplicar migración 007 y candidato mediante procedimiento de despliegue controlado. No ejecutar el helper sobre el esquema antiguo.
5. Ensayar helper en clon aislado usando apply:false. Es una simulación transaccional con ROLLBACK; debe conservar estado inicial al salir. NO es una consulta READ-ONLY.
6. Con cliente PostgreSQL previamente autorizado conectado SOLO a eduxfac_web_piloto, cargar PLAN_APRONAX.json y ejecutar:
   await repairApronax(client,plan,{apply:true,backupVerified:true,physicalLotConfirmed:true});
7. El helper abre SERIALIZABLE, limita espera de bloqueos, verifica ámbito/compra/ventas/kardex y bloquea los dos saldos. Se detiene ante cualquier diferencia o intento repetido.
8. Resta 120 del saldo sin lote y suma 120 a DFDF. Añade únicamente dos movimientos nuevos RECLASIFICACION_COSTO a S/1,57: -S188,40 / +S188,40, neto monetario cero. No usa costo cero para la salida, porque duplicaría el valor del kardex.
9. Concilia costos y registra auditoría. No elimina el saldo histórico sin lote; queda en cero. DFDF conserva número y vencimiento existentes.
10. Antes de COMMIT verifica stock total APRONAX=120 y valor S188,40. Si falla, ROLLBACK. Reintento después del éxito es rechazado.
11. Verificar PARACETAMOL sin cambios: si sigue en 390 x0,08, S31,20; total esperado S219,60. Compras, ventas, devoluciones/caja, usuarios y otros productos intactos.

El ensayo reprodujo el defecto antiguo usando la función de entrada original conservada en D: y snapshots ficticios cero. Dry-run dejó stock120/valor0 intactos; aplicación ficticia dejó stock120/valor188,40 y exactamente dos movimientos nuevos, con compras/snapshots históricos inmutables; segundo intento rechazado.

## Estado y límites

GO técnico del candidato y del procedimiento probado. La ejecución real sigue pendiente de autorización, backup verificado, confirmación física DFDF, migración y despliegue.
No se presentó ningún bloqueante técnico en las pruebas. No se han aplicado ni migración, candidato o reparación en el VPS. No se cambiaron Nginx/certificados/PANEL/usuarios/suscripciones ni la base antigua.
