/**
 * 安全响应头配置（@fastify/helmet，内部为 helmet 8）。
 *
 * 策略说明：
 * - 默认启用 helmet 全部安全头：X-Content-Type-Options / X-Frame-Options /
 *   Strict-Transport-Security / Referrer-Policy / X-DNS-Prefetch-Control /
 *   Cross-Origin-* 等。
 * - CSP：default-src 'self' 基础策略。@nestjs/swagger 11 的 Swagger UI 资源
 *   （swagger-ui-dist）全部由 API 同源静态服务，无 CDN；HTML 含内联 <style>
 *   与 <svg>，故 style-src 保留 'unsafe-inline'，script-src 保持 'self'（无内联脚本）。
 * - 与 CORS（common/cors.ts 单一来源白名单）协调：本 API 不服务跨域子资源，
 *   Cross-Origin-Resource-Policy: same-origin 不阻止已获 CORS 允许的跨域读取。
 */
export function buildHelmetOptions() {
  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        upgradeInsecureRequests: [],
      },
    },
  };
}
