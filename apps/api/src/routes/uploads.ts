import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { csrfGuard } from './csrf.js';
import { env } from '../config/env.js';

const uploadSchema = z.object({
  filename: z.string().min(1).max(128),
  contentType: z.string().min(1).max(128),
  size: z.coerce.number().int().positive().max(10 * 1024 * 1024)
});

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export const uploadsRouter = Router();

uploadsRouter.post('/presign', csrfGuard, (req, res, next) => {
  try {
    const input = uploadSchema.parse(req.body || {});
    const key = `proof/${Date.now()}-${crypto.randomUUID()}-${sanitizeFilename(input.filename)}`;

    const baseUrl = env.UPLOAD_PRESIGN_BASE_URL;
    if (!baseUrl) {
      return res.status(503).json({
        error: 'Upload service not configured'
      });
    }

    return res.json({
      key,
      uploadUrl: `${baseUrl.replace(/\/$/, '')}/${key}`,
      headers: {
        'Content-Type': input.contentType
      },
      expiresInSeconds: 300
    });
  } catch (err) {
    next(err);
  }
});
