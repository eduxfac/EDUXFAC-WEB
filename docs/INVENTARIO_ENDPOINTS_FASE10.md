# Inventario endpoints FASE 10

Express: 109 rutas; 106 API y 3 páginas. HTTP sobre todas las API: autenticación y manipulación A/B; 18 internas rechazan JWT cliente. CRUD nativo cubre hijos sin endpoints directos.

| Método | Ruta | Recurso | Empresa/sucursal | Filtro Node | RLS/rol | Riesgo |
|---|---|---|---|---|---|---|
 | GET | /api/internal/admin/v1/health | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | GET | /api/internal/admin/v1/empresas/:id/estado | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | POST | /api/internal/admin/v1/empresas/:id/suspender | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | POST | /api/internal/admin/v1/empresas/:id/reactivar | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | POST | /api/internal/admin/v1/empresas/:id/cancelar | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | POST | /api/internal/admin/v1/empresas/:id/vencer | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | GET | /api/internal/admin/v1/empresas/:id/operacion | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | GET | /api/internal/admin/v1/empresas/:id/suscripcion | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | PUT | /api/internal/admin/v1/empresas/:id/suscripcion | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | POST | /api/internal/admin/v1/empresas/:id/renovar | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | GET | /api/internal/admin/v1/empresas/:id/uso | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | PUT | /api/internal/admin/v1/empresas/:id/plan | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | PUT | /api/internal/admin/v1/empresas/:id/limites | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | POST | /api/internal/admin/v1/clientes | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | POST | /api/internal/admin/v1/empresas | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | POST | /api/internal/admin/v1/empresas/:id/sucursal-principal | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | POST | /api/internal/admin/v1/empresas/:id/administrador-inicial | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | POST | /api/internal/admin/v1/empresas/:id/activar | integración | empresa explícita por scope | JWT servicio/scopes/IDs/auditoría | service administrativo explícito | restringir red real | 
 | GET | / | otros | no DB | no aplica | no DB | estático | 
 | GET | /index.html | otros | no DB | no aplica | no DB | estático | 
 | POST | /api/auth/password/change | login/auth | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/health | health | login/estado global | empresa+usuario; solo estado | auth readonly | rate-limit; no catálogo ajeno | 
 | GET | /api/setup/status | login/auth | login/estado global | empresa+usuario; solo estado | auth readonly | rate-limit; no catálogo ajeno | 
 | POST | /api/setup/complete | login/auth | sin lectura DB | alta pública deshabilitada (403) | no operación DB | rate-limit; no catálogo ajeno | 
 | POST | /api/auth/login | login/auth | login/estado global | empresa+usuario; solo estado | auth readonly | rate-limit; no catálogo ajeno | 
 | GET | /api/bootstrap | bootstrap | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/products | productos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/products/:id/presentations | productos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/cash/open | caja | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/cash/current | caja | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/cash/close | caja | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/purchases | compras | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/purchases/history | compras | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/sales/today | ventas/anulaciones | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/sales | ventas/anulaciones | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/settings | empresa/config | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PUT | /api/settings | empresa/config | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/sales/:id/returns | ventas/anulaciones | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/sales/:id/return | ventas/anulaciones | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/sales/:id/receipt | ventas/anulaciones | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/dashboard | dashboard | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/catalogs | catálogo | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/products/next-code | productos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/products | productos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/catalogs/:kind | catálogo | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/admin/products | productos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PUT | /api/admin/products/:id | productos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PATCH | /api/admin/products/:id/status | productos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/products/:id/usage | productos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | DELETE | /api/admin/products/:id | productos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/clients/by-doc/:doc | clientes comerciales (DNI/RUC) | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/clients/by-dni/:dni | clientes comerciales (DNI/RUC) | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/clients | clientes comerciales (DNI/RUC) | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/admin/clients | clientes comerciales (DNI/RUC) | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PUT | /api/admin/clients/:id | clientes comerciales (DNI/RUC) | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/suppliers | proveedores | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/admin/suppliers | proveedores | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PUT | /api/admin/suppliers/:id | proveedores | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | DELETE | /api/admin/suppliers/:id | proveedores | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/inventory/summary | inventario/import | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/inventory/export.xlsx | inventario/import | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/inventory/lots | inventario/import | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/inventory/alerts | inventario/import | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/inventory/repair-preview | inventario/import | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/inventory/repair-metadata | inventario/import | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/purchasing/replenishment | compras: reposición/stock futuro/costos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/purchasing/no-movement | compras: reposición/stock futuro/costos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/purchasing/supplier-history | compras: reposición/stock futuro/costos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/purchasing/cost-history/:productId | compras: reposición/stock futuro/costos | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/purchase-orders | órdenes de compra | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/purchase-orders | órdenes de compra | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PATCH | /api/purchase-orders/:id/status | órdenes de compra | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/branches | sucursales | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/admin/branches | sucursales | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/branches/:id/usage | sucursales | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PUT | /api/admin/branches/:id | sucursales | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PATCH | /api/admin/branches/:id/status | sucursales | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | DELETE | /api/admin/branches/:id | sucursales | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/users/:id/permissions | usuarios | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PUT | /api/admin/users/:id/permissions | usuarios | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/users | usuarios | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/admin/roles | roles globales | JWT + ramas DB | guard tenant/RBAC/IDs | ACL global solo lectura; no datos tenant | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/admin/users | usuarios | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PUT | /api/admin/users/:id | usuarios | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PATCH | /api/admin/users/:id/status | usuarios | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | PUT | /api/admin/users/:id/assignments | usuarios | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/inventory/adjustments | inventario/import | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/inventory/set-stock | inventario/import | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/internal-requests | otros | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/internal-requests | otros | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/transfers | transferencias | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/transfers | transferencias | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/import/inventory/template | inventario/import | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/import/inventory/preview | inventario/import | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/import/inventory/commit | inventario/import | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/import/stock-only/template | importación inventario Excel | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/import/stock-only/preview | importación inventario Excel | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/import/stock-only/commit | importación inventario Excel | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | POST | /api/export/pdf | export formato | JWT + ramas DB | guard tenant/RBAC/IDs | sin lectura DB | formatea navegador; no certifica autenticidad | 
 | POST | /api/export/xlsx | export formato | JWT + ramas DB | guard tenant/RBAC/IDs | sin lectura DB | formatea navegador; no certifica autenticidad | 
 | GET | /api/sales/recent | ventas/anulaciones | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/reports/sales-options | reportes | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/reports/sales-detail | reportes | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/reports/:documentType/:id/detail | reportes | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/reports/center/:type | reportes | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/reports/summary | reportes | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/reports/kardex | reportes | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /api/reports/audit | reportes | JWT + ramas DB | guard tenant/RBAC/IDs | tenant FORCE + parent | A/B y ramas ajenas bloqueados; catálogo propio compartido | 
 | GET | /{*splat} | otros | no DB | no aplica | no DB | estático | 

