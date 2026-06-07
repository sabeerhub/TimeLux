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
