import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  ChatMessage,
  ChatMessageDocument,
  newMessageId,
  toIsoOrNull,
} from './schemas/message.schema.js';
import { ConversationsService } from './conversations.service.js';
import {
  AddBookmarkDto,
  AppendMessageDto,
  EditMessageDto,
  MessageQueryDto,
  MessageResponseDto,
  validateQuotePayload,
} from './dto/message.dto.js';
import { CHAT_LIMITS, DEFAULT_OWNER_ID, newId, toIso } from './chat.constants.js';
import { errBadRequest, errNotFound, errTooLarge } from './chat.errors.js';
import { normalizePage, normalizePageSize, Paginated } from './chat.pagination.js';
import { assertTextOnly } from './chat.security.js';

/** 消息分页读取 / 追加 / 编辑 / 书签 / 引用 */
@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(ChatMessage.name) private readonly model: Model<ChatMessage>,
    private readonly conversations: ConversationsService,
  ) {}

  async list(
    conversationId: string,
    query: MessageQueryDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<Paginated<MessageResponseDto>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const filter: Record<string, unknown> = { conversationId, ownerId };
    if (query.role) filter['role'] = query.role;
    if (query.bookmarked) filter['bookmarks.0'] = { $exists: true };
    if (query.before) filter['createdAt'] = { $lt: new Date(query.before) };

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items: items.map((d) => this.toResponse(d)), total, page, pageSize };
  }

  async getById(messageId: string, ownerId = DEFAULT_OWNER_ID): Promise<ChatMessageDocument> {
    const doc = await this.model.findOne({ id: messageId, ownerId }).exec();
    if (!doc) throw errNotFound('消息', messageId);
    return doc;
  }

  /** 追加消息：校验长度/二进制/条数上限，回写会话计数与自动标题 */
  async append(
    conversationId: string,
    dto: AppendMessageDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<MessageResponseDto> {
    await this.conversations.get(conversationId, ownerId);
    assertTextOnly(dto.content, 'content');
    if (dto.content.length > CHAT_LIMITS.MESSAGE_CONTENT_MAX) {
      throw errTooLarge(`消息超长（>${CHAT_LIMITS.MESSAGE_CONTENT_MAX} 字符）`);
    }
    if (dto.quote?.excerpt) assertTextOnly(dto.quote.excerpt, 'quote.excerpt');

    const count = await this.model.countDocuments({ conversationId, ownerId }).exec();
    if (count >= CHAT_LIMITS.MESSAGES_PER_CONVERSATION) {
      throw errTooLarge(`会话消息数已达上限（${CHAT_LIMITS.MESSAGES_PER_CONVERSATION} 条）`);
    }

    const quote = validateQuotePayload(dto.quote, dto.replyTo);
    const doc = await this.model.create({
      id: newMessageId(),
      conversationId,
      ownerId,
      role: dto.role,
      content: dto.content,
      status: 'completed',
      references: { replyTo: dto.replyTo ?? null, quote },
      genInfo: {},
      bookmarks: [],
      editedAt: null,
    });
    await this.conversations.touch(conversationId, ownerId);
    if (dto.role === 'user') {
      await this.conversations.autoTitle(conversationId, ownerId, dto.content);
    }
    return this.toResponse(doc);
  }

  /** 编辑消息（重发语义：清空生成信息，由调用方决定是否重新生成） */
  async edit(
    messageId: string,
    dto: EditMessageDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<MessageResponseDto> {
    const doc = await this.getById(messageId, ownerId);
    if (doc.role === 'system') throw errBadRequest('系统消息不允许编辑');
    assertTextOnly(dto.content, 'content');
    doc.content = dto.content;
    doc.editedAt = new Date();
    doc.genInfo = {};
    await doc.save();
    return this.toResponse(doc);
  }

  async addBookmark(
    messageId: string,
    dto: AddBookmarkDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<MessageResponseDto> {
    const doc = await this.getById(messageId, ownerId);
    if (dto.note) assertTextOnly(dto.note, 'note');
    const bookmarkId = newId('bmk');
    doc.bookmarks.push({
      id: bookmarkId,
      label: dto.label?.trim() || '书签',
      note: dto.note ?? undefined,
      createdAt: new Date().toISOString(),
    });
    await doc.save();
    return this.toResponse(doc);
  }

  async removeBookmark(
    messageId: string,
    bookmarkId: string,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<MessageResponseDto> {
    const doc = await this.getById(messageId, ownerId);
    const before = doc.bookmarks.length;
    doc.bookmarks = doc.bookmarks.filter((b) => b.id !== bookmarkId);
    if (doc.bookmarks.length === before) throw errNotFound('书签', bookmarkId);
    await doc.save();
    return this.toResponse(doc);
  }

  async listBookmarks(
    conversationId: string,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<MessageResponseDto[]> {
    const docs = await this.model
      .find({ conversationId, ownerId, 'bookmarks.0': { $exists: true } })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.toResponse(d));
  }

  /** 删除会话时级联清理全部消息 */
  async removeAll(conversationId: string, ownerId = DEFAULT_OWNER_ID): Promise<void> {
    await this.model.deleteMany({ conversationId, ownerId }).exec();
  }

  /** 运行失败后标记指定消息 */
  async markMessageStatus(
    messageId: string,
    status: ChatMessage['status'],
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<void> {
    await this.model.updateOne({ id: messageId, ownerId }, { $set: { status } }).exec();
  }

  private toResponse(doc: ChatMessageDocument | ChatMessage): MessageResponseDto {
    const d = doc as unknown as ChatMessage;
    return {
      id: d.id,
      conversationId: d.conversationId,
      role: d.role,
      content: d.content,
      status: d.status,
      references: d.references ?? {},
      genInfo: (d.genInfo ?? {}) as Record<string, unknown>,
      bookmarks: (d.bookmarks ?? []) as unknown as Array<Record<string, unknown>>,
      editedAt: toIsoOrNull(d.editedAt as Date | null | undefined),
      createdAt: toIso(d.createdAt as Date | null | undefined) ?? '',
      updatedAt: toIso(d.updatedAt as Date | null | undefined) ?? '',
    };
  }
}
