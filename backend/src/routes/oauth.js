import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const issueToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

// ─── GOOGLE OAUTH ─────────────────────────────────────────
router.get('/google', (req, res) => {
  const redirect = req.query.redirect || '/shop.html';
  const state = Buffer.from(JSON.stringify({ redirect })).toString('base64');
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.BACKEND_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  let redirect = '/shop.html';

  try {
    if (state) {
      const parsed = JSON.parse(Buffer.from(state, 'base64').toString());
      redirect = parsed.redirect || '/shop.html';
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.BACKEND_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('Token exchange failed');

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userRes.json();
    if (!googleUser.email) throw new Error('No email from Google');

    const customer = await upsertOAuthCustomer({
      email: googleUser.email.toLowerCase(),
      full_name: googleUser.name || googleUser.email,
    });

    const token = issueToken({ id: customer.id, type: 'customer' });

    // Set cookie with SameSite=None for cross-domain
    res.cookie('access_token', token, COOKIE_OPTIONS);

    await logAudit({
      actorId: customer.id,
      actorType: 'customer',
      actorEmail: customer.email,
      action: 'customer.oauth.google',
      ip: req.ip,
    });

    // Redirect to frontend OAuth handler with token
    res.redirect(
      `${process.env.FRONTEND_URL}/auth-callback.html?token=${token}&redirect=${encodeURIComponent(redirect)}`
    );
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/auth.html?error=oauth_failed`);
  }
});

// ─── UPSERT CUSTOMER ──────────────────────────────────────
const upsertOAuthCustomer = async ({ email, full_name }) => {
  const { rows } = await query(
    'SELECT id, email, full_name FROM customers WHERE email = $1',
    [email]
  );
  if (rows[0]) {
    await query('UPDATE customers SET last_login = NOW() WHERE id = $1', [rows[0].id]);
    return rows[0];
  }
  const { rows: [newCustomer] } = await query(`
    INSERT INTO customers (email, full_name, is_verified)
    VALUES ($1, $2, true)
    RETURNING id, email, full_name
  `, [email, full_name]);
  return newCustomer;
};

export default router;
