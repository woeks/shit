# 招聘管理系统

一个基于 `Vue 3 + Vite + Element Plus` 和 `Express + Sequelize + PostgreSQL` 的招聘管理系统，覆盖岗位管理、简历处理、复筛、面试安排、Offer、人才库、权限和报表等核心流程。

## 项目结构

```text
.
├── recruitment-frontend/   # 前端
├── recruitment-backend/    # 后端
└── docs/                   # 部署与发布说明
```

## 当前整理内容

- 已移除仓库内用于插入演示/测试数据的脚本
- 前端登录页不再展示或预填测试账号
- 后端不再内置演示账号或测试密码
- logo 已恢复为默认 Vite logo

如需在首次部署时自动创建管理员，请显式提供管理员初始化环境变量：

```bash
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=your_strong_password
```

## 环境要求

- Node.js 20+
- PostgreSQL 14+

## 后端启动

1. 复制环境变量模板：

```bash
cd recruitment-backend
cp .env.example .env
```

2. 按实际环境修改 `.env`

```env
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=recruitment_db
DB_DIALECT=postgres
PORT=3000
JWT_SECRET=change_this_to_a_strong_random_secret
ENABLE_STARTUP_BACKFILL=false
BOOTSTRAP_ADMIN_USERNAME=
BOOTSTRAP_ADMIN_PASSWORD=
BOOTSTRAP_ADMIN_NAME=
BOOTSTRAP_ADMIN_EMAIL=
```

3. 安装并启动：

```bash
npm install
npm run start
```

## 前端启动

```bash
cd recruitment-frontend
npm install
npm run dev
```

默认开发地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`

## 生产构建

前端：

```bash
cd recruitment-frontend
npm install
npm run build
```

后端：

```bash
cd recruitment-backend
npm install --omit=dev
npm run start
```

## 发布建议

- GitHub 仓库只提交源码、锁文件、文档和必要静态资源
- 不提交 `node_modules`、构建产物、真实 `.env`、本地上传文件和临时压缩包
- 首次生产部署时先通过环境变量或后台人工创建正式管理员账号，再开放系统使用

详细部署说明见 [docs/DEPLOYMENT.md](/Users/fanrulei/Documents/Playground/docs/DEPLOYMENT.md)。

正式交付与上线说明见 [docs/DELIVERY.md](/Users/fanrulei/Documents/Playground/docs/DELIVERY.md)。
