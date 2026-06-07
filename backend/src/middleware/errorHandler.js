import { AppError } from '../utils/errors.js';

export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error.';

  // Postgres errors
  if (err.code === '23505') {
    statusCode = 409;
    message = 'A record with this value already exists.';
  } else if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced record not found.';
  } else if (err.code === '22P02') {
    statusCode = 400;
    message = 'Invalid ID format.';
  }

  // Multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = 'File too large. Maximum size is 5MB.';
  }

  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFound = (req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found.` });
};
