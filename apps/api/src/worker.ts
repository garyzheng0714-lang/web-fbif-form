import { Worker } from 'bullmq';
import { redis } from './queue/redis.js';
import { prisma } from './utils/db.js';
import { logger } from './utils/logger.js';
import { createBitableRecord, mapToBitableFields } from './services/feishuService.js';
import { decryptSubmissionSensitive, markSubmissionFailed, markSubmissionSuccess } from './services/submissionService.js';
import { env } from './config/env.js';

function mapRoleLabel(role: string) {
  if (role === 'INDUSTRY') return '我是食品行业相关从业者';
  if (role === 'CONSUMER') return '我是消费者';
  return '';
}

function mapIdTypeLabel(idType: string) {
  if (idType === 'CN_ID') return '中国居民身份证';
  if (idType === 'PASSPORT') return '护照';
  return '';
}

const worker = new Worker(
  'feishu-sync',
  async (job) => {
    const submission = await prisma.submission.findUnique({
      where: { id: job.data.submissionId }
    });

    if (!submission) {
      return;
    }

    const sensitive = decryptSubmissionSensitive(submission);
    const fields = mapToBitableFields({
      name: submission.name,
      phone: sensitive.phone,
      title: submission.title,
      company: submission.company,
      idNumber: sensitive.idNumber,
      roleLabel: mapRoleLabel(submission.role),
      idTypeLabel: mapIdTypeLabel(submission.idType),
      submittedAt: submission.createdAt.toISOString(),
      syncStatus: '已同步'
    });

    const recordId = await createBitableRecord(fields);
    await markSubmissionSuccess(submission.id, recordId);
  },
  {
    connection: redis,
    concurrency: env.WORKER_CONCURRENCY
  }
);

worker.on('failed', async (job, err) => {
  if (!job) return;
  logger.error({ err, jobId: job.id }, 'Feishu sync failed');
  await markSubmissionFailed(job.data.submissionId, err.message || 'Unknown error');
});

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Feishu sync completed');
});
