import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { logAudit } from '../utils/audit.js';
import { AppError } from '../utils/errors.js';

const issueToken = (payload, expiresIn) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

// ─── CUSTOMER REGISTER ────────────────────────────────────
export const register = async (req, res, next) => {
  try {
    const { email, full_name, phone, password } = req.body;

    const exists = await query('SELECT id FROM customers WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows[0]) throw new AppError('Email already registered.', 409);

    const password_hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO customers (email, full_name, phone, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, email, full_name`,
      [email.toLowerCase(), full_name, phone, password_hash]
    );

    const customer = rows[0];
    const token = issueToken({ id: customer.id, type: 'customer' }, '7d');

    await logAudit({
      actorId: customer.id, actorType: 'customer',
      actorEmail: customer.email, action: 'customer.register',
      entity: 'customers', entityId: customer.id, ip: req.ip,
    });

    res.status(201).json({
      success: true,
      token,
      data: { id: customer.id, email: customer.email, full_name: customer.full_name },
    });
  } catch (err) { next(err); }
};

// ─── CUSTOMER LOGIN ───────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { rows } = await query(
      'SELECT id, email, full_name, password_hash, is_active FROM customers WHERE email = $1',
      [email.toLowerCase()]
    );

    const customer = rows[0];
    const validPassword = customer
      ? await bcrypt.compare(password, customer.password_hash)
      : await bcrypt.compare(password, '$2a$12$placeholder.hash.to.prevent.timing');

    if (!customer || !validPassword) throw new AppError('Invalid email or password.', 401);
    if (!customer.is_active) throw new AppError('Account suspended. Contact support.', 403);

    const token = issueToken({ id: customer.id, type: 'customer' }, '7d');

    await query('UPDATE customers SET last_login = NOW() WHERE id = $1', [customer.id]);
    await logAudit({
      actorId: customer.id, actorType: 'customer',
      actorEmail: customer.email, action: 'customer.login',
      entity: 'customers', entityId: customer.id, ip: req.ip,
    });

    res.json({
      success: true,
      token,
      data: { id: customer.id, email: customer.email, full_name: customer.full_name },
    });
  } catch (err) { next(err); }
};

// ─── ADMIN LOGIN ──────────────────────────────────────────
export const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { rows } = await query(
      'SELECT id, email, full_name, password_hash, role, is_active FROM admins WHERE email = $1',
      [email.toLowerCase()]
    );

    const admin = rows[0];
    const validPassword = admin
      ? await bcrypt.compare(password, admin.password_hash)
      : await bcrypt.compare(password, '$2a$12$placeholder.hash.to.prevent.timing');

    if (!admin || !validPassword) throw new AppError('Invalid credentials.', 401);
    if (!admin.is_active) throw new AppError('Admin account disabled.', 403);

    const token = issueToken({ id: admin.id, type: 'admin', role: admin.role }, '4h');

    await query('UPDATE admins SET last_login = NOW(), last_ip = $1 WHERE id = $2', [req.ip, admin.id]);
    await logAudit({
      actorId: admin.id, actorType: 'admin',
      actorEmail: admin.email, action: 'admin.login',
      entity: 'admins', entityId: admin.id, ip: req.ip,
    });

    res.json({
      success: true,
      token,
      data: { id: admin.id, email: admin.email, full_name: admin.full_name, role: admin.role },
    });
  } catch (err) { next(err); }
};

// ─── LOGOUT ───────────────────────────────────────────────
export const logout = (req, res) => {
  res.json({ success: true, message: 'Logged out.' });
};

export const adminLogout = (req, res) => {
  res.json({ success: true, message: 'Logged out.' });
};

// ─── GET ME ───────────────────────────────────────────────
export const getMe = async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, email, full_name, phone, created_at FROM customers WHERE id = $1',
      [req.user.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
};

// ─── UPDATE ME ────────────────────────────────────────────
export const updateMe = async (req, res, next) => {
  try {
    const { full_name, phone } = req.body;
    const { rows: [user] } = await query(
      'UPDATE customers SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone), updated_at = NOW() WHERE id = $3 RETURNING id, email, full_name, phone',
      [full_name || null, phone || null, req.user.id]
    );
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};
