# apps/api/src/common

共享基础设施（平台基座，与业务模块解耦）：

- `filters/all-exceptions.filter.ts` — 全局异常过滤器：统一错误响应
  （requestId / timestamp / path / statusCode / code / message / fields?），
  production 隐藏内部细节，不泄露堆栈、环境变量、密钥与连接串
- `guards/api-key.guard.ts` — 全局 API Key 守卫：可选 PERSONAL_OS_API_KEY，
  node:crypto timing-safe 比较；豁免 /health、Swagger 文档与 OPTIONS
- `interceptors/request-id.interceptor.ts` — 请求链路 ID（透传 X-Request-Id /
  自动 UUID）+ 开发期请求耗时日志
- `interceptors/transform.interceptor.ts` — 统一成功响应包装
  （{ requestId, timestamp, path, statusCode, code, message, data }）
- `interfaces/api-response.interface.ts` — 统一响应 / 错误类型定义
- `health/` — GET /api/health：API 状态、版本、时间、Mongo/Redis 可用性
  （仅 up/down，不泄密）
- `redis/redis.module.ts` — ioredis 全局提供者（后台连接不阻塞启动，
  maxRetriesPerRequest: null 兼容 BullMQ）
- `cors.ts` — CORS 配置构建（单一精确 Origin + credentials，禁止 origin=*）

后续可接入（业务线按需实现）：
- `interceptors/` — 更多转换拦截器
- `decorators/` — 自定义装饰器
- `queue/` — BullMQ 队列注册
