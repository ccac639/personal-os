import { createHash } from 'node:crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import { DEFAULT_OWNER_ID, newId } from '../chat/chat.constants.js';

export const INSPIRATION_SOURCES = ['manual', 'chat', 'import'] as const;
export type InspirationSource = (typeof INSPIRATION_SOURCES)[number];

@Schema({ collection: 'inspirations', timestamps: true, versionKey: false })
export class Inspiration {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true, default: DEFAULT_OWNER_ID })
  ownerId!: string;

  @Prop({ required: true, maxlength: 200 })
  title!: string;

  @Prop({ required: true, maxlength: 20_000 })
  content!: string;

  @Prop({ default: '未分类', index: true, maxlength: 50 })
  category!: string;

  @Prop({ type: String, required: true, enum: INSPIRATION_SOURCES, default: 'manual', index: true })
  source!: InspirationSource;

  @Prop({ type: [String], default: () => [], index: true })
  tags!: string[];

  @Prop({ default: false, index: true })
  favorite!: boolean;

  @Prop({ default: false, index: true })
  pinned!: boolean;

  @Prop({ default: false, index: true })
  archived!: boolean;

  /** 从消息保存时记录来源消息与会话 */
  @Prop({ type: String, default: null })
  sourceMessageId!: string | null;

  @Prop({ type: String, default: null })
  sourceConversationId!: string | null;

  /** 标题+内容指纹（去空白），用于导入去重 */
  @Prop({ required: true, index: true })
  fingerprint!: string;

  /** schema timestamps:true 自动维护（仅类型声明，不参与 schema 定义） */
  createdAt!: Date;
  updatedAt!: Date;
}

export type InspirationDocument = HydratedDocument<Inspiration>;

export const InspirationSchema = SchemaFactory.createForClass(Inspiration);

export const inspirationIndexes = (): void => {
  const schema = InspirationSchema;
  void schema.index({ ownerId: 1, archived: 1, pinned: -1, updatedAt: -1 });
  void schema.index({ ownerId: 1, category: 1, updatedAt: -1 });
  void schema.index({ ownerId: 1, tags: 1 });
  void schema.index({ ownerId: 1, source: 1, updatedAt: -1 });
  void schema.index({ ownerId: 1, fingerprint: 1 });
};

export function newInspirationId(): string {
  return newId('ins');
}

/** 指纹：标题+内容去空白后取 SHA-1（导入去重依据） */
export function fingerprintOf(title: string, content: string): string {
  const normalized = `${title}\n${content}`.replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha1').update(normalized, 'utf8').digest('hex');
}
