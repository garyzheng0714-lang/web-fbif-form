import crypto from 'node:crypto';
import { createBitableRecord, isFeishuEnabled } from './feishu.js';

const submissions = new Map();

const failRate = Number(process.env.MOCK_API_FAIL_RATE || 0);
const forceSyncStatus = (process.env.MOCK_API_FORCE_SYNC_STATUS || '').toUpperCase();
const syncDelayMs = Number(process.env.MOCK_API_SYNC_DELAY_MS || 1200);
const syncProvider = (process.env.MOCK_API_SYNC_PROVIDER || (isFeishuEnabled() ? 'feishu' : 'mock')).toLowerCase();

function resolveMockFinalStatus() {
  if (forceSyncStatus === 'SUCCESS') return 'SUCCESS';
  if (forceSyncStatus === 'FAILED') return 'FAILED';
  if (Math.random() < failRate) return 'FAILED';
  return 'SUCCESS';
}

async function runFeishuSync(id) {
  const latest = submissions.get(id);
  if (!latest) return;

  try {
    const recordId = await createBitableRecord(latest);
    latest.syncStatus = 'SUCCESS';
    latest.syncError = null;
    latest.feishuRecordId = recordId;
    latest.updatedAt = new Date().toISOString();
  } catch (error) {
    latest.syncStatus = 'FAILED';
    latest.syncError = error instanceof Error ? error.message : 'feishu sync failed';
    latest.updatedAt = new Date().toISOString();
    console.error('feishu sync failed:', latest.syncError);
  }
}

function runMockSync(id) {
  const latest = submissions.get(id);
  if (!latest) return;

  const finalStatus = resolveMockFinalStatus();
  latest.syncStatus = finalStatus;
  latest.syncError = finalStatus === 'FAILED' ? 'mock sync failed' : null;
  latest.updatedAt = new Date().toISOString();
}

export function createSubmission(record) {
  const id = crypto.randomUUID();
  const statusToken = crypto.randomBytes(20).toString('base64url');
  const now = new Date().toISOString();

  const submission = {
    id,
    statusToken,
    ...record,
    syncStatus: 'PENDING',
    syncError: null,
    feishuRecordId: null,
    createdAt: now,
    updatedAt: now
  };

  submissions.set(id, submission);

  setTimeout(() => {
    if (syncProvider === 'feishu') {
      void runFeishuSync(id);
      return;
    }

    runMockSync(id);
  }, syncDelayMs);

  return submission;
}

export function getSubmission(id, statusToken = '') {
  const submission = submissions.get(id) || null;
  if (!submission) return null;
  if (statusToken && submission.statusToken !== statusToken) {
    return null;
  }
  return submission;
}

export function clearSubmissions() {
  submissions.clear();
}
