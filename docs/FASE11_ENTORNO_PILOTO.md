# WEB — preparación PILOTO FASE 11

Cierre local: 13/10/2026. **GO PARA CONECTAR AL VPS Y PREPARAR PILOTO**, previa orden posterior; deploy, migraciones reales y primer cliente siguen pendientes.

Fuente oficial EDUXFAC_WEB_ACTUAL en D:. Regresión Linux guardada: 266/266, cero fallos. No se repitió durante el cierre.

WEB → Nginx app.eduxfac.com → servidor loopback:3000 → PostgreSQL WEB independiente de PANEL. Modo EDUXFAC_DATA_MODE=PILOTO debe coincidir con marcador de DB; no importar datos DEMO. NODE_ENV=production, WEB_RLS_ENABLED=true y WEB_RLS_PROFILE=global.

.env.example.pilot contiene placeholders. DATABASE_URL usa rol app, WEB_AUTH_DATABASE_URL rol auth y WEB_SERVICE_DATABASE_URL rol servicio, tres cuentas distintas hacia la misma DB; credenciales migradoras/backup fuera del runtime. PG TLS verify-full y CA privada de confianza. SESSION_SECRET firma JWT de usuarios; diferente de PANEL_WEB_SERVICE_SECRET, que se comparte únicamente entre el servicio PANEL/WEB. JWT_SECRET no se consume en este código.

PM2 futuro usa server/start.mjs, una instancia fork, cwd físico de release y workers false. npm start conserva su entrada de desarrollo histórica; no asumir que el wrapper ESM PM2 equivale a ese arranque directo.

44 tablas FORCE RLS, cinco globals ACL, aislamiento SQL/HTTP A/B y password temporal con cambio obligatorio fueron validados en laboratorio. No se verificaron esos controles en el VPS real.

Migraciones: schema.sql; ensureReturnsSchema/ensureAdvancedSettings/ensureUserPermissions; upgrade_v44_4, ticket_print_width, branch_catalog, count_unlotted y product_identity; seis migraciones WEB de acceso/alta/estados/planes/suscripciones/operación. No ejecutar todos los upgrades históricos indiscriminadamente. El manifiesto y las probes están en server/pilot-preflight.mjs del PANEL; su CLI web es offline. Legacy WEB carece de checksums registrados para algunas etapas y exige revisión manual antes de adoptar una base real. Las guardas del instalador global RLS de laboratorio deben permanecer.

La ACL Nginx interna exige loopback/ruta privada: resolver correctamente el dominio HTTPS del servicio preservando SNI y certificado; no abrir endpoints internos al público ni desactivar TLS. Nginx, DNS, certificados, firewall y PM2 startup reales siguen pendientes.

Ver documentos oficiales PANEL: FASE11_ENTORNO_PILOTO, PILOT_GO_NO_GO, BACKUP_PILOTO, ROLLBACK_PILOTO, ALTA_PRIMER_CLIENTE y RESULTADO_FASE11. La copia externa cifrada se simuló sin red. No hubo cliente real, VPS, producción, secretos reales ni ZIP.
