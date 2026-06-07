import express from 'express';
import {
  createOrder, getOrder, getMyOrders,
  adminGetOrders, updateOrderStatus,
  retryPayment,
} from '../controllers/orderController.js';
import { authenticate, authenticateAdmin, optionalAuth } from '../middleware/auth/jwt.js';
import { orderRateLimiter } from '../middleware/security/rateLimiter.js';
import { validateBody } from '../middleware/validation/validate.js';
import { createOrderSchema } from '../validators/order.js';

const router = express.Router();

// ── Customer routes ───────────────────────────────────────
router.post('/',            orderRateLimiter, optionalAuth, validateBody(createOrderSchema), createOrder);
router.get('/my-orders',    authenticate, getMyOrders);
router.get('/:ref',         getOrder);
router.post('/:ref/retry-payment', authenticate, retryPayment);

// ── Admin routes ──────────────────────────────────────────
router.get('/admin/all',              authenticateAdmin, adminGetOrders);
router.patch('/admin/:id/status',     authenticateAdmin, updateOrderStatus);

export default router;
