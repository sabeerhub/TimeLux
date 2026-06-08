import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ADMIN = {
  email: 'admin@timelux.com',
  full_name: 'TimeLux Admin',
  password: 'ChangeMe@2024!',
  role: 'super_admin',
};

(async () => {
  try {
    const bcryptjs = await import('bcryptjs');
    const password_hash = await bcryptjs.default.hash(ADMIN.password, 12);
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
    console.log('\n⚠️  Change password after first login!\n');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await pool.end();
  }
})();
