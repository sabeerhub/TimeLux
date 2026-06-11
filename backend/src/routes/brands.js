import express from 'express';
import { query } from '../config/database.js';

const router = express.Router();

// GET all brands (public)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, slug, logo_url FROM brands WHERE is_active = true ORDER BY name'
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST create brand (admin)
router.post('/', async (req, res, next) => {
  try {
    const { name, slug } = req.body;
    const { rows: [brand] } = await query(
      'INSERT INTO brands (name, slug) VALUES ($1, $2) RETURNING *',
      [name, slug]
    );
    res.json({ success: true, data: brand });
  } catch (err) { next(err); }
});

export default router;
