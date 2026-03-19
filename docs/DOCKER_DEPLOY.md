# Docker 上线手册

## 1. 适用场景

本手册适用于通过 Docker 和 Docker Compose 部署当前招聘管理系统。

仓库中已经提供：

- [docker-compose.yml](/Users/fanrulei/Documents/Playground/docker-compose.yml)
- [docker-compose.prod.yml](/Users/fanrulei/Documents/Playground/docker-compose.prod.yml)
- [recruitment-backend/Dockerfile](/Users/fanrulei/Documents/Playground/recruitment-backend/Dockerfile)
- [recruitment-frontend/Dockerfile](/Users/fanrulei/Documents/Playground/recruitment-frontend/Dockerfile)
- [/.env.docker.example](/Users/fanrulei/Documents/Playground/.env.docker.example)

## 2. 准备环境

服务器需要先安装：

- Docker
- Docker Compose Plugin

可用以下命令确认：

```bash
docker --version
docker compose version
```

## 3. 拉取代码

```bash
git clone https://github.com/woeks/shit.git
cd shit
```

## 4. 准备生产环境变量

复制模板：

```bash
cp .env.docker.example .env.docker
```

重点修改以下项目：

- `APP_PORT`
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_EMAIL`

## 5. 构建并启动

```bash
docker compose -f docker-compose.prod.yml --env-file .env.docker up -d --build
```

启动后默认访问：

- 前端：`http://服务器IP:APP_PORT`
- 健康检查：`http://服务器IP:APP_PORT/api/health`

## 6. 单独构建镜像

如果只想打包镜像，不立即启动容器，可执行：

```bash
docker build -t recruitment-backend:latest ./recruitment-backend
docker build -t recruitment-frontend:latest ./recruitment-frontend
```

或者：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.docker build
```

## 7. 查看运行状态

```bash
docker compose -f docker-compose.prod.yml --env-file .env.docker ps
docker compose -f docker-compose.prod.yml --env-file .env.docker logs -f
```

单独查看后端日志：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.docker logs -f backend
```

## 8. 停止与重启

停止：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.docker down
```

重启：

```bash
docker compose -f docker-compose.prod.yml --env-file .env.docker up -d
```

## 9. 更新发布

代码更新后执行：

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.docker up -d --build
```

## 10. 数据与持久化

当前 Compose 已配置以下持久化卷：

- `postgres_data`
- `backend_uploads`

这意味着：

- PostgreSQL 数据不会因容器重建而丢失
- 上传文件不会因后端容器重建而丢失

## 11. 上线建议

- 使用强密码和随机 JWT 密钥
- 对外只开放前端端口
- 配置域名和 HTTPS
- 做好数据库备份
- 定期检查容器日志和磁盘占用
