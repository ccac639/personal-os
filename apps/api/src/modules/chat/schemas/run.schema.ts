import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import { CHAT_RUN_STATES, DEFAULT_OWNER_ID, newId, type ChatRunState } from '../chat.constants.js';

export interface ChatRunMeta {
  /** 各分段执行结果（worker 写入） */
  segments?: Array<{ index: number; text: string; tokenCount?: number }>;
  /** worker 写入的总分段数（进度估算用） */
  totalSegments?: number;
  error?: string;
  /** 输入历史快照信息（不含消息正文） */
  historyCount?: number;
  model?: string;
  provider?: string;
  totalTokens?: number;
  durationMs?: number;
}

@Schema({ collection: 'chat_runs', timestamps: true, versionKey: false })
export class ChatRun {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  conversationId!: string;

  /** 用户消息 id（触发本次生成的消息） */
  @Prop({ required: true, index: true })
  messageId!: string;

  @Prop({ required: true, index: true, default: DEFAULT_OWNER_ID })
  ownerId!: string;

  @Prop({ type: String, required: true, enum: CHAT_RUN_STATES, default: 'queued' })
  state!: ChatRunState;

  /** worker 消费时填充 */
  @Prop({ type: String, default: null })
  workerId!: string | null;

  @Prop({ type: Object, default: () => ({}) })
  meta!: ChatRunMeta;

  /** schema timestamps:true 自动维护（仅类型声明，不参与 schema 定义） */
  createdAt!: Date;
  updatedAt!: Date;
}

export type ChatRunDocument = HydratedDocument<ChatRun>;

export const ChatRunSchema = SchemaFactory.createForClass(ChatRun);

export const chatRunIndexes = (): void => {
  const schema = ChatRunSchema;
  void schema.index({ conversationId: 1, createdAt: -1 });
  void schema.index({ messageId: 1 }, { unique: true });
  void schema.index({ state: 1, updatedAt: 1 });
};

export function newRunId(): string {
  return newId('run');
}
