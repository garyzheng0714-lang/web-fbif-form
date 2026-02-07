# GitHub Actions 自动部署（阿里云）

工作流：`/Library/vibecoding_home/fbif_form/.github/workflows/deploy-aliyun.yml`

触发条件：
- 推送到 `main`
- 手动触发 `workflow_dispatch`

## 一次性配置（GitHub Secrets）
在仓库 `Settings -> Secrets and variables -> Actions` 新增：

必填：
- `ALIYUN_SSH_KEY` 或 `ALIYUN_SSH_KEY_B64`（二选一）
- `DATABASE_URL`
- `REDIS_URL`
- `DATA_KEY`
- `DATA_HASH_SALT`
- `FEISHU_APP_SECRET`
- `FEISHU_APP_TOKEN`

建议配置：
- `ALIYUN_HOST`（默认 `112.124.103.65`）
- `ALIYUN_USER`（默认 `root`）
- `APP_DIR`（默认 `/opt/web-fbif-form`）
- `WEB_ORIGIN`（默认 `http://112.124.103.65:3001`）
- `VITE_API_URL`（默认 `http://112.124.103.65:8080`）
- `FEISHU_APP_ID`
- `FEISHU_TABLE_ID`

## 自动部署流程
每次推送 `main` 后，Action 会自动执行：

1. 运行测试：
   - `apps/mock-api` 测试
   - `apps/api` 测试
   - `apps/web` 测试
2. 构建：
   - `apps/api`（含 Prisma client generate）
   - `apps/web`
3. 打包并上传服务器
4. 服务器端部署：
   - 安装 `apps/api` 依赖
   - 生成/复用 `apps/api/.env`
   - 执行 `prisma migrate deploy`
   - 启动 PM2 进程：
     - `fbif-api`
     - `fbif-api-worker`
     - `fbif-web`
5. 健康检查：
   - `http://127.0.0.1:8080/health/live`
   - `http://127.0.0.1:8080/health/ready`
   - `http://127.0.0.1:3001`

## 发布后检查
- 前端：`http://<ALIYUN_HOST>:3001`
- API 健康：`http://<ALIYUN_HOST>:8080/health/live`
- API 就绪：`http://<ALIYUN_HOST>:8080/health/ready`
- Actions 日志：仓库 `Actions -> Deploy To Aliyun`
