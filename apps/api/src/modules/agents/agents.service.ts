import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { Agent, AgentDocument, newAgentId } from './agent.schema.js';
import { BUILTIN_AGENTS } from './builtin-agents.js';
import { AgentQueryDto, AgentResponseDto, CreateAgentDto, UpdateAgentDto } from './agents.dto.js';
import { ConversationsService } from '../chat/conversations.service.js';
import { DEFAULT_OWNER_ID } from '../chat/chat.constants.js';
import { errBadRequest, errNotFound } from '../chat/chat.errors.js';
import { normalizePage, normalizePageSize, Paginated } from '../chat/chat.pagination.js';
import { escapeRegExp } from '../chat/chat.security.js';

const SYSTEM_OWNER = 'system';

/** 智能体：内置模板 + 个人变体；收藏/隐藏/最近使用/使用次数；启动会话 */
@Injectable()
export class AgentsService {
  constructor(
    @InjectModel(Agent.name) private readonly model: Model<Agent>,
    private readonly conversations: ConversationsService,
  ) {}

  /** 惰性种子：仅补种缺失的内置模板（不覆盖用户对内置项的收藏/隐藏） */
  private async seedBuiltinsIfNeeded(): Promise<void> {
    for (const seed of BUILTIN_AGENTS) {
      const exists = await this.model.findOne({ builtinKey: seed.builtinKey }).exec();
      if (exists) continue;
      await this.model.create({
        id: newAgentId(),
        ownerId: SYSTEM_OWNER,
        name: seed.name,
        description: seed.description,
        model: seed.model,
        provider: seed.provider,
        systemPrompt: seed.systemPrompt,
        kind: 'builtin',
        builtinKey: seed.builtinKey,
        favorite: false,
        hidden: false,
        enabled: true,
        usageCount: 0,
        lastUsedAt: null,
      });
    }
  }

  async list(
    query: AgentQueryDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<Paginated<AgentResponseDto>> {
    await this.seedBuiltinsIfNeeded();
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const filter: Record<string, unknown> = { $or: [{ ownerId }, { ownerId: SYSTEM_OWNER }] };
    if (query.kind) filter['kind'] = query.kind;
    if (!query.includeHidden) {
      filter['$and'] = [{ hidden: { $ne: true } }];
    }
    if (query.favorite !== undefined) filter['favorite'] = query.favorite;
    if (query.q) {
      const rx = new RegExp(escapeRegExp(query.q), 'i');
      const and = Array.isArray(filter['$and'])
        ? (filter['$and'] as Record<string, unknown>[])
        : [];
      filter['$and'] = [...and, { $or: [{ name: rx }, { description: rx }, { systemPrompt: rx }] }];
    }
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ favorite: -1, usageCount: -1, updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items: items.map((d) => this.toResponse(d)), total, page, pageSize };
  }

  async create(dto: CreateAgentDto, ownerId = DEFAULT_OWNER_ID): Promise<AgentResponseDto> {
    const doc = await this.model.create({
      id: newAgentId(),
      ownerId,
      name: dto.name.trim(),
      description: dto.description ?? '',
      model: dto.model ?? 'gpt-4o-mini',
      provider: dto.provider ?? 'openai',
      systemPrompt: dto.systemPrompt ?? '',
      kind: 'personal',
      builtinKey: null,
      favorite: dto.favorite ?? false,
      hidden: false,
      enabled: true,
      usageCount: 0,
      lastUsedAt: null,
    });
    return this.toResponse(doc);
  }

  /** 从内置模板派生个人变体 */
  async deriveFromBuiltin(
    builtinKey: string,
    overrides?: Partial<CreateAgentDto>,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<AgentResponseDto> {
    await this.seedBuiltinsIfNeeded();
    const builtin = await this.model.findOne({ builtinKey, ownerId: SYSTEM_OWNER }).exec();
    if (!builtin) throw errNotFound('内置模板', builtinKey);
    const doc = await this.model.create({
      id: newAgentId(),
      ownerId,
      name: overrides?.name?.trim() || `${builtin.name}（我的）`,
      description: overrides?.description ?? builtin.description,
      model: overrides?.model ?? builtin.model,
      provider: overrides?.provider ?? builtin.provider,
      systemPrompt: overrides?.systemPrompt ?? builtin.systemPrompt,
      kind: 'personal',
      builtinKey,
      favorite: overrides?.favorite ?? false,
      hidden: false,
      enabled: true,
      usageCount: 0,
      lastUsedAt: null,
    });
    return this.toResponse(doc);
  }

  async get(agentId: string, ownerId = DEFAULT_OWNER_ID): Promise<AgentResponseDto> {
    await this.seedBuiltinsIfNeeded();
    const doc = await this.findVisible(agentId, ownerId);
    return this.toResponse(doc);
  }

  async update(
    agentId: string,
    dto: UpdateAgentDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<AgentResponseDto> {
    const doc = await this.findOwnedOrSystem(agentId, ownerId);
    if (dto.name !== undefined) doc.name = dto.name.trim();
    if (dto.description !== undefined) doc.description = dto.description;
    if (dto.model !== undefined) doc.set('model', dto.model);
    if (dto.provider !== undefined) doc.provider = dto.provider;
    if (dto.systemPrompt !== undefined) doc.systemPrompt = dto.systemPrompt;
    if (dto.favorite !== undefined) doc.favorite = dto.favorite;
    if (dto.hidden !== undefined) doc.hidden = dto.hidden;
    if (dto.enabled !== undefined) doc.enabled = dto.enabled;
    await doc.save();
    return this.toResponse(doc);
  }

  async remove(agentId: string, ownerId = DEFAULT_OWNER_ID): Promise<void> {
    const doc = await this.findOwnedOrSystem(agentId, ownerId);
    if (doc.kind === 'builtin') throw errBadRequest('内置模板不可删除，可改为隐藏');
    const res = await this.model.deleteOne({ id: agentId, ownerId }).exec();
    if (res.deletedCount === 0) throw errNotFound('智能体', agentId);
  }

  /** 启动智能体：记录使用次数并创建 Chat 会话 */
  async startConversation(
    agentId: string,
    ownerId = DEFAULT_OWNER_ID,
    title?: string,
  ): Promise<{ agent: AgentResponseDto; conversationId: string }> {
    const doc = await this.findVisible(agentId, ownerId);
    if (!doc.enabled) throw errBadRequest('该智能体已停用');
    if (doc.hidden) throw errBadRequest('该智能体已隐藏');
    const conversation = await this.conversations.createForAgent({
      agentId: doc.id,
      title: title?.trim() || doc.name,
      systemPrompt: doc.systemPrompt,
      modelSettings: { provider: doc.provider, model: doc.model, temperature: 0.7, maxTokens: 500 },
      ownerId,
    });
    doc.usageCount += 1;
    doc.lastUsedAt = new Date();
    await doc.save();
    return { agent: this.toResponse(doc), conversationId: conversation.id };
  }

  /** 最近使用（供前端快捷入口） */
  async recent(limit = 10, ownerId = DEFAULT_OWNER_ID): Promise<AgentResponseDto[]> {
    await this.seedBuiltinsIfNeeded();
    const docs = await this.model
      .find({
        $or: [{ ownerId }, { ownerId: SYSTEM_OWNER }],
        hidden: { $ne: true },
        enabled: true,
        lastUsedAt: { $ne: null },
      })
      .sort({ lastUsedAt: -1 })
      .limit(Math.min(50, Math.max(1, limit)))
      .lean()
      .exec();
    return docs.map((d) => this.toResponse(d));
  }

  private async findVisible(agentId: string, ownerId: string): Promise<AgentDocument> {
    const doc = await this.model
      .findOne({ id: agentId, $or: [{ ownerId }, { ownerId: SYSTEM_OWNER }] })
      .exec();
    if (!doc) throw errNotFound('智能体', agentId);
    return doc;
  }

  private async findOwnedOrSystem(agentId: string, ownerId: string): Promise<AgentDocument> {
    const doc = await this.model
      .findOne({ id: agentId, $or: [{ ownerId }, { ownerId: SYSTEM_OWNER }] })
      .exec();
    if (!doc) throw errNotFound('智能体', agentId);
    return doc;
  }

  private toResponse(doc: AgentDocument | Agent): AgentResponseDto {
    const d = doc as unknown as Agent;
    return {
      id: d.id,
      name: d.name,
      description: d.description || undefined,
      model: d.model,
      provider: d.provider,
      systemPrompt: d.systemPrompt || undefined,
      kind: d.kind,
      builtinKey: d.builtinKey ?? null,
      favorite: d.favorite,
      hidden: d.hidden,
      enabled: d.enabled,
      usageCount: d.usageCount,
      lastUsedAt: d.lastUsedAt ? new Date(d.lastUsedAt).toISOString() : null,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : '',
    };
  }
}
