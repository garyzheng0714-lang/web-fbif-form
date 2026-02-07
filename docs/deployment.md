# 部署与配置说明

## 生产建议架构
- CDN：静态前端（`apps/web` 构建产物）接入 CDN
- 负载均衡：Nginx/ALB 将 API 请求分发到多实例
- API 多实例：`apps/api` + `pm2` 或容器副本
- Worker：独立进程运行 `apps/api` 的队列消费逻辑
- Redis：限流与异步队列
- PostgreSQL：主库 + 只读副本（按需）

## 运行进程
- `fbif-api`: `node dist/index.js`
- `fbif-api-worker`: `node dist/worker.js`
- `fbif-web`: `pm2 serve apps/web/dist 3001 --spa`

## 环境变量（API）
- `DATABASE_URL` PostgreSQL 连接串
- `REDIS_URL` Redis 连接串
- `DATA_KEY` 32 字节 base64 密钥
- `DATA_HASH_SALT` 哈希盐
- `FEISHU_APP_ID` / `FEISHU_APP_SECRET`
- `FEISHU_APP_TOKEN` 多维表格 app token（baseid）
- `FEISHU_TABLE_ID` 表格 table id
- `RATE_LIMIT_BACKEND` `auto|redis|memory|off`
- `REDIS_REQUIRED` `true|false`
- `ALLOW_LEGACY_STATUS_QUERY` `true|false`
- `WORKER_CONCURRENCY` Worker 并发数

## 健康检查
- `GET /health/live`: 进程存活
- `GET /health/ready`: 依赖就绪（DB/Redis）

## Nginx 示例
```nginx
server {
  listen 443 ssl;
  server_name form.example.com;

  ssl_certificate /etc/ssl/certs/fullchain.pem;
  ssl_certificate_key /etc/ssl/private/privkey.pem;

  location / {
    root /var/www/web;
    try_files $uri /index.html;
  }

  location /api/ {
    proxy_pass http://api_upstream;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

upstream api_upstream {
  server 10.0.0.2:8080;
  server 10.0.0.3:8080;
}
```

## HTTPS 与安全
- 生产必须开启 HTTPS（TLS 证书）
- 开启 HSTS（由 Nginx/网关配置）
- API 使用 `helmet` + CORS 限制域名

## 异步任务
- 单独运行 worker 进程，不与 API 混跑
- 按环境调节 `WORKER_CONCURRENCY`
- 关注队列积压、失败率、重试次数
