import rateLimit from 'express-rate-limit';

const createLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: message },
    skip: (req) => process.env.NODE_ENV === 'test',
  });

export const globalRateLimiter = createLimiter(
  15 * 60 * 1000, // 15 min
  200,
  'Too many requests. Please try again later.'
);

export const authRateLimiter = createLimiter(
  15 * 60 * 1000,
  10,
  'Too many login attempts. Please try again in 15 minutes.'
);

export const orderRateLimiter = createLimiter(
  60 * 60 * 1000, // 1 hour
  20,
  'Too many orders initiated. Please try again later.'
);

export const adminRateLimiter = createLimiter(
  15 * 60 * 1000,
  5,
  'Too many admin login attempts.'
);
