import mongoose from 'mongoose';

import type { ChatStore, RunPatch } from './chat-store.js';

/** Worker 侧最小 Schema：与 API 侧 chat_runs / chat_messages 同集合、同 id 约定 */
const runSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    state: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { collection: 'chat_runs', timestamps: true, versionKey: false },
);

const messageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    content: { type: String, default: '' },
    status: { type: String, default: 'pending' },
  },
  { collection: 'chat_messages', timestamps: true, versionKey: false },
);

/** MongoDB 实现：通过已建立的 mongoose 连接读写（无独立连接管理） */
export class MongoChatStore implements ChatStore {
  private readonly RunModel = mongoose.model('WorkerChatRun', runSchema);
  private readonly MessageModel = mongoose.model('WorkerChatMessage', messageSchema);

  async getRun(
    runId: string,
  ): Promise<{ id: string; state: string; meta?: Record<string, unknown> } | null> {
    const doc = await this.RunModel.findOne({ id: runId }).lean().exec();
    if (!doc) return null;
    return {
      id: doc.id,
      state: doc.state,
      meta: (doc.meta as Record<string, unknown> | undefined) ?? {},
    };
  }

  async updateRun(runId: string, patch: RunPatch): Promise<void> {
    const update: Record<string, unknown> = {};
    if (patch.state !== undefined) update['state'] = patch.state;
    if (patch.meta !== undefined) update['meta'] = patch.meta;
    if (Object.keys(update).length === 0) return;
    await this.RunModel.updateOne({ id: runId }, { $set: update }).exec();
  }

  async appendMessageContent(messageId: string, delta: string): Promise<void> {
    const doc = await this.MessageModel.findOne({ id: messageId }).exec();
    const current = (doc?.content as string | undefined) ?? '';
    await this.MessageModel.updateOne(
      { id: messageId },
      { $set: { content: current + delta } },
    ).exec();
  }

  async setMessageStatus(messageId: string, status: string): Promise<void> {
    await this.MessageModel.updateOne({ id: messageId }, { $set: { status } }).exec();
  }

  async resetMessageContent(messageId: string): Promise<void> {
    await this.MessageModel.updateOne({ id: messageId }, { $set: { content: '' } }).exec();
  }
}
