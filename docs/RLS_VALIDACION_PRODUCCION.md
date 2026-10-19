# RLS WEB: evidencia y límites

**Estado global: PARCIAL. Núcleo A/B: VALIDADO EN POSTGRESQL REAL DE STAGING.** No aplicado en producción.

Opt-in WEB_RLS_ENABLED=true. Conexiones separadas DATABASE_URL tenant, WEB_AUTH_DATABASE_URL auth lectura, WEB_SERVICE_DATABASE_URL internal. Login lookup usa auth; tras contraseña verificada, transacción tenant con GUC SET LOCAL app.empresa_id. Contexto AsyncLocalStorage, guard de usuario/vigencia; reset al commit/rollback. Service context sólo después de JWT service autenticado. Roles normales NOSUPERUSER/NOBYPASSRLS/NOINHERIT; schema CREATE revocado y catálogos globales sólo lectura.

Instalador server/scripts/staging-rls.js exige flag F9 y base web_f9_*. **Sólo laboratorio**. Instala ENABLE/FORCE, ownership directo o FK derivada, WITH CHECK de referencias y vistas security_invoker. Tablas sin owner/global explícito quedan denegadas a tenant. No poner este autogenerador sobre producción sin revisión SQL tabla a tabla.

| Prueba SQL directa, sin filtro Node | Resultado |
|---|---|
| SELECT sin WHERE productos/lotes/usuarios A vs B y B vs A | Aislado |
| UPDATE/DELETE recurso ajeno | 0 filas |
| INSERT inventario con sucursal ajena | Rechazado por RLS/trigger integridad |
| INSERT transferencia origen/destino de otra empresa | Rechazado |
| Sin GUC y reutilización conexiones | Sin filas ajenas; no contaminación |
| SET row_security=off | Rechazado, no lectura bypass |
| SET ROLE internal / DISABLE RLS | Rechazado |
| GUC service_role=true por tenant | No eleva rol |
| HTTP sucursal ajena | Rechazado |
| Restore clone y login/consulta tenant | Aislamiento conservado |

Inventario completo de tablas protegidas: artifact RLS_INSTALADO.json en PANEL. Cobertura validada: productos, lotes/inventario, usuarios, sucursales, transferencias, venta y detalles del piloto. Cobertura de compras, devoluciones, reportes/exportaciones, auditoría y todos los cruces FK requiere casos completos antes de producción; política instalada no prueba cobertura funcional total.

**Límite del modelo:** app.empresa_id es establecido por backend confiable. Un poseedor de credencial tenant o capacidad de SQL arbitrario puede establecer otra empresa; esta arquitectura no prueba protección ante backend comprometido/robo de credencial. Auth ve lookup global necesario para login (incluye hash), internal administra todas las empresas mediante JWT, backup lee todo: son cuentas privilegiadas de alcance y deben estar restringidas/custodiadas. No son BYPASSRLS pero tienen políticas explícitas globales. No distribuir sus credenciales a tenants.

Sin declarar VALIDADO total hasta revisar y probar todos los módulos, autorización de usuarios, ownership/FKs/catálogos, restore grants mínimos, pools/contextos/SQL raw, revocación de sesiones y flujo de adopción real en fase posterior. No usar superusuario como alternativa.
