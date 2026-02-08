# FBIF Form 隔离环境压力与恶意场景安全压测报告（2026-02-08）

本报告在**完全隔离的本地环境**执行：仅访问 `localhost`，不触达生产服务、不触达飞书 API（测试用例刻意避开会发起飞书请求的路径）。

## 1. 范围与目标

目标：在极端负载与恶意输入下验证以下能力是否有效，并给出可操作的修复建议。

- 大文件上传攻击防护（文件大小限制、超时/中断、内存占用风险）
- 资源耗尽攻击防护（高频请求、并发连接、连接耗尽、限流/熔断）
- 异常数据攻击防护（畸形 JSON、超大 JSON、特殊字符、非法字段）
- 服务可用性保障（压测期间核心探活接口可用、时延与错误率可控）

覆盖接口：
- `GET /health`
- `GET /health/ready`
- `GET /api/csrf`
- `POST /api/submissions`
- `POST /api/uploads/feishu`（仅测试“超限文件”拒绝路径，避免触达飞书）

## 2. 隔离环境与工具

环境（本机）：
- Node: `v25.5.0`
- PostgreSQL: `16.11`（临时实例，端口 `55432`，DB：`fbif_form_stress`）
- Redis: `8.4.0`（临时实例，端口 `56379`，策略：`noeviction`）
- API: `http://127.0.0.1:8090`（不启动 worker，避免任何飞书同步外呼）

工具：
- `ab`（ApacheBench）用于高频/并发 HTTP 压测
- `curl`、`xargs -P` 用于上传/畸形请求
- `ps` 采样 API RSS/CPU
- `psql` 统计写入数据量

重要隔离说明：
- `POST /api/uploads/feishu` 的“正常小文件上传”会调用飞书 Drive 上传，不属于隔离测试范围；因此仅测试“超出大小限制”被服务端拒绝的路径（在进入飞书 SDK 前即失败）。

## 3. 测试用例与结果

### 3.1 大文件上传攻击防护（100GB 级）

#### 用例 A1：单次超限文件上传（20MB > 10MB）
- 目的：验证服务端文件大小限制是否生效、是否能快速拒绝、是否避免内存暴涨。
- 请求：`POST /api/uploads/feishu`（multipart，`file`=20MB）
- 预期：返回 `413 Payload Too Large`；不触达飞书；请求耗时短；内存不出现线性增长。
- 结果：**通过**
  - HTTP：`413`
  - 观测：请求在毫秒级返回；不产生 500；日志无“Unhandled error”。

#### 用例 A2：并发超限文件上传（50 次，总并发 10）
- 目的：模拟多并发大文件上传，观察稳定性与内存占用风险。
- 配置：为避免限流干扰验证文件大小限制，本用例在 `RATE_LIMIT_BACKEND=off` 下执行（最坏情况）。
- 结果：**通过（但存在内存 DoS 风险）**
  - 50/50 返回 `413`
  - API RSS 采样约 `~356MB`（并发期间稳定）
  - 风险：当前采用 `multer.memoryStorage()`，每个并发请求可能占用至多 `fileSize` 上限（10MB）的内存；当并发足够大时，仍可能被内存压垮。

#### 用例 A3：100GB 上传攻击模拟说明
- 本次未实际传输 100GB 文件（成本过高且无必要）。
- 由于服务端在 ingress 处设置 `multer` 文件大小上限（10MB），任何 **>10MB** 的上传都会在读到阈值后被拒绝，因此 100GB 与 20MB 在服务端的拦截行为一致（均应在接收约 10MB 后终止）。

结论：
- 文件大小限制有效（10MB 上限可阻断超大文件）。
- 仍建议补齐“上传超时/慢速上传”防护（见第 5 节）。

### 3.2 资源耗尽攻击防护（高频/并发）

#### 用例 B1：高频请求打爆 CSRF（`GET /api/csrf`）
- 目的：验证是否会成为无鉴权 DoS 放大点。
- 结果：**通过**
  - `ab -n 5000 -c 200 /api/csrf`
  - `Non-2xx responses: 4881`（约 120 次 200，其余 429）
  - 说明：`/api/csrf` 已纳入与业务接口相同的 `apiLimiter`，攻击流量被快速 429。
  - 压测期间 `GET /health` 采样持续返回 200，典型耗时约 `~0.5ms`。

#### 用例 B2：高频提交表单（`POST /api/submissions`）
- 目的：验证 burst 限流 + 总量限流对 DB/Redis 保护是否有效。
- 结果：**通过**
  - `ab -n 5000 -c 200 /api/submissions`
  - `Non-2xx responses: 4980`（约 20 次被放行，其余 429）
  - 解释：`burstLimiter`（20/s）在 1s 级别窗口内优先生效，挡住大部分写入压力。
  - 压测期间 `GET /health` / `GET /health/ready` 采样均为 200，耗时约 `~0.6ms~1.3ms`。

#### 用例 B3：限流关闭下的“真实写入吞吐”基线（最坏情况）
- 目的：评估在“分布式攻击绕过单 IP 限流”的最坏情况下，API + DB + Redis 的吞吐与时延。
- 配置：`RATE_LIMIT_BACKEND=off`（最坏情况）。
- 结果（2000 次，100 并发）：**可接受**
  - `Requests per second: 688.99 [#/sec]`
  - `p95 ≈ 305ms`，`max ≈ 382ms`
  - DB 写入量（本次测试累计）：`Submission` 行数约 `2040`

结论：
- 限流开启时可快速 429，保护 DB/Redis。
- 在最坏情况下（绕过单 IP 限流），吞吐约 `~689 req/s`（本机），仍需结合线上机器规格再复测。

### 3.3 异常数据攻击防护

#### 用例 C1：畸形 JSON（缺括号）
- 结果：**通过**
  - 返回 `400 Bad Request`，body：`{ "error": "Invalid JSON" }`

#### 用例 C2：超大 JSON（>16kb）
- 结果：**通过**
  - 返回 `413 Payload Too Large`，body：`{ "error": "Payload Too Large" }`

说明：
- 之前上述两类请求会被统一处理为 `500`，导致攻击者可以用畸形包制造大量 500 与错误日志；现已修复为 4xx（见第 4 节）。

### 3.4 可用性保障（压测期间探活）

压测期间持续采样：
- `GET /health`：持续 200，典型耗时 `~0.5ms~1.2ms`
- `GET /health/ready`：持续 200（包含 DB/Redis check），典型耗时 `~1ms`（无持续压测该接口）

补充（单接口高并发压测结果）：
- `ab -n 5000 -c 200 /health`：约 `3184 req/s`，p95 `~81ms`，max `~1093ms`
- `ab -n 5000 -c 200 /health/ready`：约 `1764 req/s`，p95 `~149ms`，max `~2099ms`

## 4. 已发现问题与已实施修复

### [P0] 大文件/异常包导致 500（应为 4xx）
问题：
- `express.json` 的解析错误/超限错误、`multer` 的文件超限错误，之前都会落到通用 `500`。
影响：
- 攻击者可通过畸形包制造大量 500、放大告警与日志成本；同时不利于客户端正确重试策略。

修复（已完成）：
- 为 body-parser / multer 的常见错误类型添加 400/413 映射，避免落到 500。
- 代码：`apps/api/src/middleware/errors.ts`
- 单测：`apps/api/test/errors.test.ts`

### [P0] `/api/csrf` 未限流（可被用作 DoS 放大器）
问题：
- `/api/csrf` 之前不走 `apiLimiter`，可以被高频请求打爆。
修复（已完成）：
- 将 `/api/csrf` 纳入 `apiLimiter`。
- 代码：`apps/api/src/server.ts`

## 5. 仍存在的风险点与修复建议（按优先级）

### [P0] 慢速上传 / 慢速请求（Slowloris）缺乏应用层超时
现状：
- API 未显式设置 `server.requestTimeout` / `server.headersTimeout` 等超时策略。
风险：
- 攻击者可以用极慢速请求占用连接与 worker 资源（尤其是上传接口）。
建议：
- 在 Node server 层设置：
  - `headersTimeout`（例如 10s）
  - `requestTimeout`（例如 30s~60s）
  - `keepAliveTimeout`（结合网关策略）
- 在反向代理（Nginx/ALB）设置：
  - `client_body_timeout` / `client_header_timeout`
  - `client_max_body_size`（建议与应用层一致或更严格）

### [P1] 上传使用 `multer.memoryStorage()`，并发下存在内存 DoS 风险
现状：
- 上传在内存中聚合文件（上限 10MB），并发大时 RSS 可被撑高。
建议：
- 改为磁盘临时文件（`diskStorage`）或流式转发到对象存储/飞书（避免聚合到内存）。
- 增加“上传并发限制”（按 IP、按用户、按全局 semaphore）。

### [P1] 健康检查接口对公网暴露风险
现状：
- `/health/ready` 会访问 DB/Redis，若对公网开放可被滥用造成依赖压力。
建议：
- 仅在内网/网关白名单放通，或增加限流/鉴权（最简单是只暴露 `/health/live` 给公网）。

### [P2] 可观测性与压测自动化不足
建议：
- 增加 metrics（Prometheus/OpenTelemetry），至少输出：
  - HTTP 请求量、状态码分布、p95/p99
  - Node RSS/heap、event loop lag
  - DB 连接数/慢查询
  - Redis 队列积压（bullmq）
- 把压测脚本纳入 CI 或 staging runbook（k6 或 autocannon）。

## 6. 复现与执行说明（开发者）

由于本机无 Docker，本次使用 Homebrew 的 Postgres/Redis，并以“临时目录 + 自定义端口”方式启动，避免干扰系统常驻服务。

建议按脚本化方式固化到 `scripts/`（未在本报告中强制落盘）。

