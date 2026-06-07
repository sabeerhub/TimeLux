// products.js
import express from 'express';
import { getProducts, getProduct, createProduct, updateProduct, deleteProduct } from '../controllers/productController.js';
import { authenticateAdmin } from '../middleware/auth/jwt.js';
import { uploadWatchImages } from '../config/cloudinary.js';

const router = express.Router();

router.get('/', getProducts);
router.get('/:slug', getProduct);
router.post('/', authenticateAdmin, uploadWatchImages.array('images', 6), createProduct);
router.put('/:id', authenticateAdmin, uploadWatchImages.array('images', 6), updateProduct);
router.delete('/:id', authenticateAdmin, deleteProduct);

export default router;
