import type { FastifyInstance } from 'fastify';

/**
 * 安全响应头（不引入 Helmet）：
 * - X-Content-Type-Options: nosniff（禁止 MIME 嗅探）
 * - X-Frame-Options: DENY（禁止被 iframe 嵌入）
 * - Referrer-Policy: no-referrer（不向外部泄露来源 URL）
 * 幂等：同名响应头不会重复追加。
 */
export function installSecurityHeaders(fastify: FastifyInstance): void {
  fastify.addHook('onSend', async (_request, reply) => {
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('X-Frame-Options', 'DENY');
    void reply.header('Referrer-Policy', 'no-referrer');
  });
}
