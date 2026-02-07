import test from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import { parseSubmissionPayload } from '../src/validation/submission.js';

test('parseSubmissionPayload supports industry v2 payload', () => {
  const payload = parseSubmissionPayload({
    role: 'industry',
    phone: '13800138000',
    name: '张三',
    title: '运营负责人',
    company: '飞书科技',
    idType: 'passport',
    idNumber: 'A1234567',
    businessType: '食品相关品牌方',
    department: '市场/销售/电商',
    proofFileNames: ['badge.jpg']
  });

  assert.equal(payload.role, 'industry');
  assert.equal(payload.idType, 'passport');
  assert.deepEqual(payload.proofFiles, ['badge.jpg']);
});

test('parseSubmissionPayload supports legacy v1 payload', () => {
  const payload = parseSubmissionPayload({
    phone: '13800138000',
    name: '李四',
    title: '经理',
    company: '测试公司',
    idNumber: '11010119900307803X'
  });

  assert.equal(payload.role, 'consumer');
  assert.equal(payload.idType, 'cn_id');
  assert.equal(payload.title, '经理');
});

test('parseSubmissionPayload rejects invalid passport value', () => {
  assert.throws(() => {
    parseSubmissionPayload({
      role: 'industry',
      phone: '13800138000',
      name: '王五',
      title: '销售',
      company: '测试公司',
      idType: 'passport',
      idNumber: '12',
      businessType: '食品相关品牌方',
      department: '市场/销售/电商',
      proofFiles: ['proof.pdf']
    });
  }, ZodError);
});

test('parseSubmissionPayload supports consumer v2 with other id type', () => {
  const payload = parseSubmissionPayload({
    role: 'consumer',
    phone: '13800138000',
    name: '赵六',
    idType: 'other',
    idNumber: 'ABCD-123456'
  });

  assert.equal(payload.role, 'consumer');
  assert.equal(payload.idType, 'other');
  assert.equal(payload.title, '消费者');
  assert.equal(payload.company, '个人消费者');
});

test('parseSubmissionPayload rejects industry payload without proof files', () => {
  assert.throws(() => {
    parseSubmissionPayload({
      role: 'industry',
      phone: '13800138000',
      name: '王五',
      title: '销售',
      company: '测试公司',
      idType: 'passport',
      idNumber: 'A1234567',
      businessType: '食品相关品牌方',
      department: '市场/销售/电商',
      proofFiles: []
    });
  }, ZodError);
});
