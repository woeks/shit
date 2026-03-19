# 项目交付与上线说明

## 1. 项目基本信息

- 项目名称：招聘管理系统
- 技术栈：Vue 3、Vite、Element Plus、Express、Sequelize、PostgreSQL
- GitHub 仓库：[https://github.com/woeks/recruitment-system](https://github.com/woeks/recruitment-system)
- 当前发布标签：`v1.0.0`

## 2. 本次交付范围

本次交付内容包括：

- 前端管理端源码
- 后端服务源码
- Docker 镜像构建文件
- Docker Compose 部署文件
- 环境变量模板
- 部署说明文档
- 交付说明文档

本次已完成以下发布整理：

- 移除测试数据插入脚本
- 移除登录页测试账号展示与预填
- 后端移除内置测试账号和测试密码
- 恢复默认 logo
- 清理不适合公开仓库的本地运行产物与临时文件

## 3. 仓库目录说明

```text
.
├── recruitment-frontend/   # 前端项目
├── recruitment-backend/    # 后端项目
├── docs/                   # 文档
├── README.md               # 项目总说明
└── .gitignore              # Git 忽略规则
```

## 4. 运行环境要求

建议环境如下：

- Node.js 20 及以上
- PostgreSQL 14 及以上
- Linux 服务器或 macOS 开发环境
- Nginx 或其他静态站点/反向代理服务

## 5. 部署前准备

上线前请先准备以下信息：

- 数据库地址、用户名、密码
- 后端服务运行端口
- JWT 密钥
- 首个系统管理员账号
- 域名或访问入口

后端环境变量建议至少配置：

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

## 6. 上线步骤

### 后端

```bash
cd recruitment-backend
npm install --omit=dev
cp .env.example .env
npm run start
```

### 前端

```bash
cd recruitment-frontend
npm install
npm run build
```

构建完成后，将 `recruitment-frontend/dist/` 部署到静态资源目录，并通过反向代理将 `/api` 和 `/uploads` 指向后端服务。

## 7. 交付后的首次检查

建议首次上线后按以下顺序验证：

1. 检查后端健康接口 `/api/health` 是否返回正常
2. 使用初始化管理员账号登录系统
3. 检查岗位、简历、面试、Offer、人才库、报表页面是否可正常打开
4. 检查用户权限和登录态是否正常
5. 如启用邮箱同步，验证 IMAP 配置和同步链路

## 8. 安全与发布说明

本次公开仓库已做如下处理：

- 未提交真实 `.env`
- 未提交 `node_modules`
- 未提交构建产物 `dist`
- 未提交上传文件
- 未提交测试脚本与临时压缩包

请注意：

- 不要在公开仓库提交真实数据库密码
- 不要使用弱密码作为管理员初始密码
- `JWT_SECRET` 必须替换为高强度随机字符串

## 9. 交付建议

如果后续继续正式运营，建议补充以下内容：

- 独立的生产/测试环境配置
- 数据库迁移脚本管理
- 自动化部署流程
- 备份与日志策略
- 域名、HTTPS 和监控告警配置

## 10. 文档索引

- 项目说明：[README.md](../README.md)
- 部署总览：[DEPLOYMENT.md](DEPLOYMENT.md)
- Docker 部署手册：[DOCKER_DEPLOY.md](DOCKER_DEPLOY.md)
- 源码部署手册：[SOURCE_DEPLOY.md](SOURCE_DEPLOY.md)
- 交付说明：[DELIVERY.md](DELIVERY.md)
