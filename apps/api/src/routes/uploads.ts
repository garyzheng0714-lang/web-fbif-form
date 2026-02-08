import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { z } from 'zod';
import { csrfGuard } from './csrf.js';
import { env } from '../config/env.js';
import { uploadBitableAttachment } from '../services/feishuService.js';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const uploadSchema = z.object({
  filename: z.string().min(1).max(128),
  contentType: z.string().min(1).max(128),
  size: z.coerce.number().int().positive().max(MAX_UPLOAD_BYTES)
});

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export const uploadsRouter = Router();

const uploadTmpDir = path.join(os.tmpdir(), 'fbif-uploads');
fs.mkdirSync(uploadTmpDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadTmpDir),
    filename: (_req, file, cb) => {
      const original = sanitizeFilename(file.originalname || 'upload.bin');
      cb(null, `${Date.now()}-${crypto.randomUUID()}-${original}`);
    }
  }),
  limits: {
    fileSize: MAX_UPLOAD_BYTES
  },
  fileFilter: (_req, file, cb) => {
    // Keep aligned with the frontend accept list.
    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'application/pdf'
    ]);
    if (allowed.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Unsupported file type'));
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
    const filePath = file.path;
    if (!filePath) {
      return res.status(500).json({ error: 'upload temp file missing' });
    }

    let fileToken = '';
    try {
      fileToken = await uploadBitableAttachment({
        filename: safeName,
        size: file.size,
        filePath
      });
    } finally {
      // Best-effort cleanup of temp files.
      await fsp.unlink(filePath).catch(() => undefined);
    }

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
