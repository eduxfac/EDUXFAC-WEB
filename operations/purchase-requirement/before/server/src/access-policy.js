// Every API family is explicitly mapped; unknown operations fail closed.
export function routePermission(method, path, body = {}) {
  const action = method === 'GET' || method === 'HEAD' ? 'ver' : method === 'DELETE' ? 'eliminar' : method === 'POST' ? 'crear' : 'editar';
  if (/^\/api\/sales\/[^/]+\/return$/.test(path)) return ['sales', String(body.tipo).toUpperCase() === 'TOTAL' ? 'eliminar' : 'editar'];
  if (path === '/api/cash/close') return ['cash', 'editar'];
  if (/^\/api\/inventory\/(adjustments|set-stock|repair-metadata)$/.test(path)) return ['inventory', 'editar'];
  if (/^\/api\/import\//.test(path)) return ['inventory', method === 'GET' ? 'ver' : 'editar'];
  if (/^\/api\/export\//.test(path)) return ['reports', 'ver'];
  const families = [
    ['/api/admin/products', 'productsAdmin'], ['/api/admin/clients', 'customers'],
    ['/api/admin/suppliers', 'suppliers'], ['/api/admin/users', 'usersAdmin'],
    ['/api/admin/roles', 'usersAdmin'], ['/api/admin/branches', 'settings'],
    ['/api/inventory/alerts', 'alerts'], ['/api/inventory', 'inventory'],
    ['/api/purchasing', 'replenishment'], ['/api/purchase-orders', 'replenishment'],
    ['/api/purchases', 'purchases'], ['/api/internal-requests', 'transfers'],
    ['/api/transfers', 'transfers'], ['/api/reports', 'reports'],
    ['/api/dashboard', 'dashboard'], ['/api/settings', 'settings'],
    ['/api/cash', 'cash'], ['/api/sales', 'sales'], ['/api/products', 'sales'],
    ['/api/catalogs', 'productsAdmin'],
  ];
  for (const [prefix, module] of families) if (path === prefix || path.startsWith(prefix + '/')) return [module, action];
  return null;
}
