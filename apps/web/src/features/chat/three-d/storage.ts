/**
 * Chat 功能域 —— 3D 工作台持久化仓库
 *
 * - key：personal-os.chat.3d.v1，信封 { version, data: { projects, ui } }
 * - zod 结构校验：损坏 / 版本过新安全回退默认值（不清除原始数据），返回恢复标志
 * - 只存结构化项目数据与 UI 偏好，绝不写入 WebGL 对象 / 纹理二进制 / 文件内容
 * - 迁移入口 migrateThreeDV0：为未来版本升级预留
 */
import {
  defaultUiState,
  seedProjects,
  THREE_D_STORAGE_KEY,
  THREE_D_STORAGE_VERSION,
} from './constants';
import { cloneProject, enforceProjectLimit } from './domain';
import { projectSchema, storageEnvelopeSchema } from './validation';
import type { ThreeDProject, ThreeDUiState } from './types';

export { THREE_D_STORAGE_KEY, THREE_D_STORAGE_VERSION };

export interface ThreeDWorkspaceLoadResult {
  projects: ThreeDProject[];
  ui: ThreeDUiState;
  /** 数据损坏 / 结构非法，已回退默认值 */
  recovered: boolean;
  /** 数据版本过新（保留原数据，仅展示提示） */
  tooNew: boolean;
  /** 写入失败标志（上次保存失败） */
  writeFailed: boolean;
}

/**
 * 首次使用：播种 3 个本地 mock 概念项目（角色 / 世界 / 道具）。
 * 种子项目只初始化一次；用户删除后不强制恢复。
 */
export function initialProjects(): ThreeDProject[] {
  const seeded = seedProjects();
  const persisted = loadRawProjects();
  if (persisted) return persisted;
  return seeded;
}

function loadRawProjects(): ThreeDProject[] | null {
  try {
    const raw = localStorage.getItem(THREE_D_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.version !== THREE_D_STORAGE_VERSION) return null;
    const result = storageEnvelopeSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data.data.projects.map(cloneProject);
  } catch {
    return null;
  }
}

export function loadThreeDWorkspace(): ThreeDWorkspaceLoadResult {
  const result: ThreeDWorkspaceLoadResult = {
    projects: initialProjects(),
    ui: defaultUiState(),
    recovered: false,
    tooNew: false,
    writeFailed: false,
  };
  try {
    const raw = localStorage.getItem(THREE_D_STORAGE_KEY);
    if (!raw) {
      // 首次使用：写入种子数据
      saveThreeDWorkspace(result.projects, result.ui);
      return result;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      result.recovered = true;
      return result;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      result.recovered = true;
      return result;
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.version === 'number' && obj.version > THREE_D_STORAGE_VERSION) {
      result.tooNew = true;
      result.projects = seedProjects();
      return result;
    }
    const parsedEnvelope = storageEnvelopeSchema.safeParse(parsed);
    if (!parsedEnvelope.success) {
      result.recovered = true;
      return result;
    }
    const { projects, ui } = parsedEnvelope.data.data;
    const limited = enforceProjectLimit(projects.map(cloneProject));
    result.projects = limited.kept;
    result.ui = { ...defaultUiState(), ...ui };
    if (limited.evicted.length > 0) result.recovered = true;
    return result;
  } catch {
    result.recovered = true;
    return result;
  }
}

/** 保存：失败返回 false（不抛异常，不阻塞 UI） */
export function saveThreeDWorkspace(projects: ThreeDProject[], ui: ThreeDUiState): boolean {
  try {
    const limited = enforceProjectLimit(projects);
    const payload = {
      version: THREE_D_STORAGE_VERSION,
      data: {
        projects: limited.kept.map(cloneProject),
        ui: { ...defaultUiState(), ...ui },
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
  } catch {
    // 忽略
  }
}

/**
 * 迁移入口：处理旧版本裸数据。
 * 当前无历史版本需要迁移；未来 v0 → v1 时在此实现。
 */
export function migrateThreeDV0(input: unknown): ThreeDProject[] | null {
  if (!Array.isArray(input)) return null;
  // 预留：旧格式为裸项目数组时尝试结构化校验
  const projects: ThreeDProject[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue;
    const parsed = projectSchema.safeParse(item);
    if (parsed.success) projects.push(parsed.data);
  }
  return projects.length > 0 ? projects : null;
}
