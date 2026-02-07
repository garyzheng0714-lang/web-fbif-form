import 'dotenv/config';

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

const appId = process.env.FEISHU_APP_ID || '';
const appSecret = process.env.FEISHU_APP_SECRET || '';
const appToken = process.env.FEISHU_APP_TOKEN || '';
const tableId = process.env.FEISHU_TABLE_ID || '';

const fieldMap = {
  name: process.env.FEISHU_FIELD_NAME || '姓名（问卷题）',
  phone: process.env.FEISHU_FIELD_PHONE || '手机号（问卷题）',
  title: process.env.FEISHU_FIELD_TITLE || '职位（问卷题）',
  company: process.env.FEISHU_FIELD_COMPANY || '公司（问卷题）',
  idNumber: process.env.FEISHU_FIELD_ID || '证件号码（问卷题）',
  role: process.env.FEISHU_FIELD_ROLE || '观展身份',
  idType: process.env.FEISHU_FIELD_ID_TYPE || '证件类型（问卷题）',
  businessType: process.env.FEISHU_FIELD_BUSINESS_TYPE || '贵司的业务类型',
  department: process.env.FEISHU_FIELD_DEPARTMENT || '您所处的部门（问卷题）',
  submittedAt: process.env.FEISHU_FIELD_SUBMITTED_AT || '',
  syncStatus: process.env.FEISHU_FIELD_SYNC_STATUS || ''
};

let tokenCache = {
  value: '',
  expiresAt: 0
};

function hasFeishuConfig() {
  return Boolean(appId && appSecret && appToken && tableId);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(fn, retries = 3) {
  let lastError;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === retries) break;
      await sleep(300 * Math.pow(2, i));
    }
  }
  throw lastError;
}

async function getTenantAccessToken() {
  const now = Date.now();
  if (tokenCache.value && tokenCache.expiresAt > now + 60 * 1000) {
    return tokenCache.value;
  }

  const response = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });

  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(`get tenant token failed: ${data.msg || response.statusText}`);
  }

  const expiresInSec = data.expire || data.expires_in || 3600;
  tokenCache = {
    value: data.tenant_access_token,
    expiresAt: now + expiresInSec * 1000
  };

  return tokenCache.value;
}

function mapFields(submission) {
  const roleLabel = submission.role === 'industry'
    ? '我是食品行业相关从业者'
    : '我是消费者';

  const idTypeLabel = submission.idType === 'cn_id'
    ? '中国居民身份证'
    : submission.idType === 'passport'
      ? '护照'
      : '';

  const businessTypeLabelMap = {
    '食品相关品牌方': '食品饮料品牌方（包括传统的食品加工企业、新兴品牌、以及各类食品、饮品、调味品等终端产品生产商）',
    '食品制造商': '食品饮料品牌方（包括传统的食品加工企业、新兴品牌、以及各类食品、饮品、调味品等终端产品生产商）',
    '供应链服务商': '包装与设备公司（食品包装解决方案及生产设备的企业）',
    '咨询/营销/服务机构': '设计营销与咨询策划服务提供商（包括设计机构、品牌战略咨询、市场调研、数字营销等服务提供商）',
    '线下零售': '线下零售（包含大型连锁超市、精品超市、便利店、折扣店、仓储会员店、百货店、购物中心、品牌专卖店、集合店、无人便利店/超市、其他线下零售等）',
    '线上零售': '线上零售（包括综合电商、跨境电商、社交电商、社区团购、垂类电商、直播电商、精品电商、其他线上零售）',
    '新兴渠道': '新零售（前置仓到家、店仓到家、O2O、自动售货机等）',
    '进出口贸易': '进出口贸易（包含进出口/贸易、批发商、大宗团购、酒商、经销商/代理商）',
    '餐饮及酒店': '餐饮及酒店（包含餐厅、快餐连锁、咖啡吧/水吧、连锁茶饮、烘焙店、酒店等）',
    '其他': '其他（包含政府机构、协会、高校、媒体等等）'
  };

  const departmentLabelMap = {
    '高管/战略': '高管、战略部门',
    '研发/生产/品控': '研发、产品、包装',
    '采购/物流/仓储': '采购、供应链、生产',
    '采购/市场/生产': '采购、供应链、生产',
    '市场/销售/电商': '渠道、销售、电商',
    '行政': '其他（如财务、行政等）',
    '其他': '其他（如财务、行政等）'
  };

  const fields = {
    [fieldMap.name]: submission.name,
    [fieldMap.phone]: submission.phone,
    [fieldMap.title]: submission.title,
    [fieldMap.company]: submission.company,
    [fieldMap.idNumber]: submission.idNumber
  };

  if (fieldMap.role) {
    fields[fieldMap.role] = roleLabel;
  }

  if (fieldMap.idType && idTypeLabel) {
    fields[fieldMap.idType] = idTypeLabel;
  }

  if (fieldMap.businessType && submission.businessType) {
    fields[fieldMap.businessType] = businessTypeLabelMap[submission.businessType] || submission.businessType;
  }

  if (fieldMap.department && submission.department) {
    fields[fieldMap.department] = departmentLabelMap[submission.department] || submission.department;
  }

  if (fieldMap.submittedAt) {
    fields[fieldMap.submittedAt] = submission.createdAt;
  }

  if (fieldMap.syncStatus) {
    fields[fieldMap.syncStatus] = '已同步';
  }

  return fields;
}

export async function createBitableRecord(submission) {
  if (!hasFeishuConfig()) {
    throw new Error('feishu config missing');
  }

  return retry(async () => {
    const token = await getTenantAccessToken();
    const response = await fetch(
      `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: mapFields(submission) })
      }
    );

    const data = await response.json();
    if (!response.ok || data.code !== 0) {
      throw new Error(`create record failed: ${data.msg || response.statusText}`);
    }

    const recordId = data?.data?.record?.record_id;
    if (!recordId) {
      throw new Error('create record failed: missing record_id');
    }

    return recordId;
  }, 3);
}

export function isFeishuEnabled() {
  return hasFeishuConfig();
}
