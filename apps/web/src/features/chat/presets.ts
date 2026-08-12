/**
 * Chat 功能域 —— 会话级系统提示词预设
 *
 * - 内置预设为代码常量（通用协作 / 代码审阅 / 写作编辑 / 任务拆解），不落盘
 * - 自定义预设持久化于 storage.ts（personal-os.chat.presets.v1），
 *   读取时与内置预设合并；损坏数据安全回退为空列表
 * - 会话级生效值存在会话对象上（systemPrompt：presetId + 解析后文本），
 *   导出自包含，不依赖预设是否仍存在
 */
import { loadCustomPresets, saveCustomPresets } from './storage';
import type { ChatSystemPromptPreset } from './types';
import { uid } from './utils';

export const BUILTIN_SYSTEM_PROMPTS: ChatSystemPromptPreset[] = [
  {
    id: 'general-collab',
    name: '通用协作',
    description: '日常问答、分析与头脑风暴',
    text: '你是一位高效、可靠的个人 AI 协作助手。回答简洁准确，先给结论再展开；不确定时明确说明，不编造信息。',
    builtin: true,
  },
  {
    id: 'code-review',
    name: '代码审阅',
    description: '以审阅者视角检查代码',
    text: '你是一位严谨的代码审阅者。按正确性、类型安全、性能、可维护性、安全性依次检查；每个问题给出严重级别、原因与修改建议。',
    builtin: true,
  },
  {
    id: 'writing-edit',
    name: '写作编辑',
    description: '润色与结构化写作',
    text: '你是一位文字编辑。帮助用户润色与组织内容：结构清晰、语言平实、逻辑连贯；保留原意，标注关键修改点。',
    builtin: true,
  },
  {
    id: 'task-decompose',
    name: '任务拆解',
    description: '把目标拆成可执行任务',
    text: '你是一位任务规划师。把目标拆解为可执行、可验收的子任务：每项包含目的、步骤、产出与验收标准；先优先级排序，再给依赖关系。',
    builtin: true,
  },
];

/** 内置 + 自定义全部预设（自定义排后） */
export function allSystemPromptPresets(): ChatSystemPromptPreset[] {
  return [...BUILTIN_SYSTEM_PROMPTS, ...loadCustomPresets().presets];
}

export function systemPromptPresetById(
  id: string,
): ChatSystemPromptPreset | undefined {
  return allSystemPromptPresets().find((p) => p.id === id);
}

export function isBuiltinPrompt(id: string): boolean {
  return BUILTIN_SYSTEM_PROMPTS.some((p) => p.id === id);
}

/**
 * 创建自定义预设并持久化。
 * 名称 / 文本必须非空；成功返回预设，失败返回 null。
 */
export function createCustomPreset(
  name: string,
  text: string,
): ChatSystemPromptPreset | null {
  const n = name.trim();
  const t = text.trim();
  if (!n || !t) return null;
  const preset: ChatSystemPromptPreset = {
    id: uid(),
    name: n,
    description: '自定义预设',
    text: t,
    builtin: false,
  };
  const { presets } = loadCustomPresets();
  saveCustomPresets([...presets, preset]);
  return preset;
}

/** 删除自定义预设（内置预设不可删除） */
export function removeCustomPreset(id: string): void {
  if (isBuiltinPrompt(id)) return;
  const { presets } = loadCustomPresets();
  saveCustomPresets(presets.filter((p) => p.id !== id));
}

/** 预设展示名：'custom' → 自定义；未知 id → 自定义；未设置 → 无 */
export function promptPresetName(presetId: string | undefined): string {
  if (!presetId) return '无';
  if (presetId === 'custom') return '自定义';
  return systemPromptPresetById(presetId)?.name ?? '自定义';
}
