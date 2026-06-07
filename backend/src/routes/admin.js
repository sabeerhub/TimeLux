import express from 'express';
import { authenticateAdmin, requireRole } from '../middleware/auth/jwt.js';
import { query } from '../config/database.js';

const router = express.Router();

// All admin routes require authentication
router.use(authenticateAdmin);

// ─── DASHBOARD STATS ──────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const [revenue, orders, customers, lowStock] = await Promise.all([
      query(`
        SELECT 
          SUM(total_amount) FILTER (WHERE payment_status = 'paid') AS total_revenue,
          SUM(total_amount) FILTER (WHERE payment_status = 'paid' AND created_at >= date_trunc('month', NOW())) AS monthly_revenue
        FROM orders
      `),
      query(`
        SELECT 
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) AS this_month
        FROM orders
      `),
      query(`
        SELECT COUNT(*) AS total FROM customers
      `),
      query(`
        SELECT COUNT(*) AS count FROM products WHERE stock_qty <= 2 AND is_active = true
      `),
    ]);

    res.json({
      success: true,
      data: {
        revenue: {
          total: parseFloat(revenue.rows[0].total_revenue || 0),
          this_month: parseFloat(revenue.rows[0].monthly_revenue || 0),
        },
        orders: {
          total: parseInt(orders.rows[0].total),
          this_month: parseInt(orders.rows[0].this_month),
        },
        customers: parseInt(customers.rows[0].total),
        low_stock: parseInt(lowStock.rows[0].count),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── REVENUE CHART ────────────────────────────────────────
router.get('/dashboard/revenue-chart', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT 
        DATE(created_at) AS date,
        SUM(total_amount) AS revenue,
        COUNT(*) AS orders
      FROM orders
      WHERE payment_status = 'paid'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ─── RECENT ORDERS ────────────────────────────────────────
router.get('/dashboard/recent-orders', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT id, order_ref, customer_name, total_amount, status, payment_status, created_at
      FROM orders ORDER BY created_at DESC LIMIT 10
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ─── CUSTOMERS LIST ───────────────────────────────────────
router.get('/customers', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows } = await query(`
      SELECT c.id, c.email, c.full_name, c.phone, c.created_at,
             COUNT(o.id) AS order_count,
             SUM(o.total_amount) FILTER (WHERE o.payment_status = 'paid') AS lifetime_value
      FROM customers c
      LEFT JOIN orders o ON c.id = o.customer_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit), offset]);

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ─── AUDIT LOG (super admin only) ─────────────────────────
router.get('/audit-logs', requireRole('super_admin'), async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
