# Matriz RLS global — FASE 10

PostgreSQL nativo aislado: 49 tablas, 44 ENABLE + FORCE RLS y 5 globales ACL. VALIDADO significa operaciones propias y negativas A/B; tablas privadas validan denegación cliente. NO_APLICA solo globales sin datos botica. Ninguna tabla tenant PENDIENTE.

| Tabla | Clase | PK | FK | empresa_id | Sucursal/alcance | RLS antes → final | Política/riesgo |
|---|---|---|---|---|---|---|---|
| acciones_admin | D | id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | DENIED; backend y credenciales confiables |
| acciones_admin_intentos | D | id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | DENIED; backend y credenciales confiables |
| ajustes_inventario | C | id | empresa_id→empresas(id);sucursal_id→sucursales(id);producto_id→productos(id);lote_id→lotes(id);usuario_id→usuarios(id) | directo | sucursal_id | sí → FORCE | CRUD; backend y credenciales confiables |
| auditoria | D | id | empresa_id→empresas(id);usuario_id→usuarios(id) | directo | parent/empresa | sí → FORCE | SELECT_INSERT; backend y credenciales confiables |
| cajas | C | id | sucursal_id→sucursales(id) | parent/privado | sucursal_id | sí → FORCE | CRUD; backend y credenciales confiables |
| categorias | B | id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| clientes | B | id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| clientes_admin | B | id | — | parent/privado | parent/empresa | sí → FORCE | DENIED; backend y credenciales confiables |
| compra_detalles | F | id | compra_id→compras(id);producto_id→productos(id) | parent/privado | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| compras | C | id | empresa_id→empresas(id);sucursal_id→sucursales(id);proveedor_id→proveedores(id);usuario_id→usuarios(id) | directo | sucursal_id | sí → FORCE | CRUD; backend y credenciales confiables |
| devolucion_venta_detalles | F | id | devolucion_id→devoluciones_venta(id);venta_detalle_id→venta_detalles(id) | parent/privado | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| devoluciones_venta | C | id | venta_id→ventas(id);empresa_id→empresas(id);sucursal_id→sucursales(id);usuario_id→usuarios(id);sesion_reembolso_id→sesiones_caja(id) | directo | sucursal_id | sí → FORCE | CRUD; backend y credenciales confiables |
| eduxfac_migraciones | A | nombre | — | no | parent/empresa | no → ACL | DENIED; solo lectura app |
| empresa_acceso | B | empresa_id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | SELECT_UPDATE_QUOTA; backend y credenciales confiables |
| empresa_config | E | empresa_id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| empresa_config_avanzada | E | empresa_id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| empresas | B | id | cliente_admin_id→clientes_admin(id) | parent/privado | parent/empresa | sí → FORCE | SELECT_UPDATE_COLUMNS; backend y credenciales confiables |
| eventos_comerciales | D | id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | SELECT_INSERT; backend y credenciales confiables |
| laboratorios | B | id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| legacy_import_runs | B | id | — | parent/privado | parent/empresa | sí → FORCE | DENIED; backend y credenciales confiables |
| legacy_mappings | B | id | — | parent/privado | parent/empresa | sí → FORCE | DENIED; backend y credenciales confiables |
| lotes | C | id | producto_id→productos(id);sucursal_id→sucursales(id);compra_detalle_id→compra_detalles(id) | parent/privado | sucursal_id | sí → FORCE | CRUD; backend y credenciales confiables |
| movimientos_caja | B | id | sesion_caja_id→sesiones_caja(id);usuario_id→usuarios(id) | parent/privado | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| movimientos_inventario | C | id | empresa_id→empresas(id);sucursal_id→sucursales(id);producto_id→productos(id);lote_id→lotes(id);usuario_id→usuarios(id) | directo | sucursal_id | sí → FORCE | CRUD; backend y credenciales confiables |
| operacion_workers | B | nombre | — | parent/privado | parent/empresa | sí → FORCE | DENIED; backend y credenciales confiables |
| orden_compra_detalles | F | id | orden_compra_id→ordenes_compra(id);producto_id→productos(id) | parent/privado | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| ordenes_compra | C | id | empresa_id→empresas(id);sucursal_id→sucursales(id);proveedor_id→proveedores(id);usuario_id→usuarios(id) | directo | sucursal_id | sí → FORCE | CRUD; backend y credenciales confiables |
| permisos | A | id | — | no | parent/empresa | no → ACL | SELECT_SHARED; solo lectura app |
| precios_producto | C | id | producto_id→productos(id);sucursal_id→sucursales(id) | parent/privado | sucursal_id | sí → FORCE | CRUD; backend y credenciales confiables |
| producto_sucursal | C | producto_id+sucursal_id | producto_id→productos(id);sucursal_id→sucursales(id) | parent/privado | sucursal_id | sí → FORCE | CRUD; backend y credenciales confiables |
| productos | B | id | empresa_id→empresas(id);categoria_id→categorias(id);laboratorio_id→laboratorios(id) | directo | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| proveedores | B | id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| rol_permisos | A | rol_id+permiso_id | rol_id→roles(id);permiso_id→permisos(id) | no | parent/empresa | no → ACL | SELECT_SHARED; solo lectura app |
| roles | A | id | — | no | parent/empresa | no → ACL | SELECT_SHARED; solo lectura app |
| secuencias_documento | C | empresa_id+sucursal_id+tipo+serie | empresa_id→empresas(id);sucursal_id→sucursales(id) | directo | sucursal_id | sí → FORCE | CRUD; backend y credenciales confiables |
| sesiones_caja | B | id | caja_id→cajas(id);usuario_id→usuarios(id) | parent/privado | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| solicitud_interna_detalles | F | id | solicitud_id→solicitudes_internas(id);producto_id→productos(id) | parent/privado | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| solicitudes_internas | C | id | empresa_id→empresas(id);sucursal_solicitante_id→sucursales(id);sucursal_origen_id→sucursales(id);usuario_solicita_id→usuarios(id);usuario_resuelve_id→usuarios(id) | directo | sucursal_solicitante_id,sucursal_origen_id | sí → FORCE | CRUD; backend y credenciales confiables |
| sucursales | B | id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| suscripcion_eventos | D | id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | DENIED; backend y credenciales confiables |
| transferencia_detalles | F | id | transferencia_id→transferencias(id);producto_id→productos(id);lote_origen_id→lotes(id);lote_destino_id→lotes(id) | parent/privado | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| transferencias | C | id | empresa_id→empresas(id);sucursal_origen_id→sucursales(id);sucursal_destino_id→sucursales(id);solicitud_id→solicitudes_internas(id);usuario_id→usuarios(id) | directo | sucursal_origen_id,sucursal_destino_id | sí → FORCE | CRUD; backend y credenciales confiables |
| usuario_permisos | F | usuario_id+modulo | usuario_id→usuarios(id) | parent/privado | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| usuario_sucursal | F | usuario_id+sucursal_id | usuario_id→usuarios(id);sucursal_id→sucursales(id);rol_id→roles(id) | parent/privado | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| usuarios | B | id | empresa_id→empresas(id) | directo | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| venta_detalles | F | id | venta_id→ventas(id);producto_id→productos(id);lote_id→lotes(id) | parent/privado | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| venta_pagos | B | id | venta_id→ventas(id) | parent/privado | parent/empresa | sí → FORCE | CRUD; backend y credenciales confiables |
| ventas | C | id | empresa_id→empresas(id);sucursal_id→sucursales(id);sesion_caja_id→sesiones_caja(id);cliente_id→clientes(id);usuario_id→usuarios(id) | directo | sucursal_id | sí → FORCE | CRUD; backend y credenciales confiables |
| web_schema_migrations | A | version | — | no | parent/empresa | sí → ACL | DENIED; solo lectura app |

A global/sistema; B empresa; C sucursal; D auditoría/administración; E configuración; F relaciones. USING/WITH CHECK y todas las FK: PLAN_RLS_GLOBAL_F10.json/.sql. Políticas previas exactas: CATALOGO_WEB_PRE_F10.json.

| Tabla | SELECT | INSERT | UPDATE | DELETE | Empresa | Sucursal | RLS | A/B | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| acciones_admin | DENEGADO | DENEGADO | DENEGADO | DENEGADO | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| acciones_admin_intentos | DENEGADO | DENEGADO | DENEGADO | DENEGADO | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| ajustes_inventario | propia | propia | propia | propia | JWT/parent/privado | sucursal_id | FORCE | ambas direcciones | VALIDADO |
| auditoria | propia | propia | DENEGADO | DENEGADO | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| cajas | propia | propia | propia | propia | JWT/parent/privado | sucursal_id | FORCE | ambas direcciones | VALIDADO |
| categorias | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| clientes | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| clientes_admin | DENEGADO | DENEGADO | DENEGADO | DENEGADO | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| compra_detalles | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| compras | propia | propia | propia | propia | JWT/parent/privado | sucursal_id | FORCE | ambas direcciones | VALIDADO |
| devolucion_venta_detalles | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| devoluciones_venta | propia | propia | propia | propia | JWT/parent/privado | sucursal_id | FORCE | ambas direcciones | VALIDADO |
| eduxfac_migraciones | DENEGADO | DENEGADO | DENEGADO | DENEGADO | no tenant | parent/empresa | ACL | ACL global | NO_APLICA |
| empresa_acceso | propia | DENEGADO | solo cuota_revision | DENEGADO | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| empresa_config | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| empresa_config_avanzada | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| empresas | propia | DENEGADO | columnas propias | DENEGADO | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| eventos_comerciales | propia | propia | DENEGADO | DENEGADO | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| laboratorios | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| legacy_import_runs | DENEGADO | DENEGADO | DENEGADO | DENEGADO | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| legacy_mappings | DENEGADO | DENEGADO | DENEGADO | DENEGADO | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| lotes | propia | propia | propia | propia | JWT/parent/privado | sucursal_id | FORCE | ambas direcciones | VALIDADO |
| movimientos_caja | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| movimientos_inventario | propia | propia | propia | propia | JWT/parent/privado | sucursal_id | FORCE | ambas direcciones | VALIDADO |
| operacion_workers | DENEGADO | DENEGADO | DENEGADO | DENEGADO | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| orden_compra_detalles | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| ordenes_compra | propia | propia | propia | propia | JWT/parent/privado | sucursal_id | FORCE | ambas direcciones | VALIDADO |
| permisos | lectura global | DENEGADO app | DENEGADO app | DENEGADO app | no tenant | parent/empresa | ACL | ACL global | NO_APLICA |
| precios_producto | propia | propia | propia | propia | JWT/parent/privado | sucursal_id | FORCE | ambas direcciones | VALIDADO |
| producto_sucursal | propia | propia | propia | propia | JWT/parent/privado | sucursal_id | FORCE | ambas direcciones | VALIDADO |
| productos | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| proveedores | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| rol_permisos | lectura global | DENEGADO app | DENEGADO app | DENEGADO app | no tenant | parent/empresa | ACL | ACL global | NO_APLICA |
| roles | lectura global | DENEGADO app | DENEGADO app | DENEGADO app | no tenant | parent/empresa | ACL | ACL global | NO_APLICA |
| secuencias_documento | propia | propia | propia | propia | JWT/parent/privado | sucursal_id | FORCE | ambas direcciones | VALIDADO |
| sesiones_caja | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| solicitud_interna_detalles | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| solicitudes_internas | propia | propia | propia | propia | JWT/parent/privado | sucursal_solicitante_id,sucursal_origen_id | FORCE | ambas direcciones | VALIDADO |
| sucursales | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| suscripcion_eventos | DENEGADO | DENEGADO | DENEGADO | DENEGADO | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| transferencia_detalles | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| transferencias | propia | propia | propia | propia | JWT/parent/privado | sucursal_origen_id,sucursal_destino_id | FORCE | ambas direcciones | VALIDADO |
| usuario_permisos | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| usuario_sucursal | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| usuarios | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| venta_detalles | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| venta_pagos | propia | propia | propia | propia | JWT/parent/privado | parent/empresa | FORCE | ambas direcciones | VALIDADO |
| ventas | propia | propia | propia | propia | JWT/parent/privado | sucursal_id | FORCE | ambas direcciones | VALIDADO |
| web_schema_migrations | DENEGADO | DENEGADO | DENEGADO | DENEGADO | no tenant | parent/empresa | ACL | ACL global | NO_APLICA |

Sucursales (metadatos), productos, clientes y proveedores son catálogo de empresa, compartidos entre sus ramas intencionalmente. Stock/cajas/compras/ventas/ajustes/transferencias e hijos respetan asignaciones de sucursal; transferir exige ambas ramas de la misma empresa. Auditoría append-only. Cuatro metadatos privados y tres ledgers internos sin ACL cliente. APP solo UPDATE cuota_revision en empresa_acceso por trigger; no plan/estado. Riesgo residual: servidor confiable o credenciales DB comprometidos pueden cambiar GUC, fuera de la garantía frente al navegador.

