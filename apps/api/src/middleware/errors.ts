import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not Found' });
};

function readHttpStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const maybe = err as { status?: unknown; statusCode?: unknown };
  const status = typeof maybe.status === 'number' ? maybe.status : null;
  const statusCode = typeof maybe.statusCode === 'number' ? maybe.statusCode : null;
  const value = status ?? statusCode;
  if (!value) return null;
  if (!Number.isInteger(value)) return null;
  if (value < 400 || value > 599) return null;
  return value;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'ValidationError', details: err.flatten() });
  }

  // body-parser / express.json errors
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload Too Large' });
  }

  // multer errors
  if (err?.name === 'MulterError') {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File Too Large' });
    }
    return res.status(400).json({ error: 'Invalid multipart form data' });
  }

  const status = readHttpStatus(err);
  if (status && status >= 400 && status < 500) {
    // Keep client-visible messages generic for safety.
    return res.status(status).json({ error: 'Bad Request' });
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal Server Error' });
};
