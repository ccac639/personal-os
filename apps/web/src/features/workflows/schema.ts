/**
 * 节点配置 Schema（纯函数，无 Vue 依赖）
 *
 * 每种节点类型的字段定义、默认值、字段级校验与恢复默认值集中在此，
 * 避免组件内散落魔法字段。检查器（inspector-panel）按 schema 渲染表单。
 */
import type { DelayUnit, NotifyLevel, WorkflowNodeData, WorkflowNodeKind } from './types';

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'unit-number';

export interface FieldOption {
  value: string;
  label: string;
}

export interface NodeField {
  /** data 上的 key */
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  /** 单位换算字段（unit-number 专属） */
  unitOptions?: FieldOption[];
  /** 校验：返回错误消息或 null */
  validate?: (value: unknown, data: WorkflowNodeData) => string | null;
  /** 辅助说明 */
  help?: string;
}

export interface NodeSchema {
  kind: WorkflowNodeKind;
  /** 检查器标题 */
  title: string;
  fields: NodeField[];
  defaults: Partial<WorkflowNodeData>;
}

/* ---------- 通用校验 ---------- */

function requiredText(value: unknown, label: string): string | null {
  if (value === undefined || value === null || String(value).trim() === '') {
    return `${label}不能为空`;
  }
  return null;
}

function rangeNumber(value: unknown, label: string, min: number, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label}必须是数字`;
  if (n < min || n > max) return `${label}需在 ${min} ~ ${max} 之间`;
  return null;
}

/** 简单 Cron 5 段表达式校验（分钟 小时 日 月 星期） */
export function isValidCron(expr: string): boolean {
  if (!expr || expr.trim() === '') return false;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const fieldRe = /^(\*|\d+|\d+-\d+|\*\/\d+|\d+\/\d+)(,(\*|\d+|\d+-\d+|\*\/\d+|\d+\/\d+))*$/;
  return parts.every((p) => fieldRe.test(p));
}

/* ---------- 延迟单位换算 ---------- */

export const DELAY_UNIT_SECONDS: Record<DelayUnit, number> = {
  ms: 0.001,
  s: 1,
  min: 60,
};

export const DELAY_UNIT_LABELS: Record<DelayUnit, string> = {
  ms: '毫秒',
  s: '秒',
  min: '分钟',
};

/** 数值 + 单位 → 秒（用于持久化规范化与运行） */
export function delayToSeconds(value: number, unit: DelayUnit): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  const secs = value * DELAY_UNIT_SECONDS[unit];
  return unit === 'ms' ? Math.round(secs) : secs;
}

/** 秒 → （数值，单位）展示换算：选择最自然的单位 */
export function secondsToDelayInput(seconds: number): {
  value: number;
  unit: DelayUnit;
} {
  const s = Math.max(0, seconds ?? 0);
  if (s > 0 && s < 1) return { value: Math.round(s * 1000), unit: 'ms' };
  if (s >= 60 && s % 60 === 0) return { value: s / 60, unit: 'min' };
  return { value: s, unit: 's' };
}

/* ---------- Schema 定义 ---------- */

const AI_MODELS: FieldOption[] = [
  { value: 'deepseek-v3', label: 'DeepSeek V3' },
  { value: 'glm-4.6', label: 'GLM-4.6' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
];

const OUTPUT_FORMATS: FieldOption[] = [
  { value: 'text', label: '纯文本' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'json', label: 'JSON' },
];

const NOTIFY_LEVELS: FieldOption[] = [
  { value: 'info', label: '普通' },
  { value: 'warn', label: '警告' },
  { value: 'error', label: '紧急' },
];

const NOTIFY_CHANNELS: FieldOption[] = [
  { value: '邮件', label: '邮件' },
  { value: '钉钉', label: '钉钉' },
  { value: '飞书', label: '飞书' },
  { value: '企业微信', label: '企业微信' },
  { value: 'Telegram', label: 'Telegram' },
];

const DELAY_UNITS: FieldOption[] = [
  { value: 'ms', label: '毫秒' },
  { value: 's', label: '秒' },
  { value: 'min', label: '分钟' },
];

export const NODE_SCHEMAS: Record<WorkflowNodeKind, NodeSchema> = {
  trigger: {
    kind: 'trigger',
    title: '定时触发',
    defaults: { cron: '0 9 * * *', label: '每日 09:00 触发' },
    fields: [
      {
        key: 'cron',
        label: 'Cron 表达式',
        type: 'text',
        placeholder: '0 9 * * *',
        help: '5 段表达式：分 时 日 月 星期',
        validate: (v) => {
          const err = requiredText(v, 'Cron 表达式');
          if (err) return err;
          return isValidCron(String(v)) ? null : 'Cron 格式无效（需 5 段，如 0 9 * * *）';
        },
      },
    ],
  },
  prompt: {
    kind: 'prompt',
    title: '提示词',
    defaults: { template: '', label: '提示词' },
    fields: [
      {
        key: 'template',
        label: '模板内容',
        type: 'textarea',
        placeholder: '支持 {{ 变量 }} 插值，例如：你是 {{ role }}，请总结以下内容…',
        help: '变量引用：{{input}}、{{previous.output}}，缺失变量会在运行时提示',
      },
    ],
  },
  ai: {
    kind: 'ai',
    title: 'AI 生成',
    defaults: {
      model: 'deepseek-v3',
      prompt: '',
      temperature: 0.7,
      outputFormat: 'text',
      maxTokens: 2048,
      label: 'AI 生成',
    },
    fields: [
      {
        key: 'model',
        label: '模型',
        type: 'select',
        options: AI_MODELS,
        validate: (v) => requiredText(v, '模型'),
      },
      {
        key: 'prompt',
        label: '提示词',
        type: 'textarea',
        placeholder: '输入任务指令…支持 {{ 变量 }} 插值',
        validate: (v) => requiredText(v, '提示词'),
      },
      {
        key: 'temperature',
        label: '温度',
        type: 'number',
        step: 0.1,
        min: 0,
        max: 2,
        help: '0-2，越高越随机',
        validate: (v) => rangeNumber(v, '温度', 0, 2),
      },
      {
        key: 'outputFormat',
        label: '输出格式',
        type: 'select',
        options: OUTPUT_FORMATS,
      },
      {
        key: 'maxTokens',
        label: '最大输出长度',
        type: 'number',
        min: 1,
        max: 32768,
        step: 256,
        validate: (v) => rangeNumber(v, '最大输出长度', 1, 32768),
      },
    ],
  },
  code: {
    kind: 'code',
    title: '代码执行',
    defaults: { lang: 'python', code: '', label: '代码执行' },
    fields: [
      {
        key: 'lang',
        label: '语言',
        type: 'select',
        options: [
          { value: 'python', label: 'Python' },
          { value: 'typescript', label: 'TypeScript' },
          { value: 'bash', label: 'Bash' },
          { value: 'sql', label: 'SQL' },
        ],
      },
      {
        key: 'code',
        label: '代码',
        type: 'textarea',
        placeholder: 'print("hello")',
        validate: (v) => requiredText(v, '代码'),
      },
    ],
  },
  condition: {
    kind: 'condition',
    title: '条件判断',
    defaults: {
      expr: 'result == "ok"',
      trueLabel: '通过',
      falseLabel: '不通过',
      label: '条件判断',
    },
    fields: [
      {
        key: 'expr',
        label: '判断表达式',
        type: 'text',
        placeholder: 'risks > 0',
        help: '支持变量与比较：risks > 0、status == "ok"、a && b',
        validate: (v) => requiredText(v, '判断表达式'),
      },
      {
        key: 'trueLabel',
        label: '通过分支标签',
        type: 'text',
        placeholder: '通过',
      },
      {
        key: 'falseLabel',
        label: '不通过分支标签',
        type: 'text',
        placeholder: '不通过',
      },
    ],
  },
  delay: {
    kind: 'delay',
    title: '延迟等待',
    defaults: { seconds: 60, delayValue: 1, delayUnit: 'min', label: '延迟 60s' },
    fields: [
      {
        key: 'delayValue',
        label: '等待时长',
        type: 'unit-number',
        unitOptions: DELAY_UNITS,
        min: 1,
        max: 1440,
        placeholder: '60',
        help: '输入数值并选择单位（毫秒 / 秒 / 分钟）',
        validate: (v) => rangeNumber(v, '等待时长', 1, 1440),
      },
    ],
  },
  notify: {
    kind: 'notify',
    title: '发送通知',
    defaults: { channel: '邮件', title: '', level: 'info', message: '', label: '发送通知' },
    fields: [
      {
        key: 'channel',
        label: '渠道',
        type: 'select',
        options: NOTIFY_CHANNELS,
      },
      {
        key: 'level',
        label: '通知级别',
        type: 'select',
        options: NOTIFY_LEVELS,
      },
      {
        key: 'title',
        label: '标题',
        type: 'text',
        placeholder: '通知标题',
      },
      {
        key: 'message',
        label: '正文',
        type: 'textarea',
        placeholder: '支持 {{ 变量 }} 插值',
        help: '可留空，仅发送标题',
      },
    ],
  },
  output: {
    kind: 'output',
    title: '输出',
    defaults: { format: 'text', outputName: '', label: '输出' },
    fields: [
      {
        key: 'outputName',
        label: '输出名称',
        type: 'text',
        placeholder: '例如：审查报告',
      },
      {
        key: 'format',
        label: '展示格式',
        type: 'select',
        options: OUTPUT_FORMATS,
      },
    ],
  },
};

export function getNodeSchema(kind: WorkflowNodeKind): NodeSchema {
  return NODE_SCHEMAS[kind] ?? NODE_SCHEMAS.trigger;
}

/** 恢复某类型的默认配置（不含 kind/label/status） */
export function resetToDefaults(kind: WorkflowNodeKind): Partial<WorkflowNodeData> {
  const schema = getNodeSchema(kind);
  const { label: _label, ...rest } = schema.defaults;
  void _label;
  return { ...rest };
}

/** 字段级校验：返回 { key: 错误消息 }（空对象 = 无错误） */
export function validateNodeData(data: WorkflowNodeData): Record<string, string> {
  const schema = getNodeSchema(data.kind);
  const errors: Record<string, string> = {};
  for (const f of schema.fields) {
    if (!f.validate) continue;
    const value = data[f.key as keyof WorkflowNodeData];
    const err = f.validate(value, data);
    if (err) errors[f.key] = err;
  }
  if (!data.label || data.label.trim() === '') {
    errors.label = '节点名称不能为空';
  }
  return errors;
}

/** 延迟节点：将 value+unit 规范化写入 seconds，返回规范化后的秒数 */
export function normalizeDelay(data: WorkflowNodeData): WorkflowNodeData {
  if (data.kind !== 'delay') return data;
  const value = data.delayValue ?? data.seconds ?? 0;
  const unit: DelayUnit = data.delayUnit ?? 's';
  const seconds = delayToSeconds(Number(value), unit);
  return { ...data, seconds, delayValue: Number(value), delayUnit: unit };
}

/** 通知级别展示 */
export function notifyLevelLabel(level?: NotifyLevel): string {
  switch (level) {
    case 'warn':
      return '警告';
    case 'error':
      return '紧急';
    default:
      return '普通';
  }
}

/* ---------- 数据形状校验（导入 / 模板 / 快照严格校验用） ---------- */

const STRING_KEYS: Array<keyof WorkflowNodeData> = [
  'label',
  'cron',
  'template',
  'model',
  'prompt',
  'lang',
  'code',
  'expr',
  'trueLabel',
  'falseLabel',
  'title',
  'message',
  'format',
  'outputName',
];

/**
 * 校验节点 data 的「形状」：字段类型与枚举值合法性。
 * 不要求必填（与字段级 validate 不同），只拦截结构错误的数据。
 * 返回错误消息数组（空 = 合法）。未知额外字段不拒绝（向前兼容）。
 */
export function validateDataShape(data: WorkflowNodeData): string[] {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') return ['data 必须是对象'];

  for (const key of STRING_KEYS) {
    const v = data[key];
    if (v !== undefined && v !== null && typeof v !== 'string') {
      errors.push(`字段 ${key} 必须是字符串`);
    }
  }

  if (data.kind === 'delay') {
    if (data.delayUnit !== undefined && !['ms', 's', 'min'].includes(data.delayUnit)) {
      errors.push(`delayUnit 无效：${String(data.delayUnit)}（可选 ms/s/min）`);
    }
    if (data.seconds !== undefined && typeof data.seconds !== 'number') {
      errors.push('seconds 必须是数字');
    }
    if (data.delayValue !== undefined && typeof data.delayValue !== 'number') {
      errors.push('delayValue 必须是数字');
    }
  }
  if (data.kind === 'notify') {
    if (data.level !== undefined && !['info', 'warn', 'error'].includes(data.level)) {
      errors.push(`level 无效：${String(data.level)}（可选 info/warn/error）`);
    }
  }
  if (data.kind === 'output') {
    if (data.format !== undefined && !['text', 'markdown', 'json'].includes(data.format)) {
      errors.push(`format 无效：${String(data.format)}（可选 text/markdown/json）`);
    }
  }
  if (data.kind === 'ai') {
    if (data.temperature !== undefined && typeof data.temperature !== 'number') {
      errors.push('temperature 必须是数字');
    }
    if (data.maxTokens !== undefined && typeof data.maxTokens !== 'number') {
      errors.push('maxTokens 必须是数字');
    }
    if (
      data.outputFormat !== undefined &&
      !['text', 'markdown', 'json'].includes(data.outputFormat)
    ) {
      errors.push(`outputFormat 无效：${String(data.outputFormat)}（可选 text/markdown/json）`);
    }
  }
  return errors;
}
