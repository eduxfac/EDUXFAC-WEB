# WEB: validación Linux FASE9

Fuente exclusiva EDUXFAC_WEB_ACTUAL D:. Ubuntu24.04.5, Node 24.21.0, PostgreSQL16.15, Nginx1.24.0, PM2 6.0.14 en Docker sin red/puertos públicos. No VPS, producción, .env real, secretos reales ni ZIP.

WEB independiente de Panel: DB web_f9_stage9, roles tenant/auth/internal/migrador/backup separados, puerto55422 y Node 3001 loopback, Nginx test8443. NODE_ENV=production se usa para probar controles sobre datos ficticios, nunca implica conexión productiva. TLS PostgreSQL verify-full y CA explícita.

A/B creadas por integración real local; cambio password inicial/login, productos/inventario/ventas, pagos/renovación, suspensión/reactivación y vencimiento, varias sucursales/usuarios/cambio plan/límites/conciliación. WEB activa sigue funcionando sin Panel; suspendida/vencida bloquea en WEB. Pools reconectan tras parar su PG. RLS SQL real y no sólo Node; estado global PARCIAL detallado en RLS_VALIDACION_PRODUCCION.md.

CSP: hashes calculados sobre HTML con CRLF normalizado; handlers heredados pasaron a atributos data y registro cerrado con delegación, sin eval ni unsafe-inline JavaScript. CSS legacy conserva unsafe-inline styles: no equivale a autorizar JS inline arbitrario. Tests VM verifican callbacks y rechazan funciones desconocidas. Rate login por empresa+usuario+peer evita bloquear otra cuenta tras proxy; proxy añade límite agregado. WINDOWPS diferente no usado como fuente.

Database URLs/CA/config ficticias en .env.example.staging. WORKERS false por defecto; true sólo ecosistema efímero. JWT usa SESSION_SECRET; JWT_SECRET no se consume; CORS_ORIGIN configura origen. Servicio usa PANEL_WEB_SERVICE_SECRET/ISSUER/AUDIENCE. WEB_RLS_ENABLED opt-in: no altera automáticamente una base existente.

Resultados detallados compartidos en PANEL/staging/phase9/artifacts: FASE9_RESULTADOS.json, FASE9_CARGA.json, FASE9_COMPLEMENTARIAS.json, BACKUP_RESTORE_LINUX.json, REBOOT_LINUX.json. Backup WEB separado sin compresión, restore a clon con login/bootstrap y RLS. Fake external cifrado local, sin upload.

Antes de producción: cobertura RLS completa, migraciones/adopción autorizadas, secretos/cofre, backup externo, DNS/TLS/firewall, SLO y capacidad/monitoring. 254 tests previos WEB conservados, más pruebas nuevas F9. No deploy realizado.


## Estado de cierre local

FASE9 cerrada: motor recuperado con reinicio autorizado, restore globals sólo lectura y login clone final aprobados, imagen final fresca178 hashes coincidentes, tres contenedores FASE 9 detenidos sin puertos públicos ni reinicio automático. Regresiones 530 por plataforma y 85 escenarios de staging pasan. Producción NO aprobada yRLS global PARCIAL. Ver informe de 34 puntos RESULTADO_FASE9.md e inventario del PANEL.
