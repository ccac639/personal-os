import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  Conversation,
  ConversationDocument,
  defaultModelSettings,
  newConversationId,
} from './schemas/conversation.schema.js';
import {
  ConversationQueryDto,
  ConversationResponseDto,
  CreateConversationDto,
  PatchConversationStateDto,
  UpdateConversationDto,
} from './dto/conversation.dto.js';
import { DEFAULT_OWNER_ID } from './chat.constants.js';
import { errNotFound } from './chat.errors.js';
import { normalizePage, normalizePageSize, Paginated } from './chat.pagination.js';
import { escapeRegExp } from './chat.security.js';

/** 会话 CRUD / 固定 / 归档 / 收藏 / 标题 / 模型设置 / 系统提示词 */
@Injectable()
export class ConversationsService {
  constructor(@InjectModel(Conversation.name) private readonly model: Model<Conversation>) {}

  async create(
    dto: CreateConversationDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<ConversationResponseDto> {
    const now = new Date();
    const doc = await this.model.create({
      id: newConversationId(),
      ownerId,
      title: dto.title?.trim() || '新对话',
      systemPrompt: dto.systemPrompt ?? '',
      modelSettings: dto.modelSettings
        ? this.mergeModelSettings(dto.modelSettings)
        : defaultModelSettings(),
      agentId: dto.agentId ?? null,
      messageCount: 0,
      lastMessageAt: null,
      pinned: false,
      archived: false,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    });
    return this.toResponse(doc);
  }

  async list(
    query: ConversationQueryDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<Paginated<ConversationResponseDto>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const filter: Record<string, unknown> = { ownerId };
    if (query.archived === null) {
      // 显式 null：查全部（含归档），不加过滤
    } else if (query.archived === undefined) {
      // 默认不查已归档
      filter['archived'] = false;
    } else {
      filter['archived'] = query.archived;
    }
    if (query.pinned !== undefined) filter['pinned'] = query.pinned;
    if (query.favorite !== undefined) filter['favorite'] = query.favorite;
    if (query.agentId) filter['agentId'] = query.agentId;
    if (query.q) {
      const rx = new RegExp(escapeRegExp(query.q), 'i');
      filter['$or'] = [{ title: rx }, { systemPrompt: rx }];
    }
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ pinned: -1, updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items: items.map((d) => this.toResponse(d)), total, page, pageSize };
  }

  async get(id: string, ownerId = DEFAULT_OWNER_ID): Promise<ConversationResponseDto> {
    const doc = await this.findOwned(id, ownerId);
    return this.toResponse(doc);
  }

  async update(
    id: string,
    dto: UpdateConversationDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<ConversationResponseDto> {
    const doc = await this.findOwned(id, ownerId);
    if (dto.title !== undefined) doc.title = dto.title?.trim() || '新对话';
    if (dto.systemPrompt !== undefined) doc.systemPrompt = dto.systemPrompt;
    if (dto.modelSettings)
      doc.modelSettings = this.mergeModelSettings(dto.modelSettings, doc.modelSettings);
    await doc.save();
    return this.toResponse(doc);
  }

  async patchState(
    id: string,
    dto: PatchConversationStateDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<ConversationResponseDto> {
    const doc = await this.findOwned(id, ownerId);
    if (dto.pinned !== undefined) doc.pinned = dto.pinned;
    if (dto.archived !== undefined) doc.archived = dto.archived;
    if (dto.favorite !== undefined) doc.favorite = dto.favorite;
    await doc.save();
    return this.toResponse(doc);
  }

  async remove(id: string, ownerId = DEFAULT_OWNER_ID): Promise<void> {
    const res = await this.model.deleteOne({ id, ownerId }).exec();
    if (res.deletedCount === 0) throw errNotFound('会话', id);
  }

  /** 由 MessagesService 在追加消息后调用：更新计数与最近活动时间 */
  async touch(id: string, ownerId = DEFAULT_OWNER_ID): Promise<void> {
    await this.model
      .updateOne(
        { id, ownerId },
        { $inc: { messageCount: 1 }, $set: { lastMessageAt: new Date() } },
      )
      .exec();
  }

  /** 由智能体模块调用：以指定模型设置创建会话 */
  async createForAgent(params: {
    agentId: string;
    title?: string;
    systemPrompt?: string;
    modelSettings?: CreateConversationDto['modelSettings'];
    ownerId?: string;
  }): Promise<ConversationResponseDto> {
    return this.create(
      {
        title: params.title,
        systemPrompt: params.systemPrompt,
        modelSettings: params.modelSettings,
        agentId: params.agentId,
      },
      params.ownerId,
    );
  }

  /** 用第一条用户消息自动生成标题（供消息服务调用） */
  async autoTitle(id: string, ownerId = DEFAULT_OWNER_ID, fromText?: string): Promise<void> {
    if (!fromText) return;
    const clean = fromText.trim().replace(/\s+/g, ' ');
    const title = clean.length > 30 ? `${clean.slice(0, 30)}…` : clean;
    await this.model.updateOne({ id, ownerId, title: '新对话' }, { $set: { title } }).exec();
  }

  private async findOwned(id: string, ownerId: string): Promise<ConversationDocument> {
    const doc = await this.model.findOne({ id, ownerId }).exec();
    if (!doc) throw errNotFound('会话', id);
    return doc;
  }

  private mergeModelSettings(
    incoming: NonNullable<CreateConversationDto['modelSettings']>,
    base?: Conversation['modelSettings'],
  ): Conversation['modelSettings'] {
    return {
      provider: incoming.provider ?? base?.provider ?? defaultModelSettings().provider,
      model: incoming.model ?? base?.model ?? defaultModelSettings().model,
      temperature: incoming.temperature ?? base?.temperature ?? defaultModelSettings().temperature,
      maxTokens: incoming.maxTokens ?? base?.maxTokens ?? defaultModelSettings().maxTokens,
    };
  }

  private toResponse(doc: ConversationDocument | Conversation): ConversationResponseDto {
    return {
      id: doc.id,
      title: doc.title,
      systemPrompt: doc.systemPrompt || undefined,
      modelSettings: {
        provider: doc.modelSettings.provider,
        model: doc.modelSettings.model,
        temperature: doc.modelSettings.temperature,
        maxTokens: doc.modelSettings.maxTokens,
      },
      pinned: doc.pinned,
      archived: doc.archived,
      favorite: doc.favorite,
      agentId: doc.agentId ?? null,
      messageCount: doc.messageCount,
      lastMessageAt: doc.lastMessageAt ? doc.lastMessageAt.toISOString() : null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
