import { Worker } from 'bullmq';
import { redis } from './queue/redis.js';
import { prisma } from './utils/db.js';
import { logger } from './utils/logger.js';
import { createBitableRecord, mapToBitableFields } from './services/feishuService.js';
import { decryptSubmissionSensitive, markSubmissionFailed, markSubmissionSuccess } from './services/submissionService.js';
import { env } from './config/env.js';

function isFeishuFileToken(value: string): boolean {
  return /^[A-Za-z0-9]{10,80}$/.test(value);
}

function parseProofFileTokens(raw: unknown): string[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => isFeishuFileToken(item));
  } catch {
    return [];
  }
}

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

function mapBusinessTypeLabel(value: string | null) {
  if (!value) return '';
  const map: Record<string, string> = {
    '食品相关品牌方': '食品饮料品牌方（包括传统的食品加工企业、新兴品牌、以及各类食品、饮品、调味品等终端产品生产商）',
    '食品制造商': '食品饮料品牌方（包括传统的食品加工企业、新兴品牌、以及各类食品、饮品、调味品等终端产品生产商）',
    '供应链服务商': '包装与设备公司（食品包装解决方案及生产设备的企业）',
    '咨询/营销/服务机构': '设计营销与咨询策划服务提供商（包括设计机构、品牌战略咨询、市场调研、数字营销等服务提供商）',
    '线下零售': '线下零售（包含大型连锁超市、精品超市、便利店、折扣店、仓储会员店、百货店、购物中心、品牌专卖店、集合店、无人便利店/超市、其他线下零售等）',
    '线上零售': '线上零售（包括综合电商、跨境电商、社交电商、社区团购、垂类电商、直播电商、精品电商、其他线上零售）',
    '新兴渠道': '新零售（前置仓到家、店仓到家、O2O、自动售货机等）',
    '进出口贸易': '进出口贸易（包含进出口/贸易、批发商、大宗团购、酒商、经销商/代理商）',
    '国内贸易': '国内贸易（包含批发商、大宗团购、酒商、经销商/代理商）',
    '餐饮及酒店': '餐饮及酒店（包含餐厅、快餐连锁、咖啡吧/水吧、连锁茶饮、烘焙店、酒店等）',
    '其他': '其他（包含政府机构、协会、高校、媒体等等）'
  };

  return map[value] || value;
}

function mapDepartmentLabel(value: string | null) {
  if (!value) return '';
  const map: Record<string, string> = {
    '高管/战略': '高管、战略部门',
    '研发/生产/品控': '研发、产品、包装',
    '采购/物流/仓储': '采购、供应链、生产',
    '采购/市场/生产': '采购、供应链、生产',
    '市场/销售/电商': '渠道、销售、电商',
    '行政': '其他（如财务、行政等）',
    '其他': '其他（如财务、行政等）'
  };

  return map[value] || value;
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
    const proofFileTokens = parseProofFileTokens(submission.proofFilesJson);
    const fields = mapToBitableFields({
      name: submission.name,
      phone: sensitive.phone,
      title: submission.title,
      company: submission.company,
      idNumber: sensitive.idNumber,
      roleLabel: mapRoleLabel(submission.role),
      idTypeLabel: mapIdTypeLabel(submission.idType),
      businessTypeLabel: mapBusinessTypeLabel(submission.businessType),
      departmentLabel: mapDepartmentLabel(submission.department),
      proofFileTokens,
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
