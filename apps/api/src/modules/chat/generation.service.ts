import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { ChatRun, ChatRunDocument, newRunId } from './schemas/run.schema.js';
import { ChatMessage } from './schemas/message.schema.js';
import { ConversationsService } from './conversations.service.js';
import { MessagesService } from './messages.service.js';
import { ChatJobQueue, ChatGeneratePayload } from './chat-job-queue.js';
import { GenerateMessageDto, RunResponseDto } from './dto/generation.dto.js';
import { MessageResponseDto } from './dto/message.dto.js';
import { CHAT_LIMITS, DEFAULT_OWNER_ID, GENERATION_LIMITS } from './chat.constants.js';
import { errBadRequest, errNotFound } from './chat.errors.js';
import { normalizePage, normalizePageSize, Paginated } from './chat.pagination.js';
import { redactSensitive } from './chat.security.js';

/** 生成参数子集（全部可选，缺省回落会话模型设置） */
type GenerateOptions = Partial<
  Pick<GenerateMessageDto, 'provider' | 'model' | 'maxTokens' | 'temperature'>
>;

/**
 * 生成任务：创建 run → 入队 → worker 分段写回。
 * 初始版本仅走 deterministic mock（无真实 AI 调用）。
 */
@Injectable()
export class GenerationService {
  constructor(
    @InjectModel(ChatRun.name) private readonly runs: Model<ChatRun>,
    @InjectModel(ChatMessage.name) private readonly messages: Model<ChatMessage>,
    private readonly conversations: ConversationsService,
    private readonly messageService: MessagesService,
    private readonly queue: ChatJobQueue,
  ) {}

  /** 追加一条 user 消息并触发生成（同步场景） */
  async ask(
    conversationId: string,
    content: string,
    dto: GenerateOptions,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<{ userMessage: MessageResponseDto; run: RunResponseDto }> {
    const userMessage = await this.messageService.append(
      conversationId,
      { role: 'user', content },
      ownerId,
    );
    const run = await this.generateFromMessage(conversationId, userMessage.id, dto, ownerId);
    return { userMessage, run };
  }

  /** 基于指定 user 消息创建生成任务 */
  async generateFromMessage(
    conversationId: string,
    messageId: string,
    dto: GenerateOptions,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<RunResponseDto> {
    const conversation = await this.conversations.get(conversationId, ownerId);
    const userMessage = await this.messageService.getById(messageId, ownerId);
    if (userMessage.conversationId !== conversationId) throw errBadRequest('消息不属于该会话');
    if (userMessage.role !== 'user') throw errBadRequest('只能基于用户消息生成回复');

    const history = await this.buildHistory(conversationId, messageId, ownerId);
    // 队列链路负载不携带 ownerId（单用户系统；任务 7：Payload 仅含
    // runId/conversationId/messageId/provider/model/文本快照）
    const payload: ChatGeneratePayload = {
      runId: newRunId(),
      conversationId,
      messageId,
      provider: dto.provider ?? conversation.modelSettings.provider,
      model: dto.model ?? conversation.modelSettings.model,
      maxTokens: Math.min(
        dto.maxTokens ?? GENERATION_LIMITS.DEFAULT_MAX_TOKENS,
        GENERATION_LIMITS.MAX_OUTPUT_CHARS,
      ),
      temperature: dto.temperature ?? conversation.modelSettings.temperature ?? 0.7,
      systemPrompt: conversation.systemPrompt ?? '',
      history,
    };

    await this.messageService.markMessageStatus(messageId, 'pending', ownerId);
    await this.runs.create({
      id: payload.runId,
      conversationId,
      messageId,
      ownerId,
      state: 'queued',
      workerId: null,
      meta: { historyCount: history.length },
    });

    try {
      await this.queue.enqueue(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      await this.runs
        .updateOne(
          { id: payload.runId },
          {
            $set: {
              state: 'failed',
              meta: { error: redactSensitive(message).slice(0, CHAT_LIMITS.RUN_ERROR_MAX) },
            },
          },
        )
        .exec();
      await this.messageService.markMessageStatus(messageId, 'failed', ownerId);
    }
    return this.toResponse(await this.runs.findOne({ id: payload.runId, ownerId }).exec());
  }

  /** 编辑重发：更新消息内容并重新入队生成 */
  async regenerate(
    conversationId: string,
    messageId: string,
    content: string,
    dto: GenerateOptions,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<RunResponseDto> {
    await this.messageService.edit(messageId, { content }, ownerId);
    return this.generateFromMessage(conversationId, messageId, dto, ownerId);
  }

  async getRun(runId: string, ownerId = DEFAULT_OWNER_ID): Promise<RunResponseDto> {
    const run = await this.runs.findOne({ id: runId, ownerId }).exec();
    if (!run) throw errNotFound('生成任务', runId);
    return this.toResponse(run);
  }

  async listRuns(
    conversationId: string,
    ownerId = DEFAULT_OWNER_ID,
    page = 1,
    pageSize = 20,
  ): Promise<Paginated<RunResponseDto>> {
    const p = normalizePage(page);
    const ps = normalizePageSize(pageSize);
    const [items, total] = await Promise.all([
      this.runs
        .find({ conversationId, ownerId })
        .sort({ createdAt: -1 })
        .skip((p - 1) * ps)
        .limit(ps)
        .lean()
        .exec(),
      this.runs.countDocuments({ conversationId, ownerId }).exec(),
    ]);
    return { items: items.map((r) => this.toResponse(r)), total, page: p, pageSize: ps };
  }

  /** 协作式取消：置 cancelling 并尝试移除队列任务；worker 每段检查 DB 状态 */
  async cancel(runId: string, ownerId = DEFAULT_OWNER_ID): Promise<RunResponseDto> {
    const run = await this.runs.findOne({ id: runId, ownerId }).exec();
    if (!run) throw errNotFound('生成任务', runId);
    if (run.state === 'completed' || run.state === 'failed' || run.state === 'cancelled') {
      return this.toResponse(run);
    }
    run.state = 'cancelling';
    await run.save();
    const removed = await this.queue.cancel(runId);
    if (removed) {
      run.state = 'cancelled';
      await run.save();
      await this.messageService.markMessageStatus(run.messageId, 'cancelled', ownerId);
    }
    return this.toResponse(run);
  }

  /** 删除会话时级联清理生成任务 */
  async removeAll(conversationId: string, ownerId = DEFAULT_OWNER_ID): Promise<void> {
    await this.runs.deleteMany({ conversationId, ownerId }).exec();
  }

  /** 供 worker 侧（通过 API 内部）与测试使用：查询 run 状态 */
  async findRunByMessage(
    messageId: string,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<ChatRunDocument | null> {
    return this.runs.findOne({ messageId, ownerId }).exec();
  }

  /** 组装生成输入历史：目标消息之前的消息，按文本长度预算截断（不含敏感字段） */
  private async buildHistory(
    conversationId: string,
    beforeMessageId: string,
    ownerId: string,
  ): Promise<ChatGeneratePayload['history']> {
    const target = await this.messageService.getById(beforeMessageId, ownerId);
    const docs = await this.messages
      .find({
        conversationId,
        ownerId,
        createdAt: { $lt: target.createdAt },
        role: { $in: ['user', 'assistant'] },
      })
      .sort({ createdAt: 1 })
      .limit(CHAT_LIMITS.HISTORY_MAX_MESSAGES)
      .lean()
      .exec();

    const history: ChatGeneratePayload['history'] = [];
    let totalChars = 0;
    for (const doc of docs) {
      const content = String(doc.content ?? '');
      if (totalChars + content.length > CHAT_LIMITS.HISTORY_MAX_CHARS) break;
      history.push({ role: doc.role as 'user' | 'assistant', content });
      totalChars += content.length;
    }
    return history;
  }

  private toResponse(run: ChatRunDocument | ChatRun | null): RunResponseDto {
    if (!run) throw errNotFound('生成任务', '');
    const r = run as unknown as ChatRun;
    const segments = (r.meta?.segments ?? []) as Array<{ index: number; text: string }>;
    const total = (r.meta?.totalSegments ?? 0) as number;
    let progress: number | null = 5;
    if (r.state === 'completed' || r.state === 'failed' || r.state === 'cancelled') {
      progress = 100;
    } else if (r.state === 'running' || r.state === 'cancelling') {
      progress = total > 0 ? Math.min(99, Math.round((segments.length / total) * 100)) : 10;
    }
    return {
      id: r.id,
      conversationId: r.conversationId,
      messageId: r.messageId,
      state: r.state,
      progress,
      meta: (r.meta ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
    };
  }
}
