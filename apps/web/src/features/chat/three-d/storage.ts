/**
 * Chat 功能域 —— 3D 工作台持久化仓库
 *
 * - key：personal-os.chat.3d.v2，信封 { version: 2, data: { projects, ui, presets, templates } }
 * - zod 结构校验：损坏 / 版本过新安全回退默认值（不清除原始数据），返回恢复标志
 * - v1（personal-os.chat.3d.v1）自动迁移：读旧信封 → 逐项目归一化 → 写 v2；幂等
 * - 只存结构化项目数据与 UI 偏好，绝不写入 WebGL 对象 / 纹理二进制 / 文件内容
 * - 迁移入口 migrateThreeDV0：处理裸项目数组 / 旧信封
 */
import {
  defaultUiState,
  seedProjects,
  THREE_D_STORAGE_KEY,
  THREE_D_STORAGE_KEY_V1,
  THREE_D_STORAGE_VERSION,
} from './constants';
import { cloneProject, enforceProjectLimit, normalizeProject } from './domain';
import { storageEnvelopeV1Schema, storageEnvelopeSchema } from './validation';
import type { AssetPreset, ThreeDProject, ThreeDProjectTemplate, ThreeDUiState } from './types';

export { THREE_D_STORAGE_KEY, THREE_D_STORAGE_KEY_V1, THREE_D_STORAGE_VERSION };

/** 深拷贝（JSON 往返；预设/模板只含纯数据） */
function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface ThreeDWorkspaceLoadResult {
  projects: ThreeDProject[];
  ui: ThreeDUiState;
  presets: AssetPreset[];
  templates: ThreeDProjectTemplate[];
  /** 数据损坏 / 结构非法，已回退默认值 */
  recovered: boolean;
  /** 数据版本过新（保留原数据，仅展示提示） */
  tooNew: boolean;
  /** 已从 v1 自动迁移到 v2 */
  migrated: boolean;
  /** 写入失败标志（上次保存失败） */
  writeFailed: boolean;
}

/** 首次使用：播种 3 个本地 mock 概念项目（角色 / 世界 / 道具）。 */
export function initialProjects(): ThreeDProject[] {
  return seedProjects();
}

function readEnvelope(key: string): { raw: string; parsed: unknown } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return { raw, parsed: JSON.parse(raw) };
    } catch {
      return { raw, parsed: null };
    }
  } catch {
    return null;
  }
}

export function loadThreeDWorkspace(): ThreeDWorkspaceLoadResult {
  const result: ThreeDWorkspaceLoadResult = {
    projects: initialProjects(),
    ui: defaultUiState(),
    presets: [],
    templates: [],
    recovered: false,
    tooNew: false,
    migrated: false,
    writeFailed: false,
  };
  const current = readEnvelope(THREE_D_STORAGE_KEY);
  if (!current) {
    // v2 不存在：尝试 v1 迁移
    const legacy = readEnvelope(THREE_D_STORAGE_KEY_V1);
    if (legacy) {
      const migrated = migrateV1Envelope(legacy.parsed);
      if (migrated) {
        result.projects = migrated.projects;
        result.ui = { ...defaultUiState(), ...migrated.ui };
        result.migrated = true;
        saveThreeDWorkspace(result.projects, result.ui, [], []);
        return result;
      }
      result.recovered = true;
      saveThreeDWorkspace(result.projects, result.ui, [], []);
      return result;
    }
    // 首次使用：写入种子数据
    saveThreeDWorkspace(result.projects, result.ui, [], []);
    return result;
  }
  if (current.parsed === null || typeof current.parsed !== 'object') {
    result.recovered = true;
    return result;
  }
  const obj = current.parsed as Record<string, unknown>;
  if (typeof obj.version === 'number' && obj.version > THREE_D_STORAGE_VERSION) {
    result.tooNew = true;
    result.projects = seedProjects();
    return result;
  }
  const parsedEnvelope = storageEnvelopeSchema.safeParse(current.parsed);
  if (!parsedEnvelope.success) {
    result.recovered = true;
    return result;
  }
  const { projects, ui, presets, templates } = parsedEnvelope.data.data;
  // 归一化幂等：v2 数据再次归一化结果不变；旧缺字段补默认
  const normalized = projects
    .map((p) => normalizeProject(p))
    .filter((p): p is ThreeDProject => p !== null);
  const limited = enforceProjectLimit(normalized);
  result.projects = limited.kept;
  result.ui = { ...defaultUiState(), ...ui };
  result.presets = presets.map(jsonClone<AssetPreset>);
  result.templates = templates.map(jsonClone<ThreeDProjectTemplate>);
  if (limited.evicted.length > 0) result.recovered = true;
  return result;
}

/** v1 信封 → v2：逐项目归一化，缺失字段补默认；失败返回 null（数据损坏） */
export function migrateV1Envelope(parsed: unknown): {
  projects: ThreeDProject[];
  ui: Partial<ThreeDUiState>;
} | null {
  const envelope = storageEnvelopeV1Schema.safeParse(parsed);
  if (!envelope.success) return null;
  const projects: ThreeDProject[] = [];
  for (const raw of envelope.data.data.projects) {
    const normalized = normalizeProject(raw);
    if (normalized) projects.push(normalized);
  }
  if (projects.length === 0 && envelope.data.data.projects.length > 0) return null;
  return { projects, ui: envelope.data.data.ui };
}

/** 保存：失败返回 false（不抛异常，不阻塞 UI） */
export function saveThreeDWorkspace(
  projects: ThreeDProject[],
  ui: ThreeDUiState,
  presets: AssetPreset[] = [],
  templates: ThreeDProjectTemplate[] = [],
): boolean {
  try {
    const limited = enforceProjectLimit(projects);
    const payload = {
      version: THREE_D_STORAGE_VERSION,
      data: {
        projects: limited.kept.map(cloneProject),
        ui: { ...defaultUiState(), ...ui },
        presets: presets.map(jsonClone<AssetPreset>),
        templates: templates.map(jsonClone<ThreeDProjectTemplate>),
      },
    };
    localStorage.setItem(THREE_D_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearThreeDWorkspace(): void {
  try {
    localStorage.removeItem(THREE_D_STORAGE_KEY);
    localStorage.removeItem(THREE_D_STORAGE_KEY_V1);
  } catch {
    // 忽略
  }
}

/**
 * 迁移入口：处理旧版本裸数据（裸项目数组 / v1 信封）。
 * 兼容保留：任何可归一化的项目都会被保留，其余丢弃。
 */
export function migrateThreeDV0(input: unknown): ThreeDProject[] | null {
  if (Array.isArray(input)) {
    const projects = input
      .map((item) => normalizeProject(item))
      .filter((p): p is ThreeDProject => p !== null);
    return projects.length > 0 ? projects : null;
  }
  if (typeof input === 'object' && input !== null) {
    const migrated = migrateV1Envelope(input);
    if (migrated && migrated.projects.length > 0) return migrated.projects;
  }
  return null;
}
