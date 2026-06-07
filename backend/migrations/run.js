import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const run = async () => {
  console.log('🚀 Running migrations...');
  try {
    const sql = readFileSync(path.join(__dirname, '001_initial_schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Migration 001_initial_schema.sql completed');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

run();
