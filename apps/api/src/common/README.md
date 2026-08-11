# apps/api/src/common

共享基础设施（后续阶段实现）：

- `filters/` — 全局异常过滤器
- `interceptors/` — 日志 / 转换拦截器
- `guards/` — 认证 / 角色守卫（passport-jwt）
- `decorators/` — 自定义装饰器（@CurrentUser 等）
- `redis/` — ioredis 连接提供者
- `queue/` — BullMQ 连接与注册
