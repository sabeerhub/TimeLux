/**
 * TIME-NG — Admin Seed Script
 * Usage: node scripts/seed-admin.js
 *
 * Creates the initial super admin account.
 * Run ONCE after first deployment.
 */

import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const ADMIN = {
  email: 'admin@time-ng.com',       // ← change this
  full_name: 'TIME-NG Admin',
  password: 'ChangeMe@2024!',       // ← change this immediately after first login
  role: 'super_admin',
};

(async () => {
  try {
    const password_hash = await bcrypt.hash(ADMIN.password, 12);
    const { rows } = await pool.query(`
      INSERT INTO admins (email, full_name, password_hash, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role
      RETURNING id, email, role
    `, [ADMIN.email, ADMIN.full_name, password_hash, ADMIN.role]);

    console.log('✅ Admin created:', rows[0]);
    console.log(`   Email:    ${ADMIN.email}`);
    console.log(`   Password: ${ADMIN.password}`);
    console.log('\n⚠️  Change the password immediately after first login!\n');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await pool.end();
  }
})();
