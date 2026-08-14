import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import {
  AGENT_PROVIDERS,
  DEFAULT_OWNER_ID,
  newId,
  type AgentProviderName,
} from '../chat/chat.constants.js';

export const AGENT_KINDS = ['builtin', 'personal'] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

@Schema({ collection: 'agents', timestamps: true, versionKey: false })
export class Agent {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  /** 'system' 为内置模板，'me' 为个人变体 */
  @Prop({ required: true, index: true, default: DEFAULT_OWNER_ID })
  ownerId!: string;

  @Prop({ required: true, maxlength: 100 })
  name!: string;

  @Prop({ default: '', maxlength: 500 })
  description!: string;

  @Prop({ required: true, maxlength: 100, default: 'gpt-4o-mini' })
  model!: string;

  @Prop({ type: String, required: true, enum: AGENT_PROVIDERS, default: 'openai' })
  provider!: AgentProviderName;

  @Prop({ default: '', maxlength: 4_000 })
  systemPrompt!: string;

  @Prop({ type: String, required: true, enum: AGENT_KINDS, default: 'personal' })
  kind!: AgentKind;

  /** 内置模板标识（personal 变体可引用同一 key） */
  @Prop({ type: String, default: null, index: true })
  builtinKey!: string | null;

  @Prop({ default: false, index: true })
  favorite!: boolean;

  @Prop({ default: false, index: true })
  hidden!: boolean;

  @Prop({ default: true })
  enabled!: boolean;

  @Prop({ default: 0 })
  usageCount!: number;

  @Prop({ type: Date, default: null })
  lastUsedAt!: Date | null;

  /** schema timestamps:true 自动维护（仅类型声明，不参与 schema 定义） */
  createdAt!: Date;
  updatedAt!: Date;
}

export type AgentDocument = HydratedDocument<Agent>;

export const AgentSchema = SchemaFactory.createForClass(Agent);

export const agentIndexes = (): void => {
  const schema = AgentSchema;
  void schema.index({ ownerId: 1, hidden: 1, favorite: -1 });
  void schema.index({ ownerId: 1, kind: 1 });
  void schema.index(
    { ownerId: 1, builtinKey: 1 },
    { unique: true, partialFilterExpression: { builtinKey: { $type: 'string' } } },
  );
};

export function newAgentId(): string {
  return newId('agt');
}
