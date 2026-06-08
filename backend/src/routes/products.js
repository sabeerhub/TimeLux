import express from 'express';
import {
  getProducts, getProduct,
  createProduct, updateProduct, deleteProduct,
} from '../controllers/productController.js';
import { authenticateAdmin } from '../middleware/auth/jwt.js';
import { uploadWatchImages } from '../config/cloudinary.js';
import { query } from '../config/database.js';

const router = express.Router();

// Public
router.get('/',     getProducts);
router.get('/:slug', getProduct);

// Admin — JSON based (no file upload)
router.post('/',        authenticateAdmin, createProduct);
router.put('/:id',      authenticateAdmin, updateProduct);
router.patch('/:id',    authenticateAdmin, updateProduct);
router.delete('/:id',   authenticateAdmin, deleteProduct);

// Admin — Image upload (separate endpoint)
router.put('/:id/images', authenticateAdmin, uploadWatchImages.array('images', 6), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [product] } = await query('SELECT * FROM products WHERE id = $1', [id]);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });

    const existing = product.images || [];
    const newImages = (req.files || []).map((file, i) => ({
      url: file.path,
      public_id: file.filename,
      is_primary: existing.length === 0 && i === 0,
    }));

    const images = [...existing, ...newImages];
    const { rows: [updated] } = await query(
      'UPDATE products SET images = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(images), id]
    );

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

export default router;
