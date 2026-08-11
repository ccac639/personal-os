# infrastructure/docker

本目录存放 Docker 相关的补充配置与说明。

开发环境的 Mongo / Redis / MinIO 由根目录 `docker-compose.yml` 提供，
Web / API / Blog / Worker 开发时直接 `pnpm dev` 在宿主机运行，
不强制容器化（详见根 README）。

## 常用命令

```bash
# 启动全部基础服务
pnpm docker:up

# 查看状态
docker compose ps

# 停止并移除容器（保留数据卷）
docker compose down

# 停止并移除容器 + 数据卷（清空数据）
docker compose down -v
```

## 约定

- MongoDB 数据卷：`mongodb_data`
- Redis 数据卷：`redis_data`
- MinIO 数据卷：`minio_data`
- MinIO 默认账号：`minioadmin / minioadmin`（仅限本地开发，生产必须更换）
