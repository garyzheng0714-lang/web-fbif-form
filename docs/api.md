# API 接口文档

基础路径：`/api`

## 获取 CSRF Token
`GET /api/csrf`

响应：
```json
{ "csrfToken": "..." }
```

## 提交表单（V2）
`POST /api/submissions`

Headers:
- `Content-Type: application/json`
- `X-CSRF-Token: <token>`
- `Idempotency-Key: <8-128位字母数字下划线短横线>`（可选，建议客户端重试时复用）

Body:
```json
{
  "role": "industry",
  "phone": "13800000000",
  "name": "张三",
  "idType": "passport",
  "idNumber": "A1234567",
  "title": "运营负责人",
  "company": "飞书科技有限公司",
  "businessType": "食品相关品牌方",
  "department": "市场/销售/电商",
  "proofFiles": ["proof-1.jpg", "proof-2.pdf"]
}
```

备注：
- `role`: `industry | consumer`
- `idType`: `cn_id | passport | other`
- `consumer` 角色可省略 `businessType/department/proofFiles`。
- 为兼容旧客户端，服务端仍可解析历史 V1 payload（仅基础 5 字段）。

响应：
```json
{
  "id": "uuid",
  "syncStatus": "PENDING",
  "statusToken": "status-token",
  "replayed": false
}
```

## 查询同步状态（带 statusToken）
`GET /api/submissions/:id/status?statusToken=<token>`

备注：
- 当 `ALLOW_LEGACY_STATUS_QUERY=false` 时，必须携带 `statusToken`。

响应：
```json
{
  "id": "uuid",
  "syncStatus": "PENDING|SUCCESS|FAILED",
  "syncError": "...",
  "feishuRecordId": "...",
  "createdAt": "2026-02-06T08:00:00.000Z",
  "pollAfterMs": 1500
}
```

## 获取上传预签名（可选能力）
`POST /api/uploads/presign`

Headers:
- `Content-Type: application/json`
- `X-CSRF-Token: <token>`

Body:
```json
{
  "filename": "proof.jpg",
  "contentType": "image/jpeg",
  "size": 123456
}
```

响应（已配置 `UPLOAD_PRESIGN_BASE_URL` 时）：
```json
{
  "key": "proof/1700000000000-...-proof.jpg",
  "uploadUrl": "https://example-oss/prefix/proof/170...jpg",
  "headers": {
    "Content-Type": "image/jpeg"
  },
  "expiresInSeconds": 300
}
```

未配置上传服务时返回 `503`，前端可回退提交文件名。

## 上传文件到飞书（用于多维表格附件字段）
`POST /api/uploads/feishu`

说明：
- 该接口会把文件上传到飞书云空间（挂在当前多维表格 Base 下），并返回 `fileToken`。
- 当多维表格字段类型为「附件」时，写入 record 需要使用 `[{ file_token }]`，因此 `POST /api/submissions` 的 `proofFiles` 建议传 `fileToken[]`。

Headers:
- `X-CSRF-Token: <token>`

Body（multipart/form-data）：
- `file`: 文件（字段名必须是 `file`）

响应：
```json
{
  "fileToken": "boxcn...",
  "name": "proof.png",
  "size": 1234,
  "contentType": "image/png"
}
```
