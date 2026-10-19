# Informe final FASE 10

**FASE 10 completada en laboratorio aislado. 1398 comprobaciones distintas aprobadas, 0 fallidas. GO técnico RLS; NO-GO para alta del primer cliente real.**

1. Tablas WEB auditadas: **49**; PK/FK, columnas empresa/sucursal, clases A–F, políticas previas y riesgos inventariados en MATRIZ_RLS_GLOBAL.md y catálogo JSON.

2. Tablas con RLS: **44 ENABLE + FORCE**, políticas explícitas por rol; 40 con pertenencia tenant (incluyen 3 ledgers solo servicio) y 4 metadatos privados. 37 tablas tienen permisos cliente acotados; auditoría append-only y columnas administrativas restringidas.

3. Sin RLS: **5 justificadas** — roles, permisos, rol_permisos (diccionarios globales readonly), eduxfac_migraciones y web_schema_migrations (registro migrador/backup, sin escritura cliente). Snapshot previo tenía 45 con RLS: web_schema_migrations pasa a ACL global; contar banderas no equivalía a validar FK, ramas y privilegios.

4. Endpoints auditados: **106 API**, incluidos **18 internos**, más 3 rutas de páginas. Todas las API ejercitadas por HTTP. Inventario por método/recurso/contexto/filtro Node/RLS/riesgo en INVENTARIO_ENDPOINTS_FASE10.md.

5. Riesgos encontrados: aislamiento insuficiente de sucursales/FK/hijos/lotes, permisos excesivos app/service, confianza en parámetros empresa, vistas con contexto propietario y entorno sin distinción persistida DEMO/PILOTO. Backend/GUC/credenciales confiables siguen siendo frontera explícita.

6. Correcciones: políticas globales USING/WITH CHECK/parent/FK/rama; vistas security_invoker; privilegios mínimos y pools separados; tenant derivado JWT y asignaciones DB; empresa ajena 403; export rama ajena 403; validación de roles/marcador antes del arranque; tablas desconocidas bloquean plan. Producción WEB no migra automáticamente.

7. CRUD A/B: SELECT ajeno vacío, INSERT ajeno rechazado, UPDATE/DELETE ajenos cero o denegados; A→B y B→A para cada tabla protegida. Tablas privadas/globales respetan ACL. Contexto SET LOCAL se limpia al finalizar transacción; fallos revierten cabecera y detalles.

8. Productos: producto/precio propios visibles; códigos de barras iguales entre empresas según diseño no cruzan datos; edición/borrado ajenos bloqueados. Catálogo compartido entre sucursales de la misma empresa es intencional.

9. Inventario: stock, lotes, conteo físico, ajustes, stock futuro, catálogo por rama, import y export protegidos. Usuarios limitados no usan ramas propias sin asignación. SQL valida coherencia producto/lote/compra/venta/rama.

10. Compras: cabecera/detalles/proveedor/productos ajenos no admitidos, operación propia funciona y rechazos no dejan cambios parciales; reportes y detalle respetan tenant/rama. Correcciones/anulaciones se probaron conforme a operaciones disponibles, no se inventó un módulo inexistente.

11. Ventas: cliente/vendedor/documento/rama/detalle/pago aislados; venta propia, devolución/anulación y lectura de comprobante/impresión validadas. IDs manuales de otra empresa rechazados. No se implementó facturación electrónica.

12. Transferencias: A→B bloqueada, productos/lotes/rama ajenos bloqueados, ramas origen/destino propias y autorizadas; transferencia válida conserva stock total; fallos transaccionales no alteran stock.

13. Usuarios: SQL CRUD por empresa, HTTP edición/permisos/sucursales y empresa manipulada, cuotas y creación/desactivación previas preservadas. Admin A no administra B.

14. Clientes/proveedores: búsqueda/documento/DNI/RUC, CRUD y uso en compra/venta protegidos. Cliente comercial WEB se distingue del contratante administrativo Panel.

15. Reportes: 11 tipos actuales, detalle compras/anulaciones y vistas netas; fechas/vendedor/rama y agregados propios. Tenant se filtra por Node y además RLS; vistas security_invoker. No hay agregado con acceso a botica ajena.

16. Import/export: empresa del archivo no sustituye JWT; IDs/rama manipulados bloqueados y rollback seguro. Inventario Excel exportado contiene datos propios. PDF/XLSX genéricos formatean filas recibidas del navegador, no leen DB ni certifican autenticidad de esas filas; fuentes oficiales backend protegidas.

17. Roles: WEB APP cliente, AUTH readonly, INTERNAL SERVICE distintos; migrador y backup separados. APP no crea contratos ni altera plan/estado y solo actualiza columnas negocio/cuota_revision necesarias. SERVICE administra 12 tablas autorizadas; no lee ni escribe ERP stock/compras/ventas. Runtime no propietario ni SUPER/BYPASS.

18. Bypass: SET ROLE a migrador, ALTER/DDL, row_security=off, roles SUPER/BYPASS/owner y URL service/migrador como cliente rechazados. No equivale a protección contra servidor comprometido que cambie GUC o robe credenciales DB.

19. Internos Panel→WEB: JWT servicio/issuer/audience/scopes, UUID/idempotencia y auditoría persistidos; JWT cliente rechazado en las 18 rutas. Credenciales cliente nunca se reutilizan como servicio. Red privada/TLS real es puerta de la etapa futura.

20. Matriz global: **44 VALIDADO + 5 NO_APLICA + 0 PENDIENTE**; detalle SELECT/INSERT/UPDATE/DELETE/empresa/rama/política/resultado por tabla.

21. Pruebas: Panel270 y WEB266 por plataforma; 85 escenarios históricos; nuevas 777 comprobaciones nativas/HTTP/smoke/restore/roles y 6 unitarias de configuración. SQL injection, parámetros manipulados, FK, ramas, transacciones, rollback y matriz incluidos.

22. Resultado final: **1398 comprobaciones distintas aprobadas / 0 fallidas**. No se suman dos veces Windows/Linux ni repeticiones; intentos incompletos/fallidos no cuentan como aprobación.

23. **Las 615 anteriores siguen pasando**: 524 iniciales (Panel270+WEB254), 6 unitarias F9 y 85 escenarios F9; se agregan 783 nuevas. Assertions históricas conservadas. Dos generadores ficticios F9 se corrigieron de UTC a fecha civil Lima, con respaldo, sin debilitar validación.

24. Checklist de primer cliente: 20 pasos en Panel docs/CHECKLIST_ALTA_PILOTO.md. Plantilla de contratante/empresa/plan/suscripción/principal/admin preparada; contacto y observación en ficha controlada porque no son campos independientes del DTO actual; dirección de principal se completa por administración de sucursal soportada.

25. Smoke: **13/13**, ficticio y aislado; login Panel, cliente/empresa/suscripción/estado/integración, login WEB/cambio obligatorio/producto/compra/venta/inventario/reporte, pago/renovación/suspensión/reactivación. No se creó cliente real.

26. Backup/restore: **8/8**. PANEL 193011 bytes, SHA256 418de2f53981f9503e6336be5d0779f7ff9523379eeb155af9c1191a8bb473b5; WEB 367731 bytes, SHA256 dbf398e730606f4b087810cdc9caa71e6de3c64d5918b4a232d413f9ed54a9d7. Dos clones con relaciones/historial/cola/conteos, login y RLS/ACL/marcador verificadas. Backups reales previos al piloto siguen siendo obligatorios y pendientes de esa infraestructura.

27. Rollback: fallo de código inyectado solo en clon; regreso a release global validada y operación restablecida en **2531 ms** con restore ya preparado. No es RTO productivo. No volver a perfil parcial F9 en un piloto.

28. Pendientes/riesgos: C: llegó a espacio muy bajo y Docker requirió recuperación autorizada; las comprobaciones finales pasaron y los laboratorios quedaron cerrados. Capacidad del host futuro, aislamiento privado, secretos/TLS y restore reales pendientes. Cambiar solo modo env no convierte DEMO en PILOTO; PostgreSQL marcador debe coincidir. Panel valida marcador cuando se declara modo; las plantillas y la puerta piloto exigen declararlo.

29. Decisión: **GO técnico del cierre global en laboratorio. NO-GO para registrar hoy el primer cliente real.** No hay tabla tenant pendiente ni fallo crítico de aislamiento observado; aún no existe entorno piloto real validado/autorizado.

30. Falta exactamente: autorización de futura infraestructura/deploy/alta; dos DB PILOTO vacías y roles mínimos; migración global revisada y marcador PILOTO (SQL actual es DEMO/lab-only); secretos reales distintos y custodia; HTTPS/DNS/CA/firewall/red interna; backups/restores/rollback/monitoreo allí; ficha/plan/ventana/responsable aprobados; checklist20 y smoke controlado antes de habilitar operación.

## Evidencia y cuentas

| Grupo nuevo | Aprobadas | Fallidas |
|---|---:|---:|
| MATRIZ_RLS_RESULTADOS_F10 | 368 | 0 |
| HTTP_GLOBAL_F10 | 300 | 0 |
| INTEGRIDAD_Y_BYPASS_F10 | 83 | 0 |
| SMOKE_PILOTO_F10 | 13 | 0 |
| BACKUP_RESTORE_GLOBAL_F10 | 8 | 0 |
| STARTUP_ROLES_F10 | 5 | 0 |
| Unitarias configuración F10 | 6 | 0 |

| Histórico staging | Aprobadas | Fallidas |
|---|---:|---:|
| FASE9_RESULTADOS | 45 | 0 |
| FASE9_CARGA | 9 | 0 |
| BACKUP_RESTORE_LINUX | 8 | 0 |
| FASE9_COMPLEMENTARIAS | 8 | 0 |
| SMOKE_LINUX | 10 | 0 |
| IMAGEN_FINAL_VERIFICADA_F10 | 3 | 0 |
| REBOOT_LINUX | 1 | 0 |
| CIERRE_CONTENEDORES | 1 | 0 |

| Regresión completa | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| REGRESION_PANEL_WINDOWS | 270 | 0 | 0 |
| REGRESION_WEB_WINDOWS | 266 | 0 | 0 |
| REGRESION_PANEL_LINUX | 270 | 0 | 0 |
| REGRESION_WEB_LINUX | 266 | 0 | 0 |

615 anteriores + 783 nuevas = 1398 distintas. Las dos plataformas repiten los mismos casos. Imagen final code-only eduxfac-fase10-code:20261012 / sha256:815e23d6cb14a0314b729202ab49872ac28271f4934dbdbf2b7576c58b64e982; 191 hashes verifican fuentes/harness/respaldos de código. PostgreSQL16.15/Ubuntu24.04/Node24.21 Linux; Node24.20 Windows.

Datos protegidos:10 archivos de Panel conservan SHA/tamaño/fecha (SQLite, clave y esquemas). Respaldos selectivos verificados: Panel5 y WEB2, previos a modificaciones. Los 8 contenedores F9/F10 están detenidos, network none, sin puertos publicados y restart no; workers cerrados. Los dos últimos ensayos de imagen usan tmpfs y pierden sus DB ficticias al detenerse; evidencia queda en D:.

JSON/logs: Panel staging/phase10/artifacts; CIERRE_FASE10.json es el índice final. Los primeros intentos de imagen y regresión interrumpidos por Docker no son aprobaciones; la imagen fresca válida está en repro-final-safe y los logs finales completos llevan 0 fallos. No se reutilizaron marcadores de artefactos anteriores en ese arranque fresco.

Confirmaciones: no se usó C: como fuente EDUXFAC ni ninguna fuente histórica; sí herramientas normales instaladas Node/PowerShell/PostgreSQL/Docker y sus cachés. No VPS, deploy, producción, cliente real, PROPIO, TECNICO, secretos reales, migraciones sobre DB real ni ZIP. No se limpiaron/movieron archivos de C: ni se reubicó Docker. No se habilitaron cobros, facturación electrónica o notificaciones externas.
