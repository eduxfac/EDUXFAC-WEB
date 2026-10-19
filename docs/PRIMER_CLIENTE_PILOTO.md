# Primer cliente piloto — plantilla controlada

NO-GO para alta real hoy. No se creó cliente real. FASE10 prueba una empresa ficticia en bases DEMO aisladas; se necesita pareja PANEL/WEB PILOTO vacía. Nunca importar datos/dumps/SQLite DEMO al piloto. EDUXFAC_DATA_MODE debe coincidir con comentario JSON de DB; cambiar env no relabela DEMO. DBA/migrador preparará marcador PILOTO en bases limpias solo con autorización posterior. pg_dump de esquema no conserva comentario DB: restore debe restablecer marcador correcto y verificarlo antes del arranque.

| Grupo | Campos/controles |
|---|---|
| Contratante Panel | nombres/razón social, DNI/RUC validado, teléfono, email opcional. Contacto y observación se guardan en ficha controlada: DTO/UI actuales no tienen dos campos independientes para ello. No confundir con cliente comercial de botica. |
| Empresa WEB | razón social, comercial, RUC, código único, plan, precio PEN, inicio/vencimiento civil Lima, PENDIENTE hasta alta completa/activación sincronizada. |
| Plan | BASICO59 / PROFESIONAL99 / EMPRESA129 según catálogo actual; confirmar límites/excepciones, no cobros automáticos. |
| Principal | nombre, dirección, estado; onboarding crea principal, dirección se completa por administración sucursal soportada antes de operar. |
| Administrador | nombres, usuario/email, contraseña temporal futura entregada privadamente, cambio obligatorio primer acceso; no guardar secreto en ficha/log. |

Flujo: backup/restore previo → cliente → borrador empresa/plan/suscripción → principal/admin → completar y activar comando UUID → verificar sincronización/health → login/cambio → smoke → backup/restore final. Timeout: consultar command_id, no crear cliente/pago duplicado ni forzar estado divergente.

Diseño: Linux, dos DB PostgreSQL independientes y vacías. PANEL app/migrator/backup; WEB app/auth/internal/migrator/backup, runtime sin SUPER/BYPASS/propiedad. Apps loopback, HTTPS proxy, endpoints internos red privada/scopes, TLS DB verify-full, firewall, secretos distintos sesión/servicio y credenciales distintas. Workers apagados al inicio; habilitación posterior bajo monitoreo. Alertas health/cola/reconciliación/vencimientos/disco/latencia, logs sin cuerpos secretos, backup cifrado y retención acordada. No usar CA/password pública de tests.

Rollback: detener writers/workers del PILOTO, preservar dos backups+cola, restaurar clones/verificar relaciones/RLS/ACL/modo antes de cambio controlado. Volver a release conocida con RLS GLOBAL, nunca al perfil parcialF9. Revocar sesiones por auth_version y consultar UUID antes de replay; registro de responsable/tiempos. Contacto/observación y dirección deben resolverse por ficha/actualización soportada, no declarar campos inexistentes como terminados.

Pendientes: autorización infraestructura/alta, DB PILOTO limpias/roles/migraciones y marcador, secretos/certificados reales, red privada, monitoreo/backup/restore allí, ficha cliente/plan/ventana aprobada. No publicar admin.eduxfac.com ni conectar VPS en FASE10.

