# infrastructure/scripts

项目级辅助脚本目录。

## 规划

- `setup.ps1` — Windows 开发环境一键检查（node / pnpm / docker 可用性）
- `dev-up.ps1` — 启动基础服务 + 全部 dev server（等价于 `pnpm docker:up && pnpm dev`）
- `seed-minio.ps1` — 初始化 MinIO bucket（后续阶段）

本阶段尚未实现脚本，仅保留目录约定。
