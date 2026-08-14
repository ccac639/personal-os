import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import {
  CHAT_LIMITS,
  CHAT_MESSAGE_STATUSES,
  DEFAULT_OWNER_ID,
  newId,
  toIso,
  type ChatMessageStatus,
} from '../chat.constants.js';

export const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export interface MessageBookmark {
  id: string;
  label: string;
  note?: string;
  createdAt: string;
}

export interface MessageQuote {
  /** 被引用消息 id（可为空：外部引用仅保留摘录） */
  messageId: string | null;
  role: MessageRole;
  excerpt: string;
}

export interface MessageReferences {
  /** 被本消息引用/回复的消息 id */
  replyTo?: string | null;
  quote?: MessageQuote | null;
}

export interface MessageGenInfo {
  runId?: string | null;
  model?: string | null;
  provider?: string | null;
  segments?: number | null;
  totalTokens?: number | null;
  durationMs?: number | null;
}

@Schema({ collection: 'chat_messages', timestamps: true, versionKey: false })
export class ChatMessage {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  conversationId!: string;

  @Prop({ required: true, index: true, default: DEFAULT_OWNER_ID })
  ownerId!: string;

  @Prop({ type: String, required: true, enum: MESSAGE_ROLES })
  role!: MessageRole;

  /** 消息正文（文本，长度受限；用户输入按原样保存，不做脱敏） */
  @Prop({ required: true, maxlength: CHAT_LIMITS.MESSAGE_CONTENT_MAX })
  content!: string;

  @Prop({ type: String, required: true, enum: CHAT_MESSAGE_STATUSES, default: 'completed' })
  status!: ChatMessageStatus;

  @Prop({ type: Object, default: () => ({}) })
  references!: MessageReferences;

  @Prop({ type: Object, default: () => ({}) })
  genInfo!: MessageGenInfo;

  @Prop({ type: [Object], default: () => [] })
  bookmarks!: MessageBookmark[];

  @Prop({ type: Date, default: null })
  editedAt!: Date | null;

  /** schema timestamps:true 自动维护（仅类型声明，不参与 schema 定义） */
  createdAt!: Date;
  updatedAt!: Date;
}

export type ChatMessageDocument = HydratedDocument<ChatMessage>;

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

export const chatMessageIndexes = (): void => {
  const schema = ChatMessageSchema;
  void schema.index({ conversationId: 1, createdAt: 1 });
  void schema.index({ conversationId: 1, role: 1 });
  void schema.index({ ownerId: 1, createdAt: -1 });
};

export function newMessageId(): string {
  return newId('msg');
}

export function toMessageRole(value: string): MessageRole {
  return (MESSAGE_ROLES as readonly string[]).includes(value) ? (value as MessageRole) : 'user';
}

export function toIsoOrNull(date: Date | null | undefined): string | null {
  return toIso(date);
}
