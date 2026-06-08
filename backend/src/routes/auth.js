import express from 'express';
import { register, login, logout, getMe, adminLogin, adminLogout } from '../controllers/authController.js';
import { authenticate, authenticateAdmin } from '../middleware/auth/jwt.js';
import { authRateLimiter, adminRateLimiter } from '../middleware/security/rateLimiter.js';
import { validateBody } from '../middleware/validation/validate.js';
import { registerSchema, loginSchema } from '../validators/auth.js';

const router = express.Router();

// Customer auth
router.post('/register',     authRateLimiter,  validateBody(registerSchema), register);
router.post('/login',        authRateLimiter,  validateBody(loginSchema),    login);
router.post('/logout',       logout);
router.get('/me',            authenticate,     getMe);

// Admin auth
router.post('/admin/login',  adminRateLimiter, validateBody(loginSchema),    adminLogin);
router.post('/admin/logout', adminLogout);
router.get('/admin/me',      authenticateAdmin, (req, res) => {
  res.json({ success: true, data: { ...req.admin, type: 'admin' } });
});

// OAuth callback token exchange
router.post('/oauth-callback', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'No token' });
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    res.json({ success: true, data: decoded });
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

export default router;
