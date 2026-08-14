import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import {
  AGENT_PROVIDERS,
  CHAT_LIMITS,
  DEFAULT_MODEL,
  DEFAULT_OWNER_ID,
  type AgentProviderName,
  newId,
} from '../chat.constants.js';

export type ConversationStatus = 'active' | 'archived';

export interface ConversationModelSettings {
  provider: AgentProviderName;
  model: string;
  temperature: number;
  maxTokens: number;
}

@Schema({ collection: 'chat_conversations', timestamps: true, versionKey: false })
export class Conversation {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true, default: DEFAULT_OWNER_ID })
  ownerId!: string;

  @Prop({ required: true, maxlength: CHAT_LIMITS.TITLE_MAX, default: '新对话' })
  title!: string;

  @Prop({ maxlength: CHAT_LIMITS.SYSTEM_PROMPT_MAX, default: '' })
  systemPrompt!: string;

  @Prop({ type: Object, default: () => defaultModelSettings() })
  modelSettings!: ConversationModelSettings;

  @Prop({ default: false, index: true })
  pinned!: boolean;

  @Prop({ default: false, index: true })
  archived!: boolean;

  @Prop({ default: false, index: true })
  favorite!: boolean;

  /** 生成该会话的智能体 id（agt_*），非智能体启动的会话为空 */
  @Prop({ type: String, default: null, index: true })
  agentId!: string | null;

  @Prop({ default: 0 })
  messageCount!: number;

  @Prop({ type: Date, default: null })
  lastMessageAt!: Date | null;

  /** schema timestamps:true 自动维护（仅类型声明，不参与 schema 定义） */
  createdAt!: Date;
  updatedAt!: Date;
}

export type ConversationDocument = HydratedDocument<Conversation>;

export function defaultModelSettings(): ConversationModelSettings {
  return {
    provider: 'siliconflow',
    model: DEFAULT_MODEL,
    temperature: 0.7,
    maxTokens: 500,
  };
}

export function isKnownProvider(value: unknown): value is AgentProviderName {
  return typeof value === 'string' && (AGENT_PROVIDERS as readonly string[]).includes(value);
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

export const conversationIndexes = (): void => {
  const schema = ConversationSchema;
  void schema.index({ ownerId: 1, archived: 1, pinned: -1, updatedAt: -1 });
  void schema.index({ ownerId: 1, agentId: 1 });
  void schema.index({ ownerId: 1, favorite: 1, updatedAt: -1 });
};

export function newConversationId(): string {
  return newId('conv');
}
