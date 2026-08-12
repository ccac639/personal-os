import type { Component } from 'vue';
import {
  Boxes,
  Code2,
  FolderPlus,
  GitBranch,
  Layers,
  Loader2,
  Rocket,
  Server,
  Workflow,
  XCircle,
} from '@lucide/vue';
import type {
  ActivityItem,
  AiWorkbenchInfo,
  DashboardNotification,
  GithubTrendItem,
  HomeMetric,
  ProjectItem,
  ServiceStatus,
  SystemEvent,
  TodayWorkbench,
  WorkflowRun,
} from './types';

/**
 * 首页 mock 数据统一管理源
 * 说明：本地开发/演示模式下的静态数据快照，集中在此处维护，
 * 组件不内联业务数据。后续接入真实 API 时只需替换本文件的数据源。
 */

/** 顶部指标区（统一数据模型 HomeMetric） */
export const HOME_METRICS: HomeMetric[] = [
  {
    id: 'projects',
    label: '开发中项目',
    value: '1',
    description: 'Personal OS 主项目',
    trend: { value: '+12.5%', direction: 'up', label: '较上周' },
    points: [2, 3, 3, 4, 3, 5, 4],
    icon: 'Layers',
  },
  {
    id: 'tech',
    label: '技术栈',
    value: '47+',
    description: 'Vue · NestJS · pnpm',
    trend: { value: '+8.3%', direction: 'up', label: '较上周' },
    points: [30, 34, 36, 39, 41, 44, 47],
    icon: 'Code2',
  },
  {
    id: 'modules',
    label: '模块数',
    value: '6',
    description: 'Web · Blog · API · Worker',
    trend: { value: '+20%', direction: 'up', label: '较上周' },
    points: [3, 4, 4, 5, 5, 5, 6],
    icon: 'Boxes',
  },
  {
    id: 'services',
    label: '活跃服务',
    value: '4/4',
    description: '全部在线',
    trend: { value: '0%', direction: 'neutral', label: '持平' },
    points: [4, 4, 3, 4, 4, 4, 4],
    icon: 'Server',
  },
];

/** 最近活动（真实开发动态快照，2026-08-12） */
export const RECENT_ACTIVITIES: ActivityItem[] = [
  {
    id: '1',
    type: 'commit',
    title: '同步 GitHub 每周趋势卡片',
    description: 'AI 搜索抓取 Trending Top10，替换 Git 仓库卡片',
    timestamp: '25 分钟前',
    icon: GitBranch,
    status: 'success',
  },
  {
    id: '2',
    type: 'workflow',
    title: '每日代码审查流水线',
    description: '自动审查本次提交，等待人工确认',
    timestamp: '10 分钟前',
    icon: Loader2,
    status: 'running',
    progress: 64,
  },
  {
    id: '3',
    type: 'project',
    title: '首页深度优化完成',
    description: '统计卡趋势图、工作流状态卡、氛围光斑',
    timestamp: '1 小时前',
    icon: Rocket,
    status: 'success',
  },
  {
    id: '4',
    type: 'workflow',
    title: '依赖安全审计',
    description: 'npm audit 发现 1 个高危漏洞',
    timestamp: '1 小时前',
    icon: XCircle,
    status: 'failed',
    failureReason: 'npm audit 发现 1 个高危漏洞',
  },
  {
    id: '5',
    type: 'project',
    title: '主题全局化换肤',
    description: '8 套背景独立配色，所有页面联动',
    timestamp: '2 小时前',
    icon: Layers,
    status: 'success',
  },
  {
    id: '6',
    type: 'system',
    title: '页面宠物升级',
    description: '支持拖拽 + 位置持久化 + 左右分栏面板',
    timestamp: '3 小时前',
    icon: Server,
    status: 'success',
  },
  {
    id: '7',
    type: 'commit',
    title: '最近活动模块优化',
    description: '真实数据 + 进度条 + 手动切换',
    timestamp: '4 小时前',
    icon: GitBranch,
    status: 'success',
  },
];

/** 开发中项目快照 */
export const RECENT_PROJECTS: ProjectItem[] = [
  {
    id: '1',
    name: 'Personal OS',
    description: '个人工作台 + AI Agent + Workflow 一体化系统',
    status: 'active',
    lastUpdated: '2 小时前',
    progress: 35,
  },
];

/**
 * GitHub 每周 Star 增长 Top 10 AI 项目
 * 数据来源：AI 于 2026-08-12 搜索抓取 github.com/trending?since=weekly
 */
export const GITHUB_TREND: GithubTrendItem[] = [
  {
    rank: 1,
    name: 'TencentCloud/TencentDB-Agent-Memory',
    description: 'TencentDB Agent Memory — AI Agent 团队级记忆中心：对话/文档/代码转四个可复用记忆资产',
    stars: '19.9k',
    deltaStars: '+7,017',
    url: 'https://github.com/TencentCloud/TencentDB-Agent-Memory',
  },
  {
    rank: 2,
    name: 'cloudflare/computer',
    description: 'Give your agent a computer 👾 给 Agent 一台电脑（Cloudflare 出品）',
    stars: '7.6k',
    deltaStars: '+6,775',
    url: 'https://github.com/cloudflare/computer',
  },
  {
    rank: 3,
    name: 'zhaoxuya520/reverse-skill',
    description: '逆向/渗透/安全研究技能路由包，AI 自动路由 + 自举工具链',
    stars: '24.0k',
    deltaStars: '+6,730',
    url: 'https://github.com/zhaoxuya520/reverse-skill',
  },
  {
    rank: 4,
    name: 'firecrawl/pdf-inspector',
    description: '快速 Rust PDF 检查/分类/文本提取库，智能识别扫描件 vs 文本 PDF',
    stars: '14.7k',
    deltaStars: '+5,367',
    url: 'https://github.com/firecrawl/pdf-inspector',
  },
  {
    rank: 5,
    name: 'virgiliojr94/book-to-skill',
    description: '把任意技术书 PDF 转成 Claude Code Skill，边工作边学习查阅',
    stars: '20.5k',
    deltaStars: '+4,155',
    url: 'https://github.com/virgiliojr94/book-to-skill',
  },
  {
    rank: 6,
    name: 'esengine/DeepSeek-Reasonix',
    description: 'DeepSeek 原生终端 AI 编码 Agent，围绕 prefix-cache 稳定性设计',
    stars: '34.0k',
    deltaStars: '+3,517',
    url: 'https://github.com/esengine/DeepSeek-Reasonix',
  },
  {
    rank: 7,
    name: 'Comfy-Org/ComfyUI',
    description: '最强大模块化 Diffusion 模型 GUI / API / 后端，图节点接口',
    stars: '126.8k',
    deltaStars: '+3,252',
    url: 'https://github.com/Comfy-Org/ComfyUI',
  },
  {
    rank: 8,
    name: 'lyogavin/airllm',
    description: 'AirLLM：单张 4GB GPU 跑 70B 模型推理',
    stars: '30.8k',
    deltaStars: '+2,798',
    url: 'https://github.com/lyogavin/airllm',
  },
  {
    rank: 9,
    name: 'semantica-agi/semantica',
    description: 'Graph-Native 基础设施，为 Context 与可问责 AI 系统而生',
    stars: '4.9k',
    deltaStars: '+2,712',
    url: 'https://github.com/semantica-agi/semantica',
  },
  {
    rank: 10,
    name: 'huangruiteng/loopx',
    description: '轻量 loop 工程状态内核，长跑 AI Agent 团队跨 Codex/Claude Code 通用',
    stars: '4.2k',
    deltaStars: '+2,687',
    url: 'https://github.com/huangruiteng/loopx',
  },
];

export const TREND_SNAPSHOT_DATE = '2026-08-12';

/** 工作流运行快照 */
export const WORKFLOW_RUNS: WorkflowRun[] = [
  {
    id: 'w1',
    name: '每日代码审查流水线',
    status: 'running',
    duration: '2m 14s',
    startedAt: '10 分钟前',
  },
  {
    id: 'w2',
    name: '依赖安全审计',
    status: 'success',
    duration: '48s',
    startedAt: '1 小时前',
  },
  {
    id: 'w3',
    name: '博客自动发布',
    status: 'failed',
    duration: '12s',
    startedAt: '3 小时前',
    failureReason: '内容包含未审核链接，发布被拦截',
  },
];

/** 系统服务状态（四态：online / degraded / offline / unknown） */
export const SYSTEM_SERVICES: ServiceStatus[] = [
  { name: 'Web', stack: 'Vue 3 · Vite', status: 'online', latency: 12, lastCheck: '刚刚' },
  { name: 'Blog', stack: 'Nuxt 4', status: 'online', latency: 18, lastCheck: '刚刚' },
  { name: 'API', stack: 'NestJS · Fastify', status: 'degraded', latency: 320, lastCheck: '1 分钟前' },
  { name: 'Worker', stack: 'Node.js', status: 'offline', latency: undefined, lastCheck: '5 分钟前' },
  { name: 'Search', stack: 'Meilisearch', status: 'unknown', latency: undefined, lastCheck: '未知' },
];

/** 系统监控总览快照 */
export const SYSTEM_OVERVIEW = {
  total: 5,
  online: 2,
  degraded: 1,
  offline: 1,
  unknown: 1,
  currentLatency: 12,
  /** 延迟样本（ms）——仅在存在真实样本时展示折线 */
  latencySamples: [12, 14, 11, 15, 13, 12, 10] as number[],
};

/** 快速操作（四宫格）——href 必须是已存在的路由 */
export const QUICK_ACTIONS: {
  id: string;
  label: string;
  icon: Component;
  href: string;
  color: string;
}[] = [
  {
    id: 'new-project',
    label: '新建项目',
    icon: FolderPlus,
    href: '/projects',
    color: 'text-blue-500 hover:from-blue-500/30 hover:to-blue-500/5',
  },
  {
    id: 'new-workflow',
    label: '创建工作流',
    icon: Workflow,
    href: '/workflows',
    color: 'text-purple-500 hover:from-purple-500/30 hover:to-purple-500/5',
  },
  {
    id: 'blog',
    label: '写博客',
    icon: Code2,
    href: '/chat',
    color: 'text-green-500 hover:from-green-500/30 hover:to-green-500/5',
  },
  {
    id: 'git-ops',
    label: 'Git 操作',
    icon: GitBranch,
    href: '/projects',
    color: 'text-orange-500 hover:from-orange-500/30 hover:to-orange-500/5',
  },
];

/** 图标注册表：HomeMetric.icon 字符串 → 组件 */
export const METRIC_ICONS: Record<string, Component> = {
  Layers,
  Code2,
  Boxes,
  Server,
};

/** 活动状态展示配置 */
export const ACTIVITY_STATUS_CONFIG: Record<
  ActivityItem['status'],
  { label: string; cls: string; dot: string }
> = {
  success: { label: '成功', cls: 'text-green-600 bg-green-500/10 border-green-500/20', dot: 'bg-green-500' },
  running: { label: '进行中', cls: 'text-brand-600 bg-brand-500/10 border-brand-500/20', dot: 'bg-brand-500' },
  failed: { label: '失败', cls: 'text-red-600 bg-red-500/10 border-red-500/20', dot: 'bg-red-500' },
  project: { label: '项目', cls: 'text-indigo-600 bg-indigo-500/10 border-indigo-500/20', dot: 'bg-indigo-500' },
};

/** 今日工作台快照（本地 mock，不读写其他模块数据） */
export const TODAY_WORKBENCH: TodayWorkbench = {
  focusMinutes: 96,
  completedToday: 3,
  items: [
    {
      id: 'wb-1',
      kind: 'task',
      title: '完成首页指标轮播键盘操作',
      source: '任务 · Personal OS',
      status: 'running',
      href: '/projects',
      meta: '进行中',
    },
    {
      id: 'wb-2',
      kind: 'workflow',
      title: '每日代码审查流水线',
      source: '工作流',
      status: 'running',
      href: '/workflows',
      meta: '2m 14s',
    },
    {
      id: 'wb-3',
      kind: 'todo',
      title: '整理本周工作复盘',
      source: '待办',
      status: 'pending',
      href: '/projects',
      meta: '17:00 截止',
    },
    {
      id: 'wb-4',
      kind: 'ai',
      title: '上次对话：工作流类型解耦方案',
      source: 'AI 对话',
      status: 'done',
      href: '/chat',
      meta: '1 小时前',
    },
  ],
};

/** 效率摘要统计输入（上一周期对比用于趋势方向） */
export const WORK_STATS_INPUT = {
  completedToday: 3,
  completedThisWeek: 14,
  overdue: 1,
  blocked: 2,
  avgCompletionMinutes: 42,
  focusMinutes: 96,
  prevCompletedToday: 2,
  prevCompletedThisWeek: 11,
  prevOverdue: 2,
  prevBlocked: 3,
  prevAvgCompletionMinutes: 55,
  prevFocusMinutes: 80,
};

/** AI 工作台入口快照（仅展示摘要，不复制 Chat 逻辑） */
export const AI_WORKBENCH: AiWorkbenchInfo = {
  model: 'deepseek-v4-flash',
  lastConversation: '讨论了工作流类型解耦方案与 motion 类型增强问题',
  pendingTasks: ['生成首页优化后的变更摘要'],
  templates: ['代码审查', '写周报', '解释代码片段'],
};

/** 系统事件时间线（timestamp 越大越新，展示前按倒序） */
export const SYSTEM_EVENTS: SystemEvent[] = [
  {
    id: 'ev-1',
    type: 'sync',
    title: '数据同步完成',
    description: 'GitHub 每周趋势快照已同步到本地索引',
    time: '2 分钟前',
    timestamp: 1786557600000,
  },
  {
    id: 'ev-2',
    type: 'workflow-success',
    title: '工作流完成',
    description: '依赖安全审计运行成功（48s）',
    time: '1 小时前',
    timestamp: 1786554300000,
  },
  {
    id: 'ev-3',
    type: 'service-down',
    title: 'Worker 服务下线',
    description: 'Node.js Worker 心跳超时，等待重启',
    time: '5 分钟前',
    timestamp: 1786557000000,
  },
  {
    id: 'ev-4',
    type: 'workflow-failed',
    title: '工作流失败',
    description: '博客自动发布被拦截：内容包含未审核链接',
    time: '3 小时前',
    timestamp: 1786546200000,
  },
  {
    id: 'ev-5',
    type: 'error',
    title: '最近一次错误',
    description: 'API 延迟 320ms，超过 200ms 阈值，已降级',
    time: '1 分钟前',
    timestamp: 1786557900000,
  },
];

/** 首页通知（read 状态由组件内存管理，不写入 localStorage） */
export const NOTIFICATIONS: DashboardNotification[] = [
  {
    id: 'nt-1',
    type: 'success',
    title: '构建成功',
    summary: 'web 应用生产构建通过（4.3s）',
    createdAt: '10 分钟前',
    read: false,
    actionLabel: '查看',
    actionPath: '/projects',
  },
  {
    id: 'nt-2',
    type: 'warning',
    title: '依赖有更新',
    summary: '3 个依赖有新版本可用，建议运行 dep-audit',
    createdAt: '30 分钟前',
    read: false,
  },
  {
    id: 'nt-3',
    type: 'error',
    title: '服务降级',
    summary: 'API 延迟超阈值，当前处于 degraded 状态',
    createdAt: '1 小时前',
    read: true,
  },
  {
    id: 'nt-4',
    type: 'info',
    title: '工作流已排队',
    summary: '每日代码审查流水线已进入运行队列',
    createdAt: '2 小时前',
    read: true,
  },
];
