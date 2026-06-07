import jwt from 'jsonwebtoken';
import { query } from '../../config/database.js';

// ── Verify customer JWT ────────────────────────────────────
export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.access_token || 
                  req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'customer') {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const { rows } = await query(
      'SELECT id, email, full_name, is_active FROM customers WHERE id = $1',
      [decoded.id]
    );

    if (!rows[0] || !rows[0].is_active) {
      return res.status(401).json({ success: false, error: 'Account not found or disabled.' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, error: 'Invalid authentication token.' });
  }
};

// ── Verify admin JWT ───────────────────────────────────────
export const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.cookies?.admin_access_token ||
                  req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, error: 'Admin authentication required.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const { rows } = await query(
      'SELECT id, email, full_name, role, is_active FROM admins WHERE id = $1',
      [decoded.id]
    );

    if (!rows[0] || !rows[0].is_active) {
      return res.status(401).json({ success: false, error: 'Admin account not found or disabled.' });
    }

    req.admin = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Session expired.' });
    }
    return res.status(401).json({ success: false, error: 'Invalid admin token.' });
  }
};

// ── RBAC: require specific role ────────────────────────────
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ success: false, error: 'Not authenticated.' });
  }
  if (!roles.includes(req.admin.role)) {
    return res.status(403).json({ 
      success: false, 
      error: `Access denied. Required role: ${roles.join(' or ')}.` 
    });
  }
  next();
};

// ── Optional auth (for cart/wishlist) ─────────────────────
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.access_token;
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
