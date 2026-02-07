import { prisma } from '../utils/db.js';
import { encryptField, hashField, decryptField } from '../utils/crypto.js';
import { sanitizeText, type SubmissionIdType, type SubmissionRole } from '../validation/submission.js';
import type { Submission } from '@prisma/client';

export async function createSubmission(input: {
  role: SubmissionRole;
  phone: string;
  name: string;
  title: string;
  company: string;
  idType: SubmissionIdType;
  idNumber: string;
  businessType: string | null;
  department: string | null;
  proofFiles: string[];
  statusTokenHash: string;
  idempotencyKeyHash?: string;
}, meta: { clientIp?: string; userAgent?: string }) {
  const clean = {
    role: input.role,
    phone: input.phone.trim(),
    name: sanitizeText(input.name),
    title: sanitizeText(input.title),
    company: sanitizeText(input.company),
    idType: input.idType,
    idNumber: input.idNumber.trim(),
    businessType: input.businessType ? sanitizeText(input.businessType) : null,
    department: input.department ? sanitizeText(input.department) : null,
    proofFiles: input.proofFiles.map((item) => sanitizeText(item)).filter(Boolean),
    statusTokenHash: input.statusTokenHash,
    idempotencyKeyHash: input.idempotencyKeyHash
  };

  return prisma.submission.create({
    data: {
      role: clean.role === 'industry' ? 'INDUSTRY' : 'CONSUMER',
      name: clean.name,
      title: clean.title,
      company: clean.company,
      idType: clean.idType === 'cn_id'
        ? 'CN_ID'
        : clean.idType === 'passport'
          ? 'PASSPORT'
          : 'OTHER',
      phoneEnc: encryptField(clean.phone),
      phoneHash: hashField(clean.phone),
      idEnc: encryptField(clean.idNumber),
      idHash: hashField(clean.idNumber),
      businessType: clean.businessType,
      department: clean.department,
      proofFilesJson: clean.proofFiles.length ? JSON.stringify(clean.proofFiles) : null,
      statusTokenHash: clean.statusTokenHash,
      idempotencyKeyHash: clean.idempotencyKeyHash,
      source: 'web',
      clientIp: meta.clientIp,
      userAgent: meta.userAgent
    }
  });
}

export async function findSubmissionByIdempotencyKey(idempotencyKeyHash: string) {
  return prisma.submission.findFirst({
    where: { idempotencyKeyHash },
    select: {
      id: true,
      syncStatus: true
    }
  });
}

export async function markSubmissionSuccess(id: string, recordId: string) {
  return prisma.submission.update({
    where: { id },
    data: {
      syncStatus: 'SUCCESS',
      feishuRecordId: recordId,
      syncError: null
    }
  });
}

export async function markSubmissionFailed(id: string, error: string) {
  return prisma.submission.update({
    where: { id },
    data: {
      syncStatus: 'FAILED',
      syncError: error.slice(0, 2000)
    }
  });
}

export async function getSubmissionStatus(id: string, statusTokenHash?: string) {
  return prisma.submission.findFirst({
    where: {
      id,
      ...(statusTokenHash ? { statusTokenHash } : {})
    },
    select: {
      id: true,
      syncStatus: true,
      syncError: true,
      createdAt: true,
      feishuRecordId: true
    }
  });
}

export function decryptSubmissionSensitive(submission: Submission) {
  return {
    phone: decryptField(submission.phoneEnc),
    idNumber: decryptField(submission.idEnc)
  };
}
