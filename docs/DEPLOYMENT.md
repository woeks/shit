# 部署说明

## 1. 代码准备

建议仓库只包含以下内容：

- `recruitment-frontend/`
- `recruitment-backend/`
- `README.md`
- `docs/`

不建议提交：

- `node_modules/`
- `dist/`
- `.env`
- `uploads/` 中的真实文件
- 本地测试脚本
- 临时压缩包

## 2. 后端部署

```bash
cd recruitment-backend
npm install --omit=dev
cp .env.example .env
```

推荐环境变量：

```env
DB_HOST=your-db-host
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name
DB_DIALECT=postgres
PORT=3000
JWT_SECRET=replace-with-a-strong-random-secret
ENABLE_STARTUP_BACKFILL=false
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=your-strong-password
BOOTSTRAP_ADMIN_NAME=系统管理员
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
```

启动：

```bash
npm run start
```

## 3. 前端部署

```bash
cd recruitment-frontend
npm install
npm run build
```

将 `recruitment-frontend/dist/` 部署到静态站点服务或 Nginx。

## 4. Nginx 示例

```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /var/www/recruitment-frontend/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /uploads/ {
    proxy_pass http://127.0.0.1:3000;
  }
}
```

## 5. GitHub 发布建议

标准流程建议：

1. 初始化并整理仓库内容
2. 编写 `README.md` 与部署文档
3. 本地构建验证
4. 推送到 GitHub 主分支
5. 如需版本发布，再创建 GitHub Release

## 6. 上线前检查

- 数据库连接信息已替换为生产配置
- 仓库内未保留默认测试账号和测试密码
- 前端已使用生产构建产物
- 域名、反向代理和上传目录权限已配置完成
