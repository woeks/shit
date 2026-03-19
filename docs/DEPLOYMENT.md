# 部署总览

当前项目支持两种部署方式：

## 1. Docker 一键部署

适用场景：

- 希望快速上线
- 服务器环境干净，准备直接容器化部署
- 希望前端、后端、数据库一起启动

推荐文件：

- [`../docker-compose.prod.yml`](../docker-compose.prod.yml)
- [`../.env.docker.example`](../.env.docker.example)
- [Docker 部署手册](DOCKER_DEPLOY.md)

启动命令：

```bash
cp .env.docker.example .env.docker
docker compose -f docker-compose.prod.yml --env-file .env.docker up -d --build
```

## 2. 源码部署

适用场景：

- 服务器上已有 Node.js 和 PostgreSQL
- 需要将前端静态文件与后端服务分开部署
- 需要自行接入现有 Nginx、PM2 或其他运维体系

推荐文档：

- [源码部署手册](SOURCE_DEPLOY.md)

## 3. 如何选择

- 想省事、上线快：选 Docker 一键部署
- 想细粒度控制服务结构：选源码部署

## 4. 上线前统一检查

无论哪种方式，上线前都建议确认：

- 数据库密码已替换
- `JWT_SECRET` 已替换为强随机字符串
- 管理员初始账号和密码已修改
- 仓库内未使用任何测试账号或测试密码
- 域名、端口、反向代理策略已确认
