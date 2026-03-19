# 源码部署手册

## 1. 适用场景

本手册适用于通过源码方式部署当前招聘管理系统。

适合以下场景：

- 服务器已经安装 Node.js 和 PostgreSQL
- 需要前后端分离部署
- 需要自行接入 Nginx、PM2、systemd 等运行方式

## 2. 环境要求

- Node.js 20 及以上
- PostgreSQL 14 及以上
- Nginx 或其他 Web 服务器

## 3. 拉取代码

```bash
git clone https://github.com/woeks/shit.git
cd shit
```

## 4. 后端部署

进入后端目录：

```bash
cd recruitment-backend
```

复制环境变量模板：

```bash
cp .env.example .env
```

推荐至少配置以下内容：

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

安装并启动：

```bash
npm install --omit=dev
npm run start
```

## 5. 前端部署

进入前端目录：

```bash
cd ../recruitment-frontend
```

安装并构建：

```bash
npm install
npm run build
```

构建完成后，将 `dist/` 部署到静态资源目录。

## 6. Nginx 示例

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
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 7. 健康检查

部署完成后建议检查：

- 前端首页是否可打开
- `/api/health` 是否正常返回
- 管理员账号是否可以登录
- 上传、查询、权限控制是否正常

## 8. 更新方式

更新代码后执行：

```bash
git pull
cd recruitment-backend
npm install --omit=dev
cd ../recruitment-frontend
npm install
npm run build
```

之后重启后端服务并刷新前端静态资源。
