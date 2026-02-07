const phoneRegex = /^1[3-9]\d{9}$/;
const idRegex = /^\d{17}[\dXx]$/;
const otherIdRegex = /^[A-Za-z0-9-]{6,20}$/;

export function isValidChineseId(id) {
  if (!idRegex.test(id)) return false;

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const chars = id.toUpperCase().split('');
  const sum = weights.reduce((acc, weight, idx) => acc + weight * Number(chars[idx]), 0);
  const check = codes[sum % 11];

  return check === chars[17];
}

function trimText(value) {
  return String(value || '').replace(/[<>]/g, '').trim();
}

function normalizeRole(value) {
  const role = trimText(value).toLowerCase();
  return role === 'industry' ? 'industry' : 'consumer';
}

function normalizeIdType(value) {
  const idType = trimText(value).toLowerCase();
  if (idType === 'passport') return 'passport';
  if (idType === 'other') return 'other';
  return 'cn_id';
}

function isValidIdByType(idType, idNumber) {
  if (idType === 'cn_id') return isValidChineseId(idNumber);
  return otherIdRegex.test(idNumber);
}

export function validateSubmission(input) {
  const role = normalizeRole(input.role);
  const phone = trimText(input.phone);
  const name = trimText(input.name);
  const idType = normalizeIdType(input.idType);
  const idNumber = trimText(input.idNumber);

  const title = trimText(input.title || (role === 'consumer' ? '消费者' : ''));
  const company = trimText(input.company || (role === 'consumer' ? '个人消费者' : ''));
  const businessType = trimText(input.businessType);
  const department = trimText(input.department);
  const proofFilesRaw = Array.isArray(input.proofFiles)
    ? input.proofFiles
    : Array.isArray(input.proofFileNames)
      ? input.proofFileNames
      : [];
  const proofFiles = proofFilesRaw.map((item) => trimText(item)).filter(Boolean);

  if (!phoneRegex.test(phone)) {
    return { ok: false, error: '手机号格式不正确' };
  }

  if (name.length < 2 || name.length > 32) {
    return { ok: false, error: '姓名长度不合法' };
  }

  if (!isValidIdByType(idType, idNumber)) {
    return { ok: false, error: idType === 'cn_id' ? '身份证号校验失败' : '证件号格式不正确' };
  }

  if (role === 'industry') {
    if (title.length < 2 || title.length > 32) {
      return { ok: false, error: '职位长度不合法' };
    }

    if (company.length < 2 || company.length > 64) {
      return { ok: false, error: '公司长度不合法' };
    }

    if (!businessType) {
      return { ok: false, error: '业务类型不能为空' };
    }

    if (!department) {
      return { ok: false, error: '部门不能为空' };
    }

    if (!proofFiles.length) {
      return { ok: false, error: '请上传专业观众证明材料' };
    }
  }

  return {
    ok: true,
    data: {
      role,
      phone,
      name,
      idType,
      idNumber,
      title,
      company,
      businessType: role === 'industry' ? businessType : null,
      department: role === 'industry' ? department : null,
      proofFiles: role === 'industry' ? proofFiles : []
    }
  };
}
