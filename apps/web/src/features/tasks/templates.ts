/**
 * 任务模板 —— 纯函数 + 自定义模板本地存取（可单测）
 *
 * 内置四类模板：缺陷修复 / 功能开发 / 技术债 / 发布检查；
 * 自定义模板存 localStorage（独立 key，容错读写，损坏时静默降级为空列表）。
 */
import type { TaskPriority } from '@personal-os/types';
import type { SubTask, TaskForm, TaskTemplate } from './types';
import { addDays } from '@/features/projects/plan';

const CUSTOM_KEY = 'personal-os.tasks.templates.v1';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 内置模板（不可删除） */
export const BUILTIN_TEMPLATES: TaskTemplate[] = [
  {
    id: 'tpl-bugfix',
    name: '缺陷修复',
    description: '复现问题 → 定位根因 → 修复 → 回归验证',
    title: '修复：',
    taskDescription: '【问题现象】\n【复现步骤】\n【根因】\n【修复方案】',
    priority: 'high',
    tags: ['缺陷'],
    subtasks: ['复现问题并记录步骤', '定位根因', '编写/更新修复', '补充回归测试', '验证并关闭'],
    dod: '缺陷可复现步骤全部通过，回归测试通过，无新增回归。',
    estimatedMinutes: 120,
    builtin: true,
  },
  {
    id: 'tpl-feature',
    name: '功能开发',
    description: '需求 → 设计 → 实现 → 联调 → 验收',
    title: '开发：',
    taskDescription: '【需求背景】\n【验收标准】\n【技术方案】',
    priority: 'medium',
    tags: ['功能'],
    subtasks: ['梳理需求与验收标准', '确认技术方案', '实现主体功能', '自测与边界处理', '提交验收'],
    dod: '验收标准全部满足，关键路径自测通过。',
    estimatedMinutes: 240,
    builtin: true,
  },
  {
    id: 'tpl-techdebt',
    name: '技术债',
    description: '定位债源 → 评估影响 → 重构 → 回归',
    title: '偿还技术债：',
    taskDescription: '【债源】\n【影响范围】\n【重构方案】\n【风险点】',
    priority: 'medium',
    tags: ['技术债'],
    subtasks: ['定位债源并记录影响范围', '评估重构风险', '执行重构', '全量回归验证'],
    dod: '重构后原有行为不变（回归通过），代码可读性/可维护性有可量化的改善。',
    estimatedMinutes: 180,
    builtin: true,
  },
  {
    id: 'tpl-release',
    name: '发布检查',
    description: '变更核对 → 构建验证 → 发布 → 观察',
    title: '发布检查：',
    taskDescription: '【本次发布范围】\n【关联变更】\n【回滚预案】',
    priority: 'urgent',
    tags: ['发布'],
    subtasks: ['核对发布范围内变更', '构建/打包验证通过', '执行发布', '发布后观察关键指标'],
    dod: '构建通过，发布完成，观察期无异常，回滚预案就绪。',
    estimatedMinutes: 60,
    builtin: true,
  },
];

/** 全部模板：内置在前，自定义在后 */
export function allTemplates(custom: TaskTemplate[]): TaskTemplate[] {
  return [...BUILTIN_TEMPLATES, ...custom];
}

/** 模板 → 任务表单默认值（纯函数；subtasks 在组件层生成 id） */
export function applyTemplate(
  tpl: TaskTemplate,
  projectId?: string,
): Omit<TaskForm, 'subtasks'> & { subtasks: SubTask[] } {
  const dueDate = tpl.defaultDueDays != null ? addDays(todayStr(), tpl.defaultDueDays) : undefined;
  return {
    projectId,
    title: tpl.title,
    description: tpl.taskDescription,
    priority: tpl.priority,
    status: 'todo',
    dueDate,
    tags: [...tpl.tags],
    estimatedMinutes: tpl.estimatedMinutes,
    dod: tpl.dod,
    blockedReason: undefined,
    subtasks: tpl.subtasks.map((title, i) => ({
      id: `st-${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`,
      title,
      done: false,
    })),
  };
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** 自定义模板结构校验（纯函数；非法丢弃） */
export function normalizeTemplate(raw: unknown): TaskTemplate | null {
  if (!isPlainObject(raw)) return null;
  const t = raw;
  if (
    typeof t.id !== 'string' ||
    typeof t.name !== 'string' ||
    typeof t.title !== 'string' ||
    typeof t.priority !== 'string' ||
    !['low', 'medium', 'high', 'urgent'].includes(t.priority) ||
    !Array.isArray(t.tags) ||
    !t.tags.every((x) => typeof x === 'string') ||
    !Array.isArray(t.subtasks) ||
    !t.subtasks.every((x) => typeof x === 'string')
  ) {
    return null;
  }
  return {
    id: t.id,
    name: t.name,
    description: typeof t.description === 'string' ? t.description : undefined,
    title: t.title,
    taskDescription: typeof t.taskDescription === 'string' ? t.taskDescription : undefined,
    priority: t.priority as TaskPriority,
    tags: t.tags as string[],
    subtasks: t.subtasks as string[],
    dod: typeof t.dod === 'string' ? t.dod : undefined,
    estimatedMinutes:
      typeof t.estimatedMinutes === 'number' &&
      Number.isFinite(t.estimatedMinutes) &&
      t.estimatedMinutes >= 0
        ? Math.round(t.estimatedMinutes)
        : undefined,
    defaultDueDays:
      typeof t.defaultDueDays === 'number' && Number.isFinite(t.defaultDueDays)
        ? Math.round(t.defaultDueDays)
        : undefined,
    builtin: false,
  };
}

/** 读取自定义模板（失败 / 损坏时返回空列表） */
export function loadCustomTemplates(): TaskTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTemplate).filter((t): t is TaskTemplate => t !== null);
  } catch {
    return [];
  }
}

/** 保存自定义模板列表（返回写入结果；供 store 提示失败） */
export function saveCustomTemplates(list: TaskTemplate[]): { ok: boolean; reason?: string } {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason:
        e instanceof DOMException && e.name === 'QuotaExceededError'
          ? '本地存储空间不足，模板未能保存'
          : '本地存储写入失败',
    };
  }
}

/** 新增自定义模板（自动生成 id；重名时追加序号） */
export function createCustomTemplate(
  list: TaskTemplate[],
  input: Omit<TaskTemplate, 'id' | 'builtin'>,
): { list: TaskTemplate[]; template: TaskTemplate } {
  const base = input.name.trim();
  const names = new Set(list.map((t) => t.name));
  let name = base;
  let i = 2;
  while (names.has(name)) {
    name = `${base} ${i}`;
    i += 1;
  }
  const template: TaskTemplate = {
    ...input,
    id: `tpl-c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name,
    builtin: false,
  };
  return { list: [...list, template], template };
}

/** 删除自定义模板（内置模板不可删除；纯函数） */
export function deleteCustomTemplate(
  list: TaskTemplate[],
  id: string,
): { list: TaskTemplate[]; removed: boolean } {
  const tpl = list.find((t) => t.id === id);
  if (!tpl || tpl.builtin) return { list, removed: false };
  return { list: list.filter((t) => t.id !== id), removed: true };
}
