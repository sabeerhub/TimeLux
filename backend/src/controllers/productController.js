import { query } from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { logAudit } from '../utils/audit.js';
import { deleteImage } from '../config/cloudinary.js';
import slugify from '../utils/slugify.js';

// ─── GET ALL PRODUCTS (public) ────────────────────────────
export const getProducts = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 12, brand, category,
      sort = 'created_at', order = 'desc',
      search, featured, min_price, max_price
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['p.is_active = true'];
    const params = [];
    let paramIdx = 1;

    if (brand) {
      params.push(brand);
      conditions.push(`b.slug = $${paramIdx++}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`p.category = $${paramIdx++}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.name ILIKE $${paramIdx} OR b.name ILIKE $${paramIdx++})`);
    }
    if (featured === 'true') {
      conditions.push(`p.is_featured = true`);
    }
    if (min_price) {
      params.push(min_price);
      conditions.push(`p.price >= $${paramIdx++}`);
    }
    if (max_price) {
      params.push(max_price);
      conditions.push(`p.price <= $${paramIdx++}`);
    }

    const where = conditions.join(' AND ');
    const allowedSort = { price: 'p.price', created_at: 'p.created_at', name: 'p.name' };
    const sortCol = allowedSort[sort] || 'p.created_at';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';

    params.push(parseInt(limit));
    params.push(offset);

    const sql = `
      SELECT p.id, p.name, p.slug, p.price, p.stock_qty, p.images,
             p.is_featured, p.movement_type, p.case_size_mm, p.case_material,
             p.water_resistance, p.category, p.created_at,
             b.name AS brand_name, b.slug AS brand_slug
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE ${where}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;

    const countSql = `
      SELECT COUNT(*) FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE ${where}
    `;

    const [products, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, -2)),
    ]);

    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: products.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET SINGLE PRODUCT ───────────────────────────────────
export const getProduct = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const { rows } = await query(`
      SELECT p.*, b.name AS brand_name, b.slug AS brand_slug
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.slug = $1 AND p.is_active = true
    `, [slug]);

    if (!rows[0]) throw new AppError('Product not found.', 404);

    // Increment view count (fire and forget)
    query('UPDATE products SET view_count = view_count + 1 WHERE id = $1', [rows[0].id]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── CREATE PRODUCT (admin) ───────────────────────────────
export const createProduct = async (req, res, next) => {
  try {
    const {
      brand_id, name, price, description, stock_qty,
      category, specifications, is_featured, movement_type,
      case_size_mm, case_material, water_resistance,
      meta_title, meta_description
    } = req.body;

    const slug = await generateUniqueSlug(name);

    // Process uploaded images
    const images = (req.files || []).map((file, index) => ({
      url: file.path,
      public_id: file.filename,
      is_primary: index === 0,
    }));

    const { rows } = await query(`
      INSERT INTO products (
        brand_id, name, slug, price, description, stock_qty,
        category, specifications, images, is_featured,
        movement_type, case_size_mm, case_material, water_resistance,
        meta_title, meta_description
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      brand_id, name, slug, price, description, stock_qty || 0,
      category, JSON.stringify(specifications || {}),
      JSON.stringify(images), is_featured || false,
      movement_type, case_size_mm, case_material, water_resistance,
      meta_title || name, meta_description || description,
    ]);

    await logAudit({
      actorId: req.admin.id,
      actorType: 'admin',
      actorEmail: req.admin.email,
      action: 'product.create',
      entity: 'products',
      entityId: rows[0].id,
      ip: req.ip,
      metadata: { name, price },
    });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── UPDATE PRODUCT (admin) ───────────────────────────────
export const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT * FROM products WHERE id = $1', [id]);
    if (!existing.rows[0]) throw new AppError('Product not found.', 404);

    const {
      brand_id, name, price, description, stock_qty,
      category, specifications, is_featured, is_active,
      movement_type, case_size_mm, case_material, water_resistance
    } = req.body;

    const slug = name ? await generateUniqueSlug(name, id) : existing.rows[0].slug;

    // Handle new image uploads
    let images = existing.rows[0].images || [];
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file, index) => ({
        url: file.path,
        public_id: file.filename,
        is_primary: images.length === 0 && index === 0,
      }));
      images = [...images, ...newImages];
    }

    const { rows } = await query(`
      UPDATE products SET
        brand_id = COALESCE($1, brand_id),
        name = COALESCE($2, name),
        slug = $3,
        price = COALESCE($4, price),
        description = COALESCE($5, description),
        stock_qty = COALESCE($6, stock_qty),
        category = COALESCE($7, category),
        specifications = COALESCE($8, specifications),
        images = $9,
        is_featured = COALESCE($10, is_featured),
        is_active = COALESCE($11, is_active),
        movement_type = COALESCE($12, movement_type),
        case_size_mm = COALESCE($13, case_size_mm),
        case_material = COALESCE($14, case_material),
        water_resistance = COALESCE($15, water_resistance),
        updated_at = NOW()
      WHERE id = $16
      RETURNING *
    `, [
      brand_id, name, slug, price, description, stock_qty,
      category, specifications ? JSON.stringify(specifications) : null,
      JSON.stringify(images), is_featured, is_active,
      movement_type, case_size_mm, case_material, water_resistance, id
    ]);

    await logAudit({
      actorId: req.admin.id,
      actorType: 'admin',
      actorEmail: req.admin.email,
      action: 'product.update',
      entity: 'products',
      entityId: id,
      ip: req.ip,
    });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE PRODUCT (admin) ───────────────────────────────
export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await query('SELECT * FROM products WHERE id = $1', [id]);
    if (!rows[0]) throw new AppError('Product not found.', 404);

    // Soft delete — never hard delete products with orders
    await query('UPDATE products SET is_active = false WHERE id = $1', [id]);

    // Delete images from Cloudinary
    const images = rows[0].images || [];
    await Promise.all(images.map(img => img.public_id && deleteImage(img.public_id)));

    await logAudit({
      actorId: req.admin.id,
      actorType: 'admin',
      actorEmail: req.admin.email,
      action: 'product.delete',
      entity: 'products',
      entityId: id,
      ip: req.ip,
    });

    res.json({ success: true, message: 'Product removed.' });
  } catch (err) {
    next(err);
  }
};

// ─── HELPER ───────────────────────────────────────────────
const generateUniqueSlug = async (name, excludeId = null) => {
  let slug = slugify(name);
  let counter = 0;
  while (true) {
    const candidate = counter === 0 ? slug : `${slug}-${counter}`;
    const { rows } = await query(
      'SELECT id FROM products WHERE slug = $1 AND ($2::uuid IS NULL OR id != $2)',
      [candidate, excludeId]
    );
    if (!rows[0]) return candidate;
    counter++;
  }
};
