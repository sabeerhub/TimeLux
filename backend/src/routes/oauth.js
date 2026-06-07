import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', // lax required for OAuth redirects
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const issueToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

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

    // Exchange code for tokens
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
    if (!tokens.access_token) throw new Error('Google token exchange failed');

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleUser = await userRes.json();

    if (!googleUser.email) throw new Error('Could not retrieve email from Google');

    // Upsert customer
    const customer = await upsertOAuthCustomer({
      email: googleUser.email.toLowerCase(),
      full_name: googleUser.name || googleUser.email,
      provider: 'google',
      provider_id: googleUser.id,
    });

    const token = issueToken({ id: customer.id, type: 'customer' });
    res.cookie('access_token', token, COOKIE_OPTIONS);

    await logAudit({
      actorId: customer.id, actorType: 'customer',
      actorEmail: customer.email, action: 'customer.oauth.google',
      ip: req.ip,
    });

    res.redirect(`${process.env.FRONTEND_URL}${redirect}`);
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/auth.html?error=oauth_failed`);
  }
});

// ─── APPLE OAUTH ──────────────────────────────────────────
router.get('/apple', (req, res) => {
  const redirect = req.query.redirect || '/shop.html';
  const state = Buffer.from(JSON.stringify({ redirect })).toString('base64');
  const params = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID,
    redirect_uri: `${process.env.BACKEND_URL}/api/auth/apple/callback`,
    response_type: 'code id_token',
    scope: 'name email',
    response_mode: 'form_post',
    state,
  });
  res.redirect(`https://appleid.apple.com/auth/authorize?${params}`);
});

router.post('/apple/callback', express.urlencoded({ extended: true }), async (req, res) => {
  const { code, id_token, state, user: userJson } = req.body;
  let redirect = '/shop.html';

  try {
    if (state) {
      const parsed = JSON.parse(Buffer.from(state, 'base64').toString());
      redirect = parsed.redirect || '/shop.html';
    }

    // Decode id_token (Apple sends user info here)
    const payload = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64').toString());
    const email = payload.email;

    let fullName = email.split('@')[0];
    if (userJson) {
      try {
        const u = JSON.parse(userJson);
        if (u.name) fullName = `${u.name.firstName || ''} ${u.name.lastName || ''}`.trim();
      } catch {}
    }

    if (!email) throw new Error('Could not retrieve email from Apple');

    const customer = await upsertOAuthCustomer({
      email: email.toLowerCase(),
      full_name: fullName,
      provider: 'apple',
      provider_id: payload.sub,
    });

    const token = issueToken({ id: customer.id, type: 'customer' });
    res.cookie('access_token', token, COOKIE_OPTIONS);

    await logAudit({
      actorId: customer.id, actorType: 'customer',
      actorEmail: customer.email, action: 'customer.oauth.apple',
      ip: req.ip,
    });

    res.redirect(`${process.env.FRONTEND_URL}${redirect}`);
  } catch (err) {
    console.error('Apple OAuth error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/auth.html?error=oauth_failed`);
  }
});

// ─── UPSERT OAUTH CUSTOMER ────────────────────────────────
const upsertOAuthCustomer = async ({ email, full_name, provider, provider_id }) => {
  // Check if exists
  const { rows } = await query(
    'SELECT id, email, full_name FROM customers WHERE email = $1',
    [email]
  );

  if (rows[0]) {
    // Update last login
    await query('UPDATE customers SET last_login = NOW() WHERE id = $1', [rows[0].id]);
    return rows[0];
  }

  // Create new customer (no password — OAuth only)
  const { rows: [newCustomer] } = await query(`
    INSERT INTO customers (email, full_name, is_verified)
    VALUES ($1, $2, true)
    RETURNING id, email, full_name
  `, [email, full_name]);

  return newCustomer;
};

export default router;
