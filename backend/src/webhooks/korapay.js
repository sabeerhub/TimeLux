import { query, withTransaction } from '../config/database.js';
import { validateWebhookSignature, verifyKorapayPayment } from '../services/korapay.js';
import { logAudit } from '../utils/audit.js';

export const korapayWebhook = async (req, res) => {
  // 1. Validate signature FIRST
  const signature = req.headers['x-korapay-signature'];
  const rawBody = req.body; // raw buffer (express.raw middleware)

  if (!validateWebhookSignature(rawBody.toString(), signature)) {
    console.warn('⚠️ Webhook signature mismatch — possible replay attack');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const { event: eventType, data } = event;
  const reference = data?.payment_reference || data?.reference;

  // 2. Idempotency check — prevent duplicate processing
  const existing = await query(
    'SELECT id, processed FROM payment_events WHERE payment_ref = $1',
    [reference]
  );

  if (existing.rows[0]?.processed) {
    console.log(`Webhook already processed: ${reference}`);
    return res.status(200).json({ received: true });
  }

  // 3. Store event (even if processing fails, we have a record)
  await query(`
    INSERT INTO payment_events (payment_ref, event_type, payload)
    VALUES ($1, $2, $3)
    ON CONFLICT (payment_ref) DO UPDATE SET payload = $3
  `, [reference, eventType, JSON.stringify(event)]);

  // 4. Process based on event type
  try {
    if (eventType === 'charge.success') {
      await handlePaymentSuccess(reference, data);
    } else if (eventType === 'charge.failed') {
      await handlePaymentFailed(reference, data);
    }

    // Mark as processed
    await query(
      'UPDATE payment_events SET processed = true, processed_at = NOW() WHERE payment_ref = $1',
      [reference]
    );
  } catch (err) {
    console.error(`Webhook processing error for ${reference}:`, err.message);
    // Don't return error — Korapay will retry. Log and investigate manually.
  }

  // Always respond 200 to Korapay
  res.status(200).json({ received: true });
};

// ─── HANDLE SUCCESSFUL PAYMENT ────────────────────────────
const handlePaymentSuccess = async (reference, data) => {
  // Double-verify with Korapay API (never trust webhook alone)
  const verified = await verifyKorapayPayment(reference);

  if (verified.status !== 'success') {
    throw new Error(`Payment verification mismatch for ${reference}`);
  }

  const amountPaid = parseFloat(verified.amount);

  await withTransaction(async (client) => {
    const { rows: [order] } = await client.query(
      'SELECT * FROM orders WHERE order_ref = $1 FOR UPDATE',
      [reference]
    );

    if (!order) throw new Error(`Order not found for ref: ${reference}`);
    if (order.payment_status === 'paid') return; // already handled

    // Verify amount matches (prevent partial payment attacks)
    if (amountPaid < parseFloat(order.total_amount)) {
      throw new Error(`Amount mismatch: expected ${order.total_amount}, got ${amountPaid}`);
    }

    const trackingUpdate = {
      status: 'payment_confirmed',
      note: 'Payment confirmed via Korapay',
      timestamp: new Date().toISOString(),
    };

    await client.query(`
      UPDATE orders SET
        payment_status = 'paid',
        status = 'payment_confirmed',
        payment_channel = $1,
        paid_at = NOW(),
        tracking_updates = tracking_updates || $2::jsonb,
        updated_at = NOW()
      WHERE id = $3
    `, [data.payment_method || 'card', JSON.stringify([trackingUpdate]), order.id]);

    await logAudit({
      actorType: 'system',
      action: 'payment.success',
      entity: 'orders',
      entityId: order.id,
      metadata: { reference, amount: amountPaid },
    });
  });
};

// ─── HANDLE FAILED PAYMENT ────────────────────────────────
const handlePaymentFailed = async (reference, data) => {
  const { rows: [order] } = await query(
    'SELECT * FROM orders WHERE order_ref = $1',
    [reference]
  );

  if (!order || order.payment_status === 'paid') return;

  // Restore stock
  await withTransaction(async (client) => {
    const { rows: items } = await client.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
      [order.id]
    );

    for (const item of items) {
      await client.query(
        'UPDATE products SET stock_qty = stock_qty + $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    await client.query(`
      UPDATE orders SET payment_status = 'failed', status = 'cancelled', updated_at = NOW()
      WHERE id = $1
    `, [order.id]);
  });

  await logAudit({
    actorType: 'system',
    action: 'payment.failed',
    entity: 'orders',
    entityId: order.id,
    metadata: { reference },
  });
};
