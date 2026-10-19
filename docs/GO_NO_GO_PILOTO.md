# GO / NO-GO piloto

**NO-GO para registrar hoy primer cliente real. GO técnico de RLS en laboratorio**, sujeto al cierre de regresiones INFORME_FINAL_FASE10.md. No deploy/alta real.

| Criterio | Evidencia local | Puerta real |
|---|---|---|
| Global RLS/A-B/ramas/FK | matriz49,44FORCE,5ACL + SQL/HTTP | aplicar/revalidar en PILOTO autorizado |
| Roles/bypass/contexto | 3 pools separados, JWT/ramas DB, noSUPER/BYPASS/owner/SETROLE | roles privados reales mínimos |
| Backup/restore/rollback | dos dumps/clones, rollback release global | restore validado allí |
| Logs/smoke | flujo ficticio y secretos ausentes | monitoreo/TLS futuro |
| DEMO/PILOTO | marcador DB rechaza relabel env | DB PILOTO vacías |
| Regresión | ver615 cierre final | cero fallos críticos |

Falta exactamente:1 autorizar infraestructura/deploy/alta futura;2 provisionar pareja DB PILOTO vacía, roles mínimos, migraciones globales revisadas y marcadorPILOTO (instalador actual lab-only y SQL generadoDEMO);3 generar/custodiar secretos reales distintos;4 validarHTTPS/DNS/CA/firewall/redinterna;5 backup/restore/rollback/alertas allí;6 ficha cliente/plan/ventana/responsable aprobados;7 checklist20/smoke controlado antes operación. No se resuelven tocando VPS en esta fase.

NO-GO inmediato: tenantPENDIENTE, fuga A/B/rama, app con migrador/service, restore sin RLS/ACL/modo, sin backup, secreto expuesto o regresión crítica. Globales shared readonly no son fuga; backend confiable/credenciales privadas son requisito.

