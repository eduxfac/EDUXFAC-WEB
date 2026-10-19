// Express request gate; no business-module changes or migrations.
let locked = false;
let active = 0;
export function backupMaintenance(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (locked) return res.status(503).json({ error: 'Restauración en curso. Espera a que termine.' });
  active++;
  res.once('finish', () => { active--; });
  next();
}
export async function enterBackupMaintenance() {
  if (locked) throw new Error('Ya existe una restauración en curso.');
  locked = true;
  const deadline = Date.now() + 30000;
  while (active) {
    if (Date.now() > deadline) { locked = false; throw new Error('Hay operaciones pendientes. Intenta nuevamente cuando terminen.'); }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return () => { locked = false; };
}
