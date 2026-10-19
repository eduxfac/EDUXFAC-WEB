import 'dotenv/config';
import { initializeDatabase } from '../src/app.js';
import { pool } from '../src/db.js';

try {
  await initializeDatabase({ migrate: true });
  console.log('EDUXFAC: esquema PostgreSQL listo.');
} finally {
  await pool.end();
}
