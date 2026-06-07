import crypto from 'crypto';

const KORAPAY_BASE = process.env.KORAPAY_BASE_URL || 'https://api.korapay.com/merchant/api/v1';

// ─── INITIATE PAYMENT ─────────────────────────────────────
export const initiateKorapayPayment = async ({
  amount, currency = 'NGN', reference,
  customer, redirect_url, cancel_url,
}) => {
  const body = {
    amount,
    currency,
    reference,
    customer,
    redirect_url,
    notification_url: `${process.env.BACKEND_URL}/api/webhooks/korapay`,
  };
  if (cancel_url) body.cancel_url = cancel_url;

  const response = await fetch(`${KORAPAY_BASE}/charges/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${process.env.KORAPAY_SECRET_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok || !data.status) {
    console.error('Korapay init error:', data);
    throw new Error(data.message || 'Payment initialization failed.');
  }

  return data.data; // { checkout_url, reference, … }
};

// ─── VERIFY PAYMENT ───────────────────────────────────────
export const verifyKorapayPayment = async (reference) => {
  const response = await fetch(`${KORAPAY_BASE}/charges/${reference}`, {
    headers: { Authorization: `Bearer ${process.env.KORAPAY_SECRET_KEY}` },
  });

  const data = await response.json();
  if (!response.ok || !data.status) throw new Error(data.message || 'Payment verification failed.');

  return data.data;
};

// ─── VALIDATE WEBHOOK SIGNATURE ───────────────────────────
export const validateWebhookSignature = (rawBody, signatureHeader) => {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', process.env.KORAPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
};
