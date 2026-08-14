/**
 * Chat 生成任务的数据访问层抽象。
 * 生产实现走 MongoDB（MongoChatStore）；测试注入内存实现。
 */
export interface RunRecord {
  id: string;
  state: string;
  meta?: Record<string, unknown>;
}

export interface RunPatch {
  state?: string;
  meta?: Record<string, unknown>;
}

export interface ChatStore {
  getRun(runId: string): Promise<RunRecord | null>;
  updateRun(runId: string, patch: RunPatch): Promise<void>;
  /** 向消息追加一段文本（模拟流式写回） */
  appendMessageContent(messageId: string, delta: string): Promise<void>;
  setMessageStatus(messageId: string, status: string): Promise<void>;
  /** 清空消息已写内容（失败重试前调用，防止重复追加） */
  resetMessageContent(messageId: string): Promise<void>;
}

/** 内存实现：用于单元测试与离线演示 */
export class MemoryChatStore implements ChatStore {
  runs = new Map<string, RunRecord>();
  messages = new Map<string, { id: string; content: string; status: string }>();

  async getRun(runId: string): Promise<RunRecord | null> {
    const run = this.runs.get(runId);
    return run ? { ...run, meta: run.meta ? structuredClone(run.meta) : undefined } : null;
  }

  async updateRun(runId: string, patch: RunPatch): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`run 不存在: ${runId}`);
    if (patch.state !== undefined) run.state = patch.state;
    if (patch.meta !== undefined) run.meta = { ...(run.meta ?? {}), ...patch.meta };
  }

  async appendMessageContent(messageId: string, delta: string): Promise<void> {
    const message = this.messages.get(messageId);
    if (!message) throw new Error(`message 不存在: ${messageId}`);
    message.content += delta;
  }

  async setMessageStatus(messageId: string, status: string): Promise<void> {
    const message = this.messages.get(messageId);
    if (!message) throw new Error(`message 不存在: ${messageId}`);
    message.status = status;
  }

  async resetMessageContent(messageId: string): Promise<void> {
    const message = this.messages.get(messageId);
    if (!message) throw new Error(`message 不存在: ${messageId}`);
    message.content = '';
  }

  /** 测试辅助：预置 run 与 message */
  seed(run: RunRecord, message: { id: string; content?: string; status?: string }): void {
    this.runs.set(run.id, { ...run });
    this.messages.set(message.id, {
      id: message.id,
      content: message.content ?? '',
      status: message.status ?? 'pending',
    });
  }
}
