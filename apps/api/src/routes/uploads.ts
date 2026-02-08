import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { csrfGuard } from './csrf.js';
import { env } from '../config/env.js';
import { uploadBitableAttachment } from '../services/feishuService.js';

const uploadSchema = z.object({
  filename: z.string().min(1).max(128),
  contentType: z.string().min(1).max(128),
  size: z.coerce.number().int().positive().max(10 * 1024 * 1024)
});

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

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

uploadsRouter.post('/feishu', csrfGuard, upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'file required' });
    }

    const safeName = sanitizeFilename(file.originalname || 'upload.bin');
    const fileToken = await uploadBitableAttachment({
      filename: safeName,
      contentType: file.mimetype || 'application/octet-stream',
      size: file.size,
      buffer: file.buffer
    });

    return res.json({
      fileToken,
      name: safeName,
      size: file.size,
      contentType: file.mimetype || 'application/octet-stream'
    });
  } catch (err) {
    next(err);
  }
});
