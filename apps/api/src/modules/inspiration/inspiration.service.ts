import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  Inspiration,
  InspirationDocument,
  fingerprintOf,
  newInspirationId,
} from './inspiration.schema.js';
import {
  CreateInspirationDto,
  ImportInspirationsDto,
  ImportResultDto,
  InspirationImportItemDto,
  InspirationQueryDto,
  InspirationResponseDto,
  PatchInspirationStateDto,
  UpdateInspirationDto,
} from './inspiration.dto.js';
import { MessagesService } from '../chat/messages.service.js';
import { DEFAULT_OWNER_ID, toIso } from '../chat/chat.constants.js';
import { errBadRequest, errNotFound } from '../chat/chat.errors.js';
import { normalizePage, normalizePageSize, Paginated } from '../chat/chat.pagination.js';
import { assertTextOnly, escapeRegExp } from '../chat/chat.security.js';

/** 灵感库：CRUD / 收藏 / 置顶 / 归档 / 标签筛选 / 从消息保存 / 导入导出 */
@Injectable()
export class InspirationsService {
  constructor(
    @InjectModel(Inspiration.name) private readonly model: Model<Inspiration>,
    private readonly messages: MessagesService,
  ) {}

  async create(
    dto: CreateInspirationDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<InspirationResponseDto> {
    assertTextOnly(dto.content, 'content');
    for (const tag of dto.tags ?? []) assertTextOnly(tag, 'tags');
    const doc = await this.model.create({
      id: newInspirationId(),
      ownerId,
      title: dto.title.trim(),
      content: dto.content,
      category: dto.category?.trim() || '未分类',
      source: dto.source ?? 'manual',
      tags: dto.tags ?? [],
      favorite: false,
      pinned: false,
      archived: false,
      sourceMessageId: null,
      sourceConversationId: null,
      fingerprint: fingerprintOf(dto.title, dto.content),
    });
    return this.toResponse(doc);
  }

  async list(
    query: InspirationQueryDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<Paginated<InspirationResponseDto>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const filter: Record<string, unknown> = { ownerId };
    if (query.archived === undefined || query.archived === null) {
      if (!query.archived) filter['archived'] = false;
    } else {
      filter['archived'] = query.archived;
    }
    if (query.category) filter['category'] = query.category;
    if (query.tag) filter['tags'] = query.tag;
    if (query.source) filter['source'] = query.source;
    if (query.favorite !== undefined) filter['favorite'] = query.favorite;
    if (query.pinned !== undefined) filter['pinned'] = query.pinned;
    if (query.q) {
      const rx = new RegExp(escapeRegExp(query.q), 'i');
      filter['$or'] = [{ title: rx }, { content: rx }];
    }
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ pinned: -1, updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items: items.map((d) => this.toResponse(d)), total, page, pageSize };
  }

  async get(id: string, ownerId = DEFAULT_OWNER_ID): Promise<InspirationResponseDto> {
    const doc = await this.findOwned(id, ownerId);
    return this.toResponse(doc);
  }

  async update(
    id: string,
    dto: UpdateInspirationDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<InspirationResponseDto> {
    const doc = await this.findOwned(id, ownerId);
    if (dto.content !== undefined) assertTextOnly(dto.content, 'content');
    if (dto.title !== undefined) doc.title = dto.title.trim();
    if (dto.content !== undefined) doc.content = dto.content;
    if (dto.category !== undefined) doc.category = dto.category.trim() || '未分类';
    if (dto.tags !== undefined) {
      for (const tag of dto.tags) assertTextOnly(tag, 'tags');
      doc.tags = dto.tags;
    }
    doc.fingerprint = fingerprintOf(doc.title, doc.content);
    await doc.save();
    return this.toResponse(doc);
  }

  async patchState(
    id: string,
    dto: PatchInspirationStateDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<InspirationResponseDto> {
    const doc = await this.findOwned(id, ownerId);
    if (dto.favorite !== undefined) doc.favorite = dto.favorite;
    if (dto.pinned !== undefined) doc.pinned = dto.pinned;
    if (dto.archived !== undefined) doc.archived = dto.archived;
    await doc.save();
    return this.toResponse(doc);
  }

  async remove(id: string, ownerId = DEFAULT_OWNER_ID): Promise<void> {
    const res = await this.model.deleteOne({ id, ownerId }).exec();
    if (res.deletedCount === 0) throw errNotFound('灵感', id);
  }

  /** 从消息保存为灵感 */
  async saveFromMessage(
    conversationId: string,
    messageId: string,
    dto: Partial<CreateInspirationDto>,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<InspirationResponseDto> {
    const message = await this.messages.getById(messageId, ownerId);
    if (message.conversationId !== conversationId) throw errBadRequest('消息不属于该会话');
    const content = message.content;
    const title = dto.title?.trim() || content.replace(/\s+/g, ' ').slice(0, 60);
    return this.create(
      {
        title,
        content,
        category: dto.category,
        tags: dto.tags,
        source: 'chat',
      },
      ownerId,
    ).then(async (created) => {
      await this.model
        .updateOne(
          { id: created.id },
          { $set: { sourceMessageId: messageId, sourceConversationId: conversationId } },
        )
        .exec();
      return this.get(created.id, ownerId);
    });
  }

  /** 导入：逐条校验 + 重复策略（id 或 标题+内容指纹 判定重复） */
  async importItems(
    dto: ImportInspirationsDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<ImportResultDto> {
    const result: ImportResultDto = {
      imported: 0,
      overwritten: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };
    for (let i = 0; i < dto.items.length; i += 1) {
      const item = dto.items[i];
      if (!item) continue;
      try {
        this.validateImportItem(item);
        const fingerprint = fingerprintOf(item.title, item.content);
        // 判重契约：携带显式 id → 仅按 id 判重（幂等键）；无 id → 按指纹判重（内容级）
        const existing = item.id
          ? await this.model.findOne({ ownerId, id: item.id }).exec()
          : await this.model.findOne({ ownerId, fingerprint }).exec();

        if (existing) {
          if (dto.duplicatePolicy === 'skip') {
            result.skipped += 1;
            continue;
          }
          if (dto.duplicatePolicy === 'overwrite') {
            if (!dto.dryRun) {
              existing.title = item.title.trim();
              existing.content = item.content;
              existing.category = item.category?.trim() || existing.category;
              if (item.tags) existing.tags = item.tags;
              if (item.source) existing.source = item.source;
              existing.fingerprint = fingerprint;
              await existing.save();
            }
            result.overwritten += 1;
            continue;
          }
          // keep-both：与既有重复，但保留两者 → 走新建分支
        }
        if (!dto.dryRun) {
          await this.model.create({
            id: item.id ?? newInspirationId(),
            ownerId,
            title: item.title.trim(),
            content: item.content,
            category: item.category?.trim() || '未分类',
            source: item.source ?? 'import',
            tags: item.tags ?? [],
            favorite: false,
            pinned: false,
            archived: false,
            sourceMessageId: null,
            sourceConversationId: null,
            fingerprint,
            createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
          });
        }
        result.imported += 1;
      } catch (err) {
        result.failed += 1;
        result.errors?.push({
          index: i,
          message: err instanceof Error ? err.message : '校验失败',
        });
      }
    }
    return result;
  }

  /** 导出：与导入条目同构 */
  async exportItems(
    query: InspirationQueryDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<InspirationImportItemDto[]> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const docs = await this.model
      .find({ ownerId, archived: { $ne: true } })
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()
      .exec();
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      content: d.content,
      category: d.category === '未分类' ? undefined : d.category,
      tags: d.tags.length ? d.tags : undefined,
      source: d.source === 'manual' ? undefined : d.source,
      createdAt: toIso(d.createdAt as Date | null | undefined) ?? undefined,
    }));
  }

  private validateImportItem(item: InspirationImportItemDto): void {
    if (!item.title?.trim()) throw errBadRequest('标题为空');
    if (!item.content?.trim()) throw errBadRequest('内容为空');
    if (item.title.length > 200) throw errBadRequest('标题超长（>200）');
    if (item.content.length > 20_000) throw errBadRequest('内容超长（>20000）');
    assertTextOnly(item.content, 'content');
    if (item.category && item.category.length > 50) throw errBadRequest('分类超长（>50）');
    if (item.tags && item.tags.length > 10) throw errBadRequest('标签超过 10 个');
    for (const tag of item.tags ?? []) {
      if (tag.length > 50) throw errBadRequest('标签超长（>50）');
      assertTextOnly(tag, 'tags');
    }
  }

  private async findOwned(id: string, ownerId: string): Promise<InspirationDocument> {
    const doc = await this.model.findOne({ id, ownerId }).exec();
    if (!doc) throw errNotFound('灵感', id);
    return doc;
  }

  private toResponse(doc: InspirationDocument | Inspiration): InspirationResponseDto {
    const d = doc as unknown as Inspiration;
    return {
      id: d.id,
      title: d.title,
      content: d.content,
      category: d.category,
      source: d.source,
      tags: d.tags ?? [],
      favorite: d.favorite,
      pinned: d.pinned,
      archived: d.archived,
      sourceMessageId: d.sourceMessageId ?? null,
      sourceConversationId: d.sourceConversationId ?? null,
      createdAt: toIso(d.createdAt as Date | null | undefined) ?? '',
      updatedAt: toIso(d.updatedAt as Date | null | undefined) ?? '',
    };
  }
}
