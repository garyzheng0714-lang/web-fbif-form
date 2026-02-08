import * as lark from '@larksuiteoapi/node-sdk';
import { env } from '../config/env.js';
import { retry } from '../utils/retry.js';

const fieldMap = {
  // Defaults match the current Bitable table in /base/K0QibNTo...
  name: process.env.FEISHU_FIELD_NAME || '姓名（问卷题）',
  phone: process.env.FEISHU_FIELD_PHONE || '手机号（问卷题）',
  title: process.env.FEISHU_FIELD_TITLE || '职位（问卷题）',
  company: process.env.FEISHU_FIELD_COMPANY || '公司（问卷题）',
  idNumber: process.env.FEISHU_FIELD_ID || '证件号码（问卷题）',
  role: process.env.FEISHU_FIELD_ROLE || '观展身份',
  idType: process.env.FEISHU_FIELD_ID_TYPE || '证件类型（问卷题）',
  businessType: process.env.FEISHU_FIELD_BUSINESS_TYPE || '贵司的业务类型',
  department: process.env.FEISHU_FIELD_DEPARTMENT || '您所处的部门（问卷题）',
  proof: process.env.FEISHU_FIELD_PROOF || '上传专业观众证明',
  // Optional fields. Leave empty to skip writing these.
  submittedAt: process.env.FEISHU_FIELD_SUBMITTED_AT || '',
  syncStatus: process.env.FEISHU_FIELD_SYNC_STATUS || ''
};

const client = new lark.Client({
  appId: env.FEISHU_APP_ID,
  appSecret: env.FEISHU_APP_SECRET
});

export async function createBitableRecord(fields: Record<string, unknown>): Promise<string> {
  const doRequest = async () => {
    const res = await client.bitable.appTableRecord.create({
      path: {
        app_token: env.FEISHU_APP_TOKEN,
        table_id: env.FEISHU_TABLE_ID
      },
      data: {
        // The SDK has a strict (and evolving) union type for all field value variants.
        // We keep our mapping flexible and validate via integration tests / API behavior.
        fields: fields as any
      }
    });

    if (res.code && res.code !== 0) {
      throw new Error(`Feishu record error: ${res.msg || 'Unknown error'}`);
    }

    const recordId = res.data?.record?.record_id;
    if (!recordId) {
      throw new Error('Feishu record error: missing record id');
    }

    return recordId;
  };

  return retry(doRequest, { retries: 3, baseDelayMs: 500, maxDelayMs: 4000 });
}

export async function uploadBitableAttachment(input: {
  filename: string;
  contentType: string;
  size: number;
  buffer: Buffer;
}): Promise<string> {
  const doRequest = async () => {
    const res = await client.drive.media.uploadAll({
      data: {
        file_name: input.filename,
        parent_type: 'bitable_file',
        parent_node: env.FEISHU_APP_TOKEN,
        size: input.size,
        file: input.buffer
      }
    });

    const fileToken = res?.file_token;
    if (!fileToken) {
      throw new Error('Feishu upload error: missing file token');
    }

    return fileToken;
  };

  return retry(doRequest, { retries: 3, baseDelayMs: 500, maxDelayMs: 4000 });
}

export function mapToBitableFields(input: {
  name: string;
  phone: string;
  title: string;
  company: string;
  idNumber: string;
  roleLabel?: string;
  idTypeLabel?: string;
  businessTypeLabel?: string;
  departmentLabel?: string;
  proofFileTokens?: string[];
  submittedAt: string;
  syncStatus: string;
}): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [fieldMap.name]: input.name,
    [fieldMap.phone]: input.phone,
    [fieldMap.title]: input.title,
    [fieldMap.company]: input.company,
    [fieldMap.idNumber]: input.idNumber,
  };

  if (fieldMap.role && input.roleLabel) {
    fields[fieldMap.role] = input.roleLabel;
  }

  if (fieldMap.idType && input.idTypeLabel) {
    fields[fieldMap.idType] = input.idTypeLabel;
  }

  if (fieldMap.businessType && input.businessTypeLabel) {
    fields[fieldMap.businessType] = input.businessTypeLabel;
  }

  if (fieldMap.department && input.departmentLabel) {
    fields[fieldMap.department] = input.departmentLabel;
  }

  if (fieldMap.proof && input.proofFileTokens?.length) {
    fields[fieldMap.proof] = input.proofFileTokens.map((token) => ({ file_token: token }));
  }

  if (fieldMap.submittedAt) {
    fields[fieldMap.submittedAt] = input.submittedAt;
  }

  if (fieldMap.syncStatus) {
    fields[fieldMap.syncStatus] = input.syncStatus;
  }

  return fields;
}
