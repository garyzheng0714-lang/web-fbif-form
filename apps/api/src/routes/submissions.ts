import { Router } from 'express';
import crypto from 'node:crypto';
import { parseSubmissionPayload } from '../validation/submission.js';
import {
  createSubmission,
  findSubmissionByIdempotencyKey,
  getSubmissionStatus
} from '../services/submissionService.js';
import { feishuSyncQueue } from '../queue/index.js';
import { burstLimiter } from '../middleware/rateLimit.js';
import { csrfGuard } from './csrf.js';
import { hashField } from '../utils/crypto.js';
import { env } from '../config/env.js';

export const submissionsRouter = Router();

function createStatusToken() {
  return crypto.randomBytes(20).toString('base64url');
}

function createDeterministicStatusToken(idempotencyKey: string) {
  return crypto
    .createHmac('sha256', env.DATA_HASH_SALT)
    .update(`status:${idempotencyKey}`)
    .digest('base64url')
    .slice(0, 40);
}

function readIdempotencyKey(raw: unknown): string | undefined {
  const source = Array.isArray(raw) ? String(raw[0] || '') : raw;
  if (typeof source !== 'string') return undefined;
  const value = source.trim();
  if (!value) return undefined;
  if (!/^[\w-]{8,128}$/.test(value)) return undefined;
  return value;
}

function isPrismaUniqueError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === 'P2002');
}

submissionsRouter.post('/', burstLimiter, csrfGuard, async (req, res, next) => {
  try {
    const input = parseSubmissionPayload(req.body);
    const idempotencyHeader = req.headers['idempotency-key'];
    const idempotencyKey = readIdempotencyKey(idempotencyHeader);
    if (idempotencyHeader && !idempotencyKey) {
      return res.status(400).json({ error: 'Invalid Idempotency-Key' });
    }
    const idempotencyKeyHash = idempotencyKey ? hashField(idempotencyKey) : undefined;
    const statusToken = idempotencyKey ? createDeterministicStatusToken(idempotencyKey) : createStatusToken();

    if (idempotencyKeyHash) {
      const existing = await findSubmissionByIdempotencyKey(idempotencyKeyHash);
      if (existing) {
        return res.status(200).json({
          id: existing.id,
          syncStatus: existing.syncStatus,
          statusToken,
          replayed: true
        });
      }
    }

    let submission;
    try {
      submission = await createSubmission({
        ...input,
        statusTokenHash: hashField(statusToken),
        idempotencyKeyHash
      }, {
        clientIp: req.ip,
        userAgent: req.headers['user-agent']
      });
    } catch (err) {
      if (idempotencyKeyHash && isPrismaUniqueError(err)) {
        const existing = await findSubmissionByIdempotencyKey(idempotencyKeyHash);
        if (existing) {
          return res.status(200).json({
            id: existing.id,
            syncStatus: existing.syncStatus,
            statusToken,
            replayed: true
          });
        }
      }
      throw err;
    }

    await feishuSyncQueue.add('sync', { submissionId: submission.id }, {
      jobId: submission.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 }
    });

    res.status(202).json({
      id: submission.id,
      syncStatus: submission.syncStatus,
      statusToken,
      replayed: false
    });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.get('/:id/status', async (req, res, next) => {
  try {
    const statusToken = typeof req.query.statusToken === 'string' ? req.query.statusToken : '';
    if (!statusToken && !env.ALLOW_LEGACY_STATUS_QUERY) {
      return res.status(401).json({ error: 'statusToken required' });
    }

    const status = await getSubmissionStatus(
      req.params.id,
      statusToken ? hashField(statusToken) : undefined
    );
    if (!status) {
      return res.status(404).json({ error: 'Not Found' });
    }

    const pollAfterMs = status.syncStatus === 'PENDING' ? 1500 : 0;
    res.json({
      id: status.id,
      syncStatus: status.syncStatus,
      syncError: status.syncError,
      feishuRecordId: status.feishuRecordId,
      createdAt: status.createdAt,
      pollAfterMs
    });
  } catch (err) {
    next(err);
  }
});
