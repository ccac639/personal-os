import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import {
  AssetNodeData,
  ThreeDProject,
  ThreeDProjectDocument,
  newAssetId,
  newCharacterId,
  newProjectId,
  newRegionId,
  newShotId,
} from './three-d.schema.js';
import { THREE_D_TEMPLATES } from './three-d-templates.js';
import {
  CharacterDto,
  CreateAssetDto,
  CreateProjectDto,
  GenerationBriefDto,
  MoveAssetDto,
  ProjectQueryDto,
  ProjectResponseDto,
  StoryboardShotDto,
  UpdateAssetDto,
  UpdateProjectDto,
  WorldRegionDto,
} from './three-d.dto.js';
import { DEFAULT_OWNER_ID, toIso } from '../chat/chat.constants.js';
import { errBadRequest, errNotFound } from '../chat/chat.errors.js';
import { normalizePage, normalizePageSize, Paginated } from '../chat/chat.pagination.js';
import { assertTextOnly, escapeRegExp } from '../chat/chat.security.js';

/** 资产树节点（响应结构） */
export interface AssetTreeNode extends AssetNodeData {
  children: AssetTreeNode[];
}

/** 3D 项目：CRUD / 资产树 / 模板 / 角色 / 区域 / 分镜 / 简报（仅结构化元数据） */
@Injectable()
export class ThreeDService {
  constructor(@InjectModel(ThreeDProject.name) private readonly model: Model<ThreeDProject>) {}

  // ---------- 项目 CRUD ----------

  async create(dto: CreateProjectDto, ownerId = DEFAULT_OWNER_ID): Promise<ProjectResponseDto> {
    assertTextOnly(dto.name, 'name');
    if (dto.description) assertTextOnly(dto.description, 'description');
    const template = THREE_D_TEMPLATES.find((t) => t.id === `tpl_${dto.template ?? 'blank'}`);
    if (!template) throw errBadRequest('模板不存在');
    const instanced = this.instantiateTemplate(template.defaults);
    const doc = await this.model.create({
      id: newProjectId(),
      ownerId,
      name: dto.name.trim(),
      description: dto.description ?? '',
      template: dto.template ?? 'blank',
      tags: dto.tags ?? [],
      favorite: false,
      archived: false,
      assets: instanced.assets,
      characters: instanced.characters,
      worldRegions: instanced.worldRegions,
      storyboards: instanced.storyboards,
      brief: instanced.brief ?? null,
    });
    return this.toResponse(doc);
  }

  async list(
    query: ProjectQueryDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<Paginated<ProjectResponseDto>> {
    const page = normalizePage(query.page);
    const pageSize = normalizePageSize(query.pageSize);
    const filter: Record<string, unknown> = { ownerId };
    if (query.archived === undefined || query.archived === null) {
      if (!query.archived) filter['archived'] = false;
    } else {
      filter['archived'] = query.archived;
    }
    if (query.tag) filter['tags'] = query.tag;
    if (query.template) filter['template'] = query.template;
    if (query.favorite !== undefined) filter['favorite'] = query.favorite;
    if (query.q) {
      const rx = new RegExp(escapeRegExp(query.q), 'i');
      filter['$or'] = [{ name: rx }, { description: rx }];
    }
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items: items.map((d) => this.toResponse(d)), total, page, pageSize };
  }

  async get(id: string, ownerId = DEFAULT_OWNER_ID): Promise<ProjectResponseDto> {
    const doc = await this.findOwned(id, ownerId);
    return this.toResponse(doc);
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<ProjectResponseDto> {
    const doc = await this.findOwned(id, ownerId);
    if (dto.name !== undefined) {
      assertTextOnly(dto.name, 'name');
      doc.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      assertTextOnly(dto.description, 'description');
      doc.description = dto.description;
    }
    if (dto.tags !== undefined) doc.tags = dto.tags;
    if (dto.favorite !== undefined) doc.favorite = dto.favorite;
    if (dto.archived !== undefined) doc.archived = dto.archived;
    await doc.save();
    return this.toResponse(doc);
  }

  async remove(id: string, ownerId = DEFAULT_OWNER_ID): Promise<void> {
    const res = await this.model.deleteOne({ id, ownerId }).exec();
    if (res.deletedCount === 0) throw errNotFound('3D 项目', id);
  }

  // ---------- 资产树 ----------

  async getTree(
    id: string,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<{ assets: AssetNodeData[]; tree: AssetTreeNode[] }> {
    const doc = await this.findOwned(id, ownerId);
    return { assets: doc.assets, tree: this.buildTree(doc.assets) };
  }

  async addAsset(
    id: string,
    dto: CreateAssetDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<AssetNodeData> {
    const doc = await this.findOwned(id, ownerId);
    assertTextOnly(dto.name, 'name');
    this.validateMeta(dto.meta);
    this.assertParentExists(doc, dto.parentId ?? null);
    const node: AssetNodeData = {
      id: newAssetId(),
      parentId: dto.parentId ?? null,
      name: dto.name.trim(),
      kind: dto.kind,
      meta: dto.meta ?? {},
    };
    doc.assets.push(node);
    await doc.save();
    return node;
  }

  async updateAsset(
    id: string,
    nodeId: string,
    dto: UpdateAssetDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<AssetNodeData> {
    const doc = await this.findOwned(id, ownerId);
    const node = this.findNode(doc, nodeId);
    if (dto.name !== undefined) {
      assertTextOnly(dto.name, 'name');
      node.name = dto.name.trim();
    }
    if (dto.meta !== undefined) {
      this.validateMeta(dto.meta);
      node.meta = dto.meta;
    }
    await doc.save();
    return node;
  }

  async moveAsset(
    id: string,
    nodeId: string,
    dto: MoveAssetDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<AssetNodeData> {
    const doc = await this.findOwned(id, ownerId);
    const node = this.findNode(doc, nodeId);
    const newParentId = dto.parentId ?? null;
    if (newParentId !== null) {
      if (newParentId === nodeId) throw errBadRequest('不能将节点挂载到自身');
      this.assertParentExists(doc, newParentId);
    }
    this.assertNoCycle(doc, nodeId, newParentId);
    node.parentId = newParentId;
    await doc.save();
    return node;
  }

  async removeAsset(id: string, nodeId: string, ownerId = DEFAULT_OWNER_ID): Promise<void> {
    const doc = await this.findOwned(id, ownerId);
    const hasChildren = doc.assets.some((a) => a.parentId === nodeId);
    if (hasChildren) throw errBadRequest('该节点存在子节点，请先删除子节点');
    const before = doc.assets.length;
    doc.assets = doc.assets.filter((a) => a.id !== nodeId);
    if (doc.assets.length === before) throw errNotFound('资产节点', nodeId);
    await doc.save();
  }

  // ---------- 角色 / 区域 / 分镜 ----------

  async addCharacter(
    id: string,
    dto: CharacterDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<CharacterDto & { id: string }> {
    const doc = await this.findOwned(id, ownerId);
    this.validateTextBag(dto);
    const entry = {
      id: newCharacterId(),
      name: dto.name.trim(),
      description: dto.description ?? '',
      role: dto.role ?? 'character',
      appearance: dto.appearance ?? {},
      props: dto.props ?? [],
    };
    doc.characters.push(entry);
    await doc.save();
    return entry;
  }

  async updateCharacter(
    id: string,
    characterId: string,
    dto: CharacterDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<CharacterDto & { id: string }> {
    const doc = await this.findOwned(id, ownerId);
    const entry = doc.characters.find((c) => c.id === characterId);
    if (!entry) throw errNotFound('角色', characterId);
    this.validateTextBag(dto);
    if (dto.name !== undefined) entry.name = dto.name.trim();
    if (dto.description !== undefined) entry.description = dto.description;
    if (dto.role !== undefined) entry.role = dto.role;
    if (dto.appearance !== undefined) entry.appearance = dto.appearance;
    if (dto.props !== undefined) entry.props = dto.props;
    await doc.save();
    return entry;
  }

  async removeCharacter(
    id: string,
    characterId: string,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<void> {
    const doc = await this.findOwned(id, ownerId);
    const before = doc.characters.length;
    doc.characters = doc.characters.filter((c) => c.id !== characterId);
    if (doc.characters.length === before) throw errNotFound('角色', characterId);
    await doc.save();
  }

  async addRegion(
    id: string,
    dto: WorldRegionDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<WorldRegionDto & { id: string }> {
    const doc = await this.findOwned(id, ownerId);
    this.validateTextBag(dto);
    const entry = {
      id: newRegionId(),
      name: dto.name.trim(),
      description: dto.description ?? '',
      bounds: dto.bounds ?? { x: 0, y: 0, z: 0, w: 10, h: 10, d: 10 },
      tags: dto.tags ?? [],
    };
    doc.worldRegions.push(entry);
    await doc.save();
    return entry;
  }

  async updateRegion(
    id: string,
    regionId: string,
    dto: WorldRegionDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<WorldRegionDto & { id: string }> {
    const doc = await this.findOwned(id, ownerId);
    const entry = doc.worldRegions.find((r) => r.id === regionId);
    if (!entry) throw errNotFound('世界区域', regionId);
    this.validateTextBag(dto);
    if (dto.name !== undefined) entry.name = dto.name.trim();
    if (dto.description !== undefined) entry.description = dto.description;
    if (dto.bounds !== undefined) entry.bounds = dto.bounds;
    if (dto.tags !== undefined) entry.tags = dto.tags;
    await doc.save();
    return entry;
  }

  async removeRegion(id: string, regionId: string, ownerId = DEFAULT_OWNER_ID): Promise<void> {
    const doc = await this.findOwned(id, ownerId);
    const before = doc.worldRegions.length;
    doc.worldRegions = doc.worldRegions.filter((r) => r.id !== regionId);
    if (doc.worldRegions.length === before) throw errNotFound('世界区域', regionId);
    await doc.save();
  }

  async addShot(
    id: string,
    dto: StoryboardShotDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<StoryboardShotDto & { id: string }> {
    const doc = await this.findOwned(id, ownerId);
    this.validateTextBag(dto);
    const entry = {
      id: newShotId(),
      name: dto.name.trim(),
      description: dto.description ?? '',
      sequence: dto.sequence ?? doc.storyboards.length + 1,
      durationSeconds: dto.durationSeconds ?? 5,
      camera: dto.camera
        ? {
            position: dto.camera.position.slice(0, 3) as [number, number, number],
            target: dto.camera.target.slice(0, 3) as [number, number, number],
            fov: dto.camera.fov,
          }
        : {
            position: [0, 1.6, 3.5] as [number, number, number],
            target: [0, 1, 0] as [number, number, number],
            fov: 45,
          },
    };
    doc.storyboards.push(entry);
    await doc.save();
    return entry;
  }

  async updateShot(
    id: string,
    shotId: string,
    dto: StoryboardShotDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<StoryboardShotDto & { id: string }> {
    const doc = await this.findOwned(id, ownerId);
    const entry = doc.storyboards.find((s) => s.id === shotId);
    if (!entry) throw errNotFound('分镜', shotId);
    this.validateTextBag(dto);
    if (dto.name !== undefined) entry.name = dto.name.trim();
    if (dto.description !== undefined) entry.description = dto.description;
    if (dto.sequence !== undefined) entry.sequence = dto.sequence;
    if (dto.durationSeconds !== undefined) entry.durationSeconds = dto.durationSeconds;
    if (dto.camera !== undefined) {
      entry.camera = {
        position: dto.camera.position.slice(0, 3) as [number, number, number],
        target: dto.camera.target.slice(0, 3) as [number, number, number],
        fov: dto.camera.fov,
      };
    }
    await doc.save();
    return entry;
  }

  async removeShot(id: string, shotId: string, ownerId = DEFAULT_OWNER_ID): Promise<void> {
    const doc = await this.findOwned(id, ownerId);
    const before = doc.storyboards.length;
    doc.storyboards = doc.storyboards.filter((s) => s.id !== shotId);
    if (doc.storyboards.length === before) throw errNotFound('分镜', shotId);
    await doc.save();
  }

  // ---------- 生成简报 ----------

  async upsertBrief(
    id: string,
    dto: GenerationBriefDto,
    ownerId = DEFAULT_OWNER_ID,
  ): Promise<GenerationBriefDto> {
    const doc = await this.findOwned(id, ownerId);
    assertTextOnly(dto.prompt, 'prompt');
    if (dto.negativePrompt) assertTextOnly(dto.negativePrompt, 'negativePrompt');
    if (dto.style) assertTextOnly(dto.style, 'style');
    doc.brief = {
      prompt: dto.prompt,
      negativePrompt: dto.negativePrompt ?? '',
      style: dto.style ?? '',
      targetEngine: dto.targetEngine ?? 'threejs',
      aspectRatio: dto.aspectRatio ?? '16:9',
      quality: dto.quality ?? 'standard',
      createdAt: new Date().toISOString(),
    };
    await doc.save();
    return doc.brief;
  }

  async clearBrief(id: string, ownerId = DEFAULT_OWNER_ID): Promise<void> {
    const doc = await this.findOwned(id, ownerId);
    doc.brief = null;
    await doc.save();
  }

  // ---------- 模板 ----------

  templates(): typeof THREE_D_TEMPLATES {
    return THREE_D_TEMPLATES;
  }

  // ---------- 内部工具 ----------

  private instantiateTemplate(defaults: (typeof THREE_D_TEMPLATES)[number]['defaults']): {
    assets: AssetNodeData[];
    characters: ThreeDProject['characters'];
    worldRegions: ThreeDProject['worldRegions'];
    storyboards: ThreeDProject['storyboards'];
    brief: ThreeDProject['brief'];
  } {
    const idMap = new Map<string, string>();
    const assets: AssetNodeData[] = defaults.assets.map((a) => {
      const fresh = newAssetId();
      idMap.set(a.id, fresh);
      return { ...a, id: fresh };
    });
    assets.forEach((a) => {
      if (a.parentId && idMap.has(a.parentId)) a.parentId = idMap.get(a.parentId)!;
    });
    return {
      assets,
      characters: defaults.characters.map((c) => ({ ...c, id: newCharacterId() })),
      worldRegions: defaults.worldRegions.map((r) => ({ ...r, id: newRegionId() })),
      storyboards: defaults.storyboards.map((s) => ({ ...s, id: newShotId() })),
      brief: defaults.brief ? { ...defaults.brief, createdAt: new Date().toISOString() } : null,
    };
  }

  /** 组装嵌套树（带环保护：异常数据时跳过已访问节点） */
  private buildTree(assets: AssetNodeData[]): AssetTreeNode[] {
    const nodes = new Map<string, AssetTreeNode>();
    assets.forEach((a) => nodes.set(a.id, { ...a, children: [] }));
    const roots: AssetTreeNode[] = [];
    const visited = new Set<string>();
    for (const node of assets) {
      if (!node.parentId) {
        const root = nodes.get(node.id);
        if (root) roots.push(root);
        continue;
      }
      const parent = nodes.get(node.parentId);
      if (!parent || visited.has(node.parentId)) {
        // 悬空父节点（数据异常）：按根节点处理
        const orphan = nodes.get(node.id);
        if (orphan) roots.push(orphan);
        continue;
      }
      parent.children.push(nodes.get(node.id)!);
      visited.add(node.id);
    }
    return roots;
  }

  private assertParentExists(doc: ThreeDProjectDocument, parentId: string | null): void {
    if (parentId === null) return;
    if (!doc.assets.some((a) => a.id === parentId)) throw errNotFound('资产节点', parentId);
  }

  /** 从 newParent 向上追溯，若出现 nodeId 则构成环 */
  private assertNoCycle(
    doc: ThreeDProjectDocument,
    nodeId: string,
    newParentId: string | null,
  ): void {
    if (newParentId === null) return;
    let cursor: string | null = newParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === nodeId) throw errBadRequest('检测到循环引用，拒绝移动');
      if (seen.has(cursor)) throw errBadRequest('资产树结构异常（数据损坏）');
      seen.add(cursor);
      const parent = doc.assets.find((a) => a.id === cursor);
      if (!parent) throw errNotFound('资产节点', cursor);
      cursor = parent.parentId ?? null;
    }
  }

  private findNode(doc: ThreeDProjectDocument, nodeId: string): AssetNodeData {
    const node = doc.assets.find((a) => a.id === nodeId);
    if (!node) throw errNotFound('资产节点', nodeId);
    return node;
  }

  /** 元数据白名单：仅标量；字符串限长且拒绝二进制/外链 */
  private validateMeta(meta: Record<string, unknown> | undefined, field = 'meta'): void {
    if (!meta) return;
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === 'string') {
        if (value.length > 200) throw errBadRequest(`${field}.${key} 超长（>200）`);
        assertTextOnly(value, `${field}.${key}`);
      } else if (typeof value !== 'number' && typeof value !== 'boolean') {
        throw errBadRequest(`${field}.${key} 仅允许字符串/数字/布尔标量`);
      }
    }
  }

  /** 通用文本字段校验（拒绝二进制/外链载荷；name 级字段不允许 URL） */
  private validateTextBag(dto: object): void {
    const record = dto as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (typeof value !== 'string') continue;
      assertTextOnly(value, key);
    }
    for (const list of [record.props, record.tags]) {
      if (Array.isArray(list)) {
        for (const item of list) {
          if (typeof item === 'string') assertTextOnly(item, 'tags/props');
        }
      }
    }
    const appearance = record.appearance as Record<string, string> | undefined;
    if (appearance) {
      for (const [k, v] of Object.entries(appearance)) {
        if (typeof v !== 'string') throw errBadRequest(`appearance.${k} 仅允许字符串`);
        assertTextOnly(v, `appearance.${k}`);
      }
    }
  }

  private async findOwned(id: string, ownerId: string): Promise<ThreeDProjectDocument> {
    const doc = await this.model.findOne({ id, ownerId }).exec();
    if (!doc) throw errNotFound('3D 项目', id);
    return doc;
  }

  private toResponse(doc: ThreeDProjectDocument | ThreeDProject): ProjectResponseDto {
    const d = doc as unknown as ThreeDProject;
    return {
      id: d.id,
      name: d.name,
      description: d.description || undefined,
      template: d.template,
      tags: d.tags ?? [],
      favorite: d.favorite,
      archived: d.archived,
      assetCount: (d.assets ?? []).length,
      characterCount: (d.characters ?? []).length,
      regionCount: (d.worldRegions ?? []).length,
      shotCount: (d.storyboards ?? []).length,
      createdAt: toIso(d.createdAt as Date | null | undefined) ?? '',
      updatedAt: toIso(d.updatedAt as Date | null | undefined) ?? '',
    };
  }
}
