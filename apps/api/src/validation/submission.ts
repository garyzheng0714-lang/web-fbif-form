import { z } from 'zod';

const phoneRegex = /^1[3-9]\d{9}$/;
const idRegex = /^\d{17}[\dXx]$/;
const otherIdRegex = /^[A-Za-z0-9-]{6,20}$/;

const roleEnum = z.enum(['industry', 'consumer']);
const idTypeEnum = z.enum(['cn_id', 'passport', 'other']);

export function isValidChineseId(id: string): boolean {
  if (!idRegex.test(id)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const chars = id.toUpperCase().split('');
  const sum = weights.reduce((acc, weight, idx) => acc + weight * Number(chars[idx]), 0);
  const check = codes[sum % 11];
  return check === chars[17];
}

function validateIdNumber(idType: z.infer<typeof idTypeEnum>, idNumber: string): boolean {
  const normalized = idNumber.trim();
  if (idType === 'cn_id') return isValidChineseId(normalized);
  return otherIdRegex.test(normalized);
}

const legacySubmissionSchema = z.object({
  phone: z.string().regex(phoneRegex, '手机号格式不正确'),
  name: z.string().min(2, '姓名至少 2 个字符').max(32),
  title: z.string().min(2, '职位至少 2 个字符').max(32),
  company: z.string().min(2, '公司至少 2 个字符').max(64),
  idNumber: z.string().regex(idRegex, '身份证号格式不正确').refine(isValidChineseId, '身份证号校验失败')
});

const v2BaseSchema = z.object({
  role: roleEnum,
  phone: z.string().regex(phoneRegex, '手机号格式不正确'),
  name: z.string().min(2, '姓名至少 2 个字符').max(32),
  idType: idTypeEnum,
  idNumber: z.string().min(6).max(32),
  title: z.string().min(2, '职位至少 2 个字符').max(32).optional(),
  company: z.string().min(2, '公司至少 2 个字符').max(64).optional(),
  businessType: z.string().min(1, '请选择业务类型').max(64).optional(),
  department: z.string().min(1, '请选择所在部门').max(64).optional(),
  proofFiles: z.array(z.string().min(1).max(256)).max(10).optional()
}).superRefine((value, ctx) => {
  if (!validateIdNumber(value.idType, value.idNumber)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['idNumber'],
      message: value.idType === 'cn_id' ? '身份证号校验失败' : '证件号格式不正确（6-20位字母/数字/短横线）'
    });
  }

  if (value.role === 'industry') {
    if (!value.title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title'],
        message: '职位至少 2 个字符'
      });
    }
    if (!value.company) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['company'],
        message: '公司至少 2 个字符'
      });
    }
    if (!value.businessType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['businessType'],
        message: '请选择业务类型'
      });
    }
    if (!value.department) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['department'],
        message: '请选择所在部门'
      });
    }
    if (!value.proofFiles || value.proofFiles.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proofFiles'],
        message: '请上传专业观众证明材料'
      });
    }
  }
});

export type SubmissionRole = z.infer<typeof roleEnum>;
export type SubmissionIdType = z.infer<typeof idTypeEnum>;
export type SubmissionInput = {
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
};

export function sanitizeText(value: string): string {
  return value.replace(/[<>]/g, '').trim();
}

function toNormalizedInput(value: z.infer<typeof v2BaseSchema>): SubmissionInput {
  const role = value.role;
  return {
    role,
    phone: value.phone.trim(),
    name: sanitizeText(value.name),
    title: sanitizeText(value.title || (role === 'consumer' ? '消费者' : '')),
    company: sanitizeText(value.company || (role === 'consumer' ? '个人消费者' : '')),
    idType: value.idType,
    idNumber: value.idNumber.trim(),
    businessType: role === 'industry' ? sanitizeText(String(value.businessType || '')) : null,
    department: role === 'industry' ? sanitizeText(String(value.department || '')) : null,
    proofFiles: role === 'industry' ? (value.proofFiles || []).map((item) => sanitizeText(item)) : []
  };
}

export function parseSubmissionPayload(payload: unknown): SubmissionInput {
  const obj = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {};
  const hasV2Marker = Boolean(
    obj.role ||
    obj.idType ||
    obj.businessType ||
    obj.department ||
    obj.proofFiles ||
    obj.proofFileNames
  );

  if (!hasV2Marker) {
    const legacy = legacySubmissionSchema.parse(payload);
    return {
      role: 'consumer',
      phone: legacy.phone.trim(),
      name: sanitizeText(legacy.name),
      title: sanitizeText(legacy.title),
      company: sanitizeText(legacy.company),
      idType: 'cn_id',
      idNumber: legacy.idNumber.trim(),
      businessType: null,
      department: null,
      proofFiles: []
    };
  }

  const normalizedPayload = {
    ...obj,
    proofFiles: Array.isArray(obj.proofFiles)
      ? obj.proofFiles
      : Array.isArray(obj.proofFileNames)
        ? obj.proofFileNames
        : []
  };
  return toNormalizedInput(v2BaseSchema.parse(normalizedPayload));
}
