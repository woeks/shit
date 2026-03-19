# 招聘管理系统

一个基于 `Vue 3 + Vite + Element Plus` 和 `Express + Sequelize + PostgreSQL` 的招聘管理系统，覆盖岗位管理、简历处理、复筛、面试安排、Offer、人才库、权限管理、邮箱同步和统计报表等核心招聘流程。

## 项目定位

这个项目适合用于：

- 企业内部招聘流程管理
- HR 与面试官协同操作
- 简历入库、筛选、面试、Offer 全流程跟踪
- 通过 Docker 或源码方式快速部署上线

## 核心功能

- 岗位管理
- 简历库与简历解析
- 初筛、复筛、面试流程协同
- Offer 管理
- 人才库管理
- 人员权限管理
- 邮箱同步
- 统计报表

## 部署方式

### 1. Docker 一键部署

推荐用于正式环境和快速上线。

```bash
cp .env.docker.example .env.docker
docker compose -f docker-compose.prod.yml --env-file .env.docker up -d --build
```

相关文档：

- [部署总览](docs/DEPLOYMENT.md)
- [Docker 部署手册](docs/DOCKER_DEPLOY.md)

### 2. 源码部署

适合已有 Node.js / PostgreSQL 环境，或希望自行接入 Nginx、PM2、systemd 的场景。

后端：

```bash
cd recruitment-backend
cp .env.example .env
npm install --omit=dev
npm run start
```

前端：

```bash
cd recruitment-frontend
npm install
npm run build
```

相关文档：

- [源码部署手册](docs/SOURCE_DEPLOY.md)

## 本地开发

环境要求：

- Node.js 20+
- PostgreSQL 14+

后端开发启动：

```bash
cd recruitment-backend
cp .env.example .env
npm install
npm run start
```

前端开发启动：

```bash
cd recruitment-frontend
npm install
npm run dev
```

默认开发地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`

## 仓库结构

```text
.
├── recruitment-frontend/   # 前端项目
├── recruitment-backend/    # 后端项目
├── docs/                   # 部署与交付文档
├── docker-compose.yml
├── docker-compose.prod.yml
└── .env.docker.example
```

## 文档索引

- [部署总览](docs/DEPLOYMENT.md)
- [Docker 部署手册](docs/DOCKER_DEPLOY.md)
- [源码部署手册](docs/SOURCE_DEPLOY.md)
- [交付说明](docs/DELIVERY.md)

## 当前仓库已完成整理

- 已移除测试数据插入脚本
- 前端登录页不再展示或预填测试账号
- 后端不再内置测试账号和测试密码
- 已补齐 Docker 部署文件
- 已补齐源码部署文档、Docker 部署文档和交付说明

## 发布说明

- GitHub 仓库只提交源码、锁文件、部署文件和说明文档
- 不提交 `node_modules`、`dist`、真实 `.env`、上传文件和临时压缩包
- 首次上线请先修改数据库密码、JWT 密钥和管理员初始密码
