import type { FastifyInstance, FastifyReply } from 'fastify';

import { REQUEST_ID_HEADER } from '../filters/all-exceptions.filter.js';
import { ERROR_CODES } from '../interfaces/error-codes.js';
import { redactUrl } from '../security/redact.js';

const TIMERS = new WeakMap<FastifyReply, NodeJS.Timeout>();

/**
 * 全局请求超时保护（Fastify hook）：
 * - onRequest 启动 timer，超时且响应未发送时返回 408 REQUEST_TIMEOUT（统一错误格式）
 * - onResponse 清理 timer，避免响应结束后再次写入
 * - 幂等：重复调用同一实例时先卸载旧 hook 计数（由调用方保证只安装一次）
 */
export function installRequestTimeout(fastify: FastifyInstance, timeoutMs: number): void {
  fastify.addHook('onRequest', async (request, reply) => {
    const timer = setTimeout(() => {
      if (!reply.sent) {
        void reply.status(408).send({
          requestId:
            ((request as unknown as { requestId?: string }).requestId as string | undefined) ??
            (request.headers[REQUEST_ID_HEADER] as string | undefined) ??
            'unknown',
          timestamp: new Date().toISOString(),
          path: redactUrl(request.url),
          statusCode: 408,
          code: ERROR_CODES.REQUEST_TIMEOUT,
          message: '请求处理超时',
        });
      }
    }, timeoutMs);
    TIMERS.set(reply, timer);
  });

  fastify.addHook('onResponse', async (_request, reply) => {
    const timer = TIMERS.get(reply);
    if (timer !== undefined) {
      clearTimeout(timer);
      TIMERS.delete(reply);
    }
  });
}
