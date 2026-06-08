import express from 'express';
import {
  getProducts, getProduct,
  createProduct, updateProduct, deleteProduct,
} from '../controllers/productController.js';
import { authenticateAdmin } from '../middleware/auth/jwt.js';
import { uploadWatchImages } from '../config/storage.js';
import { query } from '../config/database.js';
import { uploadToSupabase } from '../config/storage.js';

const router = express.Router();

// Public
router.get('/',      getProducts);
router.get('/:slug', getProduct);

// Admin
router.post('/',        authenticateAdmin, uploadWatchImages.array('images', 6), createProduct);
router.put('/:id',      authenticateAdmin, uploadWatchImages.array('images', 6), updateProduct);
router.patch('/:id',    authenticateAdmin, updateProduct);
router.delete('/:id',   authenticateAdmin, deleteProduct);

// Image upload endpoint
router.put('/:id/images', authenticateAdmin, uploadWatchImages.array('images', 6), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [product] } = await query('SELECT * FROM products WHERE id = $1', [id]);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });

    const existing = product.images || [];
    const newImages = [];

    for (let i = 0; i < (req.files||[]).length; i++) {
      const uploaded = await uploadToSupabase(req.files[i]);
      newImages.push({ ...uploaded, is_primary: existing.length===0 && i===0 });
    }

    const images = [...existing, ...newImages];
    const { rows: [updated] } = await query(
      'UPDATE products SET images = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(images), id]
    );

    res.json({ success: true, data: updated });
  } catch(err) { next(err); }
});

export default router;
