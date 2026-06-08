// ─── AUTH ROUTES ──────────────────────────────────────────
import express from 'express';
import { register, login, logout, getMe } from '../controllers/authController.js';
import { adminLogin, adminLogout } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth/jwt.js';
import { authRateLimiter, adminRateLimiter } from '../middleware/security/rateLimiter.js';
import { validateBody } from '../middleware/validation/validate.js';
import { registerSchema, loginSchema } from '../validators/auth.js';

const router = express.Router();

router.post('/register', authRateLimiter, validateBody(registerSchema), register);
router.post('/login', authRateLimiter, validateBody(loginSchema), login);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);

router.post('/admin/login', adminRateLimiter, validateBody(loginSchema), adminLogin);
router.post('/admin/logout', adminLogout);

export default router;

// OAuth token exchange — sets httpOnly cookie from URL token
router.post('/oauth-callback', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'No token' });

    // Verify token is valid
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(token, process.env.JWT_SECRET);

    // Set proper httpOnly cookie
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, data: decoded });
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

// Admin "me" endpoint — accepts admin tokens
router.get('/admin/me', authenticateAdmin, (req, res) => {
  res.json({ success: true, data: { ...req.admin, type: 'admin' } });
});
