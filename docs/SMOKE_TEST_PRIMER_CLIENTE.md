# Smoke del primer cliente — futuro autorizado

Prerequisitos: puertas de PILOT_GO_NO_GO del PANEL completas, dos backups restaurables, modo PILOTO, roles mínimos, RLS global y acceso HTTPS. No ejecutar contra producción ni datos reales sin orden específica.

| Paso | Aceptación |
|---|---|
| Health y entorno | WEB y PANEL saludables; banner ENTORNO PILOTO |
| Alta y sincronización | Contratante, empresa, plan, suscripción, principal/admin; UUID único y confirmado |
| Login inicial | Solo hash persistido; cambio obligatorio; token temporal invalidado |
| Usuario/sucursal | Límites y permisos correctos; dirección principal completa |
| Proveedor y cliente comercial | Registros separados del contratante PANEL |
| Producto | Identidad/catálogo de la empresa correcta |
| Compra | Documento, movimientos y stock coherentes |
| Venta | Documento, reporte y saldo exacto |
| Inventario y reportes | Datos de esa empresa/sucursal; sin contaminación cruzada |
| Cerrar/volver a entrar | Panel invalida sesión; WEB descarta JWT y relogin correcto |
| A/B | IDs ajenos y consultas sin WHERE no revelan ni mutan B |
| Historial/pago manual | Motivo, precio/vigencia y UUID correctos; sin cobro automático |
| Alertas/cola | Sin comandos perdidos ni duplicados; workers off inicialmente |
| Backup/restore y rollback | Ambas DB en clones, mismo modo, conteos/ledgers/RLS y login |

Registrar evidencia privada, sin credenciales ni datos personales en logs públicos. En el laboratorio estas operaciones pasaron con datos ficticios y clones restaurados; compra/venta dejaron stock 9 en clone sin modificar la fuente. No es aceptación del futuro cliente real.
