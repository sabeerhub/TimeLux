import { query } from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { logAudit } from '../utils/audit.js';
import { uploadToSupabase, deleteFromSupabase } from '../config/storage.js';
import slugify from '../utils/slugify.js';

// ─── GET ALL PRODUCTS ─────────────────────────────────────
export const getProducts = async (req, res, next) => {
  try {
    const {
      page=1, limit=12, brand, category,
      sort='created_at', order='desc',
      search, featured, min_price, max_price
    } = req.query;

    const offset = (parseInt(page)-1) * parseInt(limit);
    const conditions = ['p.is_active = true'];
    const params = [];
    let idx = 1;

    if (brand)     { params.push(brand);       conditions.push(`b.slug = $${idx++}`); }
    if (category)  { params.push(category);    conditions.push(`p.category = $${idx++}`); }
    if (search)    { params.push(`%${search}%`); conditions.push(`(p.name ILIKE $${idx} OR b.name ILIKE $${idx++})`); }
    if (featured==='true') conditions.push(`p.is_featured = true`);
    if (min_price) { params.push(min_price);   conditions.push(`p.price >= $${idx++}`); }
    if (max_price) { params.push(max_price);   conditions.push(`p.price <= $${idx++}`); }

    const where   = conditions.join(' AND ');
    const allowed = { price:'p.price', created_at:'p.created_at', name:'p.name' };
    const sortCol = allowed[sort] || 'p.created_at';
    const sortDir = order==='asc' ? 'ASC' : 'DESC';

    params.push(parseInt(limit), offset);

    const { rows } = await query(`
      SELECT p.id, p.name, p.slug, p.price, p.stock_qty, p.images,
             p.is_featured, p.movement_type, p.case_size_mm, p.case_material,
             p.water_resistance, p.category, p.created_at,
             b.name AS brand_name, b.slug AS brand_slug
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE ${where}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT $${idx++} OFFSET $${idx++}
    `, params);

    const countParams = params.slice(0,-2);
    const { rows: countRows } = await query(`
      SELECT COUNT(*) FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE ${where}
    `, countParams);

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total: parseInt(countRows[0].count),
        pages: Math.ceil(parseInt(countRows[0].count)/parseInt(limit)),
      },
    });
  } catch(err) { next(err); }
};

// ─── GET SINGLE PRODUCT ───────────────────────────────────
export const getProduct = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { rows: [product] } = await query(`
      SELECT p.*, b.name AS brand_name, b.slug AS brand_slug
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.slug = $1 AND p.is_active = true
    `, [slug]);

    if (!product) throw new AppError('Product not found.', 404);
    query('UPDATE products SET view_count = view_count + 1 WHERE id = $1', [product.id]);
    res.json({ success: true, data: product });
  } catch(err) { next(err); }
};

// ─── CREATE PRODUCT ───────────────────────────────────────
export const createProduct = async (req, res, next) => {
  try {
    const {
      brand_id, name, price, description, stock_qty,
      category, is_featured, movement_type,
      case_size_mm, case_material, water_resistance,
    } = req.body;

    if (!name) throw new AppError('Watch name is required.', 400);
    if (!price) throw new AppError('Price is required.', 400);

    const slug = await generateUniqueSlug(name);

    // Upload images to Supabase if any
    const images = [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const uploaded = await uploadToSupabase(req.files[i]);
        images.push({ ...uploaded, is_primary: i === 0 });
      }
    }

    const { rows: [product] } = await query(`
      INSERT INTO products (
        brand_id, name, slug, price, description, stock_qty,
        category, images, is_featured, movement_type,
        case_size_mm, case_material, water_resistance,
        meta_title, meta_description
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [
      brand_id||null, name, slug, price, description||null,
      parseInt(stock_qty)||0, category||null,
      JSON.stringify(images), is_featured==='true'||is_featured===true,
      movement_type||null, case_size_mm||null,
      case_material||null, water_resistance||null,
      name, description||null,
    ]);

    await logAudit({
      actorId: req.admin.id, actorType: 'admin',
      actorEmail: req.admin.email, action: 'product.create',
      entity: 'products', entityId: product.id, ip: req.ip,
    });

    res.status(201).json({ success: true, data: product });
  } catch(err) { next(err); }
};

// ─── UPDATE PRODUCT ───────────────────────────────────────
export const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [existing] } = await query('SELECT * FROM products WHERE id = $1', [id]);
    if (!existing) throw new AppError('Product not found.', 404);

    const {
      brand_id, name, price, description, stock_qty,
      category, is_featured, is_active, movement_type,
      case_size_mm, case_material, water_resistance,
    } = req.body;

    const slug = name ? await generateUniqueSlug(name, id) : existing.slug;

    // Handle new image uploads
    let images = existing.images || [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const uploaded = await uploadToSupabase(req.files[i]);
        images.push({ ...uploaded, is_primary: images.length === 0 && i === 0 });
      }
    }

    const { rows: [updated] } = await query(`
      UPDATE products SET
        brand_id = COALESCE($1, brand_id),
        name = COALESCE($2, name),
        slug = $3,
        price = COALESCE($4, price),
        description = COALESCE($5, description),
        stock_qty = COALESCE($6, stock_qty),
        category = COALESCE($7, category),
        images = $8,
        is_featured = COALESCE($9, is_featured),
        is_active = COALESCE($10, is_active),
        movement_type = COALESCE($11, movement_type),
        case_size_mm = COALESCE($12, case_size_mm),
        case_material = COALESCE($13, case_material),
        water_resistance = COALESCE($14, water_resistance),
        updated_at = NOW()
      WHERE id = $15
      RETURNING *
    `, [
      brand_id||null, name||null, slug, price||null,
      description||null, stock_qty ? parseInt(stock_qty) : null,
      category||null, JSON.stringify(images),
      is_featured !== undefined ? (is_featured==='true'||is_featured===true) : null,
      is_active !== undefined ? (is_active==='true'||is_active===true) : null,
      movement_type||null, case_size_mm||null,
      case_material||null, water_resistance||null, id,
    ]);

    await logAudit({
      actorId: req.admin.id, actorType: 'admin',
      actorEmail: req.admin.email, action: 'product.update',
      entity: 'products', entityId: id, ip: req.ip,
    });

    res.json({ success: true, data: updated });
  } catch(err) { next(err); }
};

// ─── DELETE PRODUCT ───────────────────────────────────────
export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: [product] } = await query('SELECT * FROM products WHERE id = $1', [id]);
    if (!product) throw new AppError('Product not found.', 404);

    await query('UPDATE products SET is_active = false WHERE id = $1', [id]);

    // Delete images from Supabase
    const images = product.images || [];
    await Promise.all(images.map(img => img.public_id && deleteFromSupabase(img.public_id)));

    await logAudit({
      actorId: req.admin.id, actorType: 'admin',
      actorEmail: req.admin.email, action: 'product.delete',
      entity: 'products', entityId: id, ip: req.ip,
    });

    res.json({ success: true, message: 'Product removed.' });
  } catch(err) { next(err); }
};

// ─── HELPER ───────────────────────────────────────────────
const generateUniqueSlug = async (name, excludeId=null) => {
  let slug = slugify(name);
  let counter = 0;
  while (true) {
    const candidate = counter===0 ? slug : `${slug}-${counter}`;
    const { rows } = await query(
      'SELECT id FROM products WHERE slug = $1 AND ($2::uuid IS NULL OR id != $2)',
      [candidate, excludeId]
    );
    if (!rows[0]) return candidate;
    counter++;
  }
};
