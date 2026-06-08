import jwt from 'jsonwebtoken';
import { query } from '../../config/database.js';

const getToken = (req) => {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }
  // Fallback to cookie
  return req.cookies?.access_token || null;
};

const getAdminToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }
  return req.cookies?.admin_access_token || null;
};

export const authenticate = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'customer') return res.status(403).json({ success: false, error: 'Access denied.' });

    const { rows } = await query(
      'SELECT id, email, full_name, is_active FROM customers WHERE id = $1',
      [decoded.id]
    );
    if (!rows[0] || !rows[0].is_active) return res.status(401).json({ success: false, error: 'Account not found.' });

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ success: false, error: 'Session expired.' });
    return res.status(401).json({ success: false, error: 'Invalid token.' });
  }
};

export const authenticateAdmin = async (req, res, next) => {
  try {
    const token = getAdminToken(req);
    if (!token) return res.status(401).json({ success: false, error: 'Admin authentication required.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'admin') return res.status(403).json({ success: false, error: 'Access denied.' });

    const { rows } = await query(
      'SELECT id, email, full_name, role, is_active FROM admins WHERE id = $1',
      [decoded.id]
    );
    if (!rows[0] || !rows[0].is_active) return res.status(401).json({ success: false, error: 'Admin not found.' });

    req.admin = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ success: false, error: 'Session expired.' });
    return res.status(401).json({ success: false, error: 'Invalid admin token.' });
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.admin) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  if (!roles.includes(req.admin.role)) return res.status(403).json({ success: false, error: 'Insufficient permissions.' });
  next();
};

export const optionalAuth = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (!token) return next();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      'SELECT id, email, full_name FROM customers WHERE id = $1 AND is_active = true',
      [decoded.id]
    );
    if (rows[0]) req.user = rows[0];
  } catch {}
  next();
};
