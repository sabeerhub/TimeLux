import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { globalRateLimiter } from './middleware/security/rateLimiter.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestLogger } from './utils/logger.js';

import authRoutes    from './routes/auth.js';
import oauthRoutes   from './routes/oauth.js';
import productRoutes from './routes/products.js';
import orderRoutes   from './routes/orders.js';
import adminRoutes   from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';
import brandRoutes   from './routes/brands.js';

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security headers ──────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'res.cloudinary.com', 'data:'],
    },
  },
}));

// ── CORS ──────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Webhook raw body (MUST be before json parser) ─────────
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

// ── Body parsing ──────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ── Logging ───────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(requestLogger);
}

// ── Rate limiting ─────────────────────────────────────────
app.use('/api/', globalRateLimiter);

// ── Health check ──────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TimeLux API', env: process.env.NODE_ENV, ts: new Date().toISOString() });
});

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/auth',     oauthRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/brands',   brandRoutes);

// ── Error handling ────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⌚  TimeLux API  —  port ${PORT}  —  ${process.env.NODE_ENV}`);
  console.log(`   Frontend: ${process.env.FRONTEND_URL}\n`);
});

process.on('SIGTERM', () => { console.log('SIGTERM — shutting down'); process.exit(0); });

export default app;
