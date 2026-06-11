import { query, withTransaction } from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { logAudit } from '../utils/audit.js';
import { initiateKorapayPayment } from '../services/korapay.js';

// ─── GENERATE ORDER REF ───────────────────────────────────
const generateOrderRef = async () => {
  const { rows } = await query("SELECT nextval('order_ref_seq') AS seq");
  const year = new Date().getFullYear();
  const seq  = String(rows[0].seq).padStart(5, '0');
  return `ORD-${year}-${seq}`;
};

// ─── CREATE ORDER ─────────────────────────────────────────
export const createOrder = async (req, res, next) => {
  try {
    const { items, delivery_address, customer_info } = req.body;
    const customerId = req.user?.id || null;

    const order = await withTransaction(async (client) => {
      // 1. Lock products and validate stock
      const productIds = items.map(i => i.product_id);
      const { rows: products } = await client.query(`
        SELECT id, name, price, stock_qty, images
        FROM products
        WHERE id = ANY($1::uuid[]) AND is_active = true
        FOR UPDATE
      `, [productIds]);

      if (products.length !== items.length) {
        throw new AppError('One or more products not found or unavailable.', 400);
      }

      const productMap = Object.fromEntries(products.map(p => [p.id, p]));
      let subtotal = 0;

      for (const item of items) {
        const product = productMap[item.product_id];
        if (!product) throw new AppError('Product not found.', 400);
        if (product.stock_qty < item.quantity) {
          throw new AppError(`Insufficient stock for "${product.name}".`, 400);
        }
        subtotal += parseFloat(product.price) * item.quantity;
      }

      const delivery_fee  = 0;
      const total_amount  = subtotal + delivery_fee;
      const order_ref     = await generateOrderRef();

      // 2. Create order record
      const { rows: [newOrder] } = await client.query(`
        INSERT INTO orders (
          order_ref, customer_id, customer_name, customer_email, customer_phone,
          delivery_address, subtotal, delivery_fee, total_amount, status, payment_status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending','pending')
        RETURNING *
      `, [
        order_ref, customerId,
        customer_info.full_name, customer_info.email, customer_info.phone,
        JSON.stringify(delivery_address),
        subtotal, delivery_fee, total_amount,
      ]);

      // 3. Insert order items (price snapshot)
      for (const item of items) {
        const product       = productMap[item.product_id];
        const primaryImage  = (product.images || [])[0]?.url || null;
        await client.query(`
          INSERT INTO order_items
            (order_id, product_id, product_name, product_image, unit_price, quantity, subtotal)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [
          newOrder.id, item.product_id, product.name, primaryImage,
          product.price, item.quantity,
          parseFloat(product.price) * item.quantity,
        ]);

        // 4. Decrement stock
        await client.query(
          'UPDATE products SET stock_qty = stock_qty - $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }

      return newOrder;
    });

    // 5. Initiate Korapay payment
    const payment = await initiateKorapayPayment({
      amount:       parseFloat(order.total_amount),
      currency:     'NGN',
      reference:    order.order_ref,
      customer:     { name: order.customer_name, email: order.customer_email },
      redirect_url: `${process.env.FRONTEND_URL}/payment-success.html?ref=${order.order_ref}`,
      
    });

    // 6. Save payment reference
    await query('UPDATE orders SET payment_ref = $1 WHERE id = $2', [payment.reference, order.id]);

    await logAudit({
      actorId:    customerId,
      actorType:  customerId ? 'customer' : 'guest',
      actorEmail: order.customer_email,
      action:     'order.create',
      entity:     'orders',
      entityId:   order.id,
      ip:         req.ip,
      metadata:   { order_ref: order.order_ref, total: order.total_amount },
    });

    res.status(201).json({
      success: true,
      data: {
        order_ref:    order.order_ref,
        total_amount: order.total_amount,
        payment_url:  payment.checkout_url,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET ORDER BY REF ─────────────────────────────────────
export const getOrder = async (req, res, next) => {
  try {
    const { ref } = req.params;

    const { rows: [order] } = await query(`
      SELECT o.*,
        json_agg(json_build_object(
          'id',            oi.id,
          'product_name',  oi.product_name,
          'product_image', oi.product_image,
          'unit_price',    oi.unit_price,
          'quantity',      oi.quantity,
          'subtotal',      oi.subtotal
        )) AS items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.order_ref = $1
      GROUP BY o.id
    `, [ref.toUpperCase()]);

    if (!order) throw new AppError('Order not found.', 404);

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

// ─── GET MY ORDERS ────────────────────────────────────────
export const getMyOrders = async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT o.id, o.order_ref, o.status, o.payment_status,
             o.total_amount, o.created_at,
             COUNT(oi.id) AS item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.customer_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [req.user.id]);

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: GET ALL ORDERS ────────────────────────────────
export const adminGetOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params     = [];

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), offset);

    const { rows } = await query(`
      SELECT o.id, o.order_ref, o.customer_name, o.customer_email,
             o.status, o.payment_status, o.total_amount, o.created_at
      FROM orders o
      ${where}
      ORDER BY o.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ─── ADMIN: UPDATE ORDER STATUS ───────────────────────────
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id }          = req.params;
    const { status, note } = req.body;

    const { rows: [order] } = await query('SELECT * FROM orders WHERE id = $1', [id]);
    if (!order) throw new AppError('Order not found.', 404);

    const trackingUpdate = {
      status,
      note:      note || '',
      timestamp: new Date().toISOString(),
    };
    const updates = [...(order.tracking_updates || []), trackingUpdate];

    const { rows: [updated] } = await query(`
      UPDATE orders
      SET status = $1, tracking_updates = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [status, JSON.stringify(updates), id]);

    await logAudit({
      actorId:    req.admin.id,
      actorType:  'admin',
      actorEmail: req.admin.email,
      action:     'order.status_update',
      entity:     'orders',
      entityId:   id,
      ip:         req.ip,
      metadata:   { from: order.status, to: status },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

// ─── RETRY PAYMENT ────────────────────────────────────────
export const retryPayment = async (req, res, next) => {
  try {
    const { ref } = req.params;

    const { rows: [order] } = await query(
      'SELECT * FROM orders WHERE order_ref = $1',
      [ref.toUpperCase()]
    );

    if (!order)                           throw new AppError('Order not found.', 404);
    if (order.payment_status === 'paid')  throw new AppError('Order is already paid.', 400);
    if (order.status === 'cancelled')     throw new AppError('Order was cancelled.', 400);

    // New Korapay reference to avoid duplicate-reference rejection
    const newRef = `${order.order_ref}-R${Date.now()}`;

    const payment = await initiateKorapayPayment({
      amount:       parseFloat(order.total_amount),
      currency:     'NGN',
      reference:    newRef,
      customer:     { name: order.customer_name, email: order.customer_email },
      redirect_url: `${process.env.FRONTEND_URL}/payment-success.html?ref=${order.order_ref}`,
      
    });

    res.json({
      success: true,
      data: {
        order_ref:   order.order_ref,
        payment_url: payment.checkout_url,
      },
    });
  } catch (err) {
    next(err);
  }
};
