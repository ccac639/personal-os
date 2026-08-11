import { pino } from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
  },
});

/**
 * Worker 启动入口（骨架模式）
 *
 * 本阶段仅初始化进程与日志，不连接 Redis / MongoDB，
 * 不注册任何 BullMQ Worker / 任务处理器。
 *
 * 后续阶段接入：
 *  - jobs/ai、jobs/workflow、jobs/embedding、jobs/media、jobs/notification
 *  - providers/openai、anthropic、google、openrouter
 */
async function main(): Promise<void> {
  logger.info('Personal OS Worker 启动（骨架模式）');
  logger.info(
    '计划任务域: AI Task / Agent Execution / Workflow Execution / Embedding / Document Processing / Notification / Media Processing / Scheduled Jobs',
  );
}

void main();
