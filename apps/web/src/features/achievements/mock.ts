import type {
  Achievement,
  AchievementCollection,
  AchievementRelations,
  ReusePackage,
} from './types';
import { emptyRelations, emptyReuse } from './types';

/**
 * 成果库示例数据（首次进入时播种；之后由 localStorage 持久化接管）。
 * 覆盖 5 种类型、2025-02 ~ 2026-08 的分布、置顶/归档/链接/关联项目/关键指标，
 * 并带关系（relations）与复用包（reuse）示例。
 */

type SeedExtra = Omit<Partial<Achievement>, 'relations' | 'reuse'> & {
  /** 关系只写出现的字段，缺失字段自动补空 */
  relations?: Partial<AchievementRelations>;
  /** 复用包只写出现的字段 */
  reuse?: Partial<ReusePackage>;
};

function seed(
  id: string,
  type: Achievement['type'],
  title: string,
  summary: string,
  description: string,
  completedAt: string,
  tags: string[],
  extra: SeedExtra = {},
): Achievement {
  const now = new Date(`${completedAt}T09:00:00+08:00`).toISOString();
  const { relations, reuse, ...rest } = extra;
  return {
    id,
    type,
    title,
    summary,
    description,
    tags,
    completedAt,
    metrics: [],
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
    ...rest,
    relations: { ...emptyRelations(), ...relations },
    reuse: { ...emptyReuse(), ...reuse },
  };
}

export const SEED_ACHIEVEMENTS: Achievement[] = [
  seed(
    'ac-personal-os-v01',
    'project',
    'Personal OS v0.1 正式发布',
    '个人 AI 软件工程助手管理平台首个可用版本，统一管理项目、工作流与知识库。',
    '完成了从零到一的整体架构搭建：pnpm monorepo 管理 web 前端与共享包，Pinia 管理状态，Tailwind v4 + CSS 变量实现全站主题换肤，工作流画布支持节点编排与模拟运行。本轮成果库模块上线后，已完成页正式可用。',
    '2026-07-18',
    ['personal-os', 'vue', 'pinia', 'tailwind'],
    {
      relatedProject: 'Personal OS',
      link: 'https://github.com/example/personal-os/releases/tag/v0.1.0',
      metrics: [
        { label: '功能模块', value: '6' },
        { label: '页面数', value: '12' },
        { label: '测试覆盖率', value: '96%' },
      ],
      relations: {
        projectIds: ['p-personal-os'],
        workflowIds: ['wf-daily-review'],
        predecessorIds: ['ac-milestone-first-release'],
        derivedIds: ['ac-tech-tree'],
      },
      reuse: {
        links: [
          { label: '发布说明', url: 'https://github.com/example/personal-os/releases/tag/v0.1.0' },
          {
            label: '架构文档',
            url: 'https://github.com/example/personal-os/blob/main/ARCHITECTURE.md',
          },
        ],
        usageGuide:
          '克隆仓库后 pnpm install && pnpm dev 即可本地运行；首次进入会自动播种示例数据。',
        checklist: ['pnpm install 成功', 'pnpm dev 可访问首页', '已完成页展示示例数据'],
        retrospective: '里程碑式版本。教训：主题变量应提前统一命名，避免后期大面积替换。',
        templateSnippet: 'pnpm --filter @personal-os/web dev',
      },
      pinned: true,
    },
  ),
  seed(
    'ac-commit-100',
    'milestone',
    '达成 100 次个人提交',
    '个人项目累计 100 次 Git 提交，形成稳定的每日编码习惯。',
    '从「偶尔写一点」到「每天至少一次提交」，连续 4 个月保持活跃。提交记录覆盖 feature / fix / docs / refactor 四类，个人仓库的提交粒度与信息规范也在此过程中固定下来。',
    '2026-08-01',
    ['commit', '习惯', 'git'],
    {
      metrics: [
        { label: '累计提交', value: '100' },
        { label: '连续活跃', value: '118 天' },
      ],
      relations: {
        predecessorIds: ['ac-milestone-10-articles'],
      },
      pinned: true,
    },
  ),
  seed(
    'ac-article-monorepo',
    'article',
    '《用 pnpm workspace 组织个人 monorepo》',
    '分享个人项目从多仓库到 monorepo 的迁移经验与依赖管理踩坑记录。',
    '记录了一次真实迁移：为何选择 pnpm workspace、如何拆分共享包（config / ui / utils / types）、turbo 缓存对构建提速的效果，以及 Windows 下路径与脚本的兼容性问题。',
    '2026-06-12',
    ['pnpm', 'monorepo', '写作'],
    {
      link: 'https://example.com/blog/pnpm-workspace-monorepo',
      metrics: [
        { label: '阅读量', value: '2.4k' },
        { label: '获赞', value: '86' },
      ],
      relations: {
        projectIds: ['p-personal-os'],
        predecessorIds: ['ac-personal-os-v01'],
      },
      reuse: {
        links: [{ label: '文章原文', url: 'https://example.com/blog/pnpm-workspace-monorepo' }],
        usageGuide: '作为 monorepo 迁移决策的参考资料，附迁移步骤与回滚方案。',
        checklist: ['阅读迁移动机', '对照 workspace 拆分示例'],
        retrospective: '',
        templateSnippet: '',
      },
    },
  ),
  seed(
    'ac-wf-daily-review',
    'workflow',
    '每日代码审查流水线模板',
    '定时触发 AI 代码审查并输出风险清单的可复用工作流模板。',
    '模板内置 6 类节点：定时触发 → AI 审查 → 风险条件判断 → 钉钉告警 / 延迟等待 → 周报生成。支持一键导入到工作流画布并按需修改。',
    '2026-05-20',
    ['workflow', 'ai', '自动化'],
    {
      relatedProject: 'Personal OS',
      metrics: [
        { label: '节点数', value: '6' },
        { label: '复用次数', value: '12' },
      ],
      relations: {
        workflowIds: ['wf-daily-review'],
        projectIds: ['p-personal-os'],
      },
      reuse: {
        links: [{ label: '工作流 JSON', url: 'https://gist.github.com/example/daily-review-flow' }],
        usageGuide: '在工作流页面导入 JSON，按提示替换 AI 模型的 API Key 与告警群机器人地址。',
        checklist: ['导入 JSON', '替换 AI Key', '替换钉钉机器人', '试运行一次'],
        retrospective: '风险判断节点用条件分支表达最直观；建议把告警阈值抽成配置项。',
        templateSnippet:
          'trigger: cron "0 9 * * 1-5"\nreview: ai(code-diff) -> risk-check -> notify',
      },
    },
  ),
  seed(
    'ac-code-draggable',
    'code',
    'Vue 3 组合式拖拽指令 useDraggable',
    '基于 Pointer Events 实现的轻量拖拽组合式函数，零依赖、支持边界约束。',
    '约 120 行 TypeScript，支持拖动、边界限制、回调通知与 touch 事件，可用于卡片排序、浮层拖拽等场景。附带 vitest 单元测试。',
    '2026-04-08',
    ['vue3', '组件', 'typescript'],
    {
      link: 'https://gist.github.com/example/use-draggable',
      metrics: [
        { label: '代码行数', value: '~120' },
        { label: '测试用例', value: '8' },
      ],
      reuse: {
        links: [{ label: 'Gist 源码', url: 'https://gist.github.com/example/use-draggable' }],
        usageGuide:
          '复制 useDraggable.ts 到项目的 composables 目录，按需配置 boundary 与 onDrag 回调。',
        checklist: ['复制源码', '配置边界', '跑通示例'],
        retrospective: '',
        templateSnippet: "const { x, y, dragging } = useDraggable(target, { boundary: '.board' });",
      },
    },
  ),
  seed(
    'ac-tech-tree',
    'project',
    '技术树图谱页上线',
    '以图谱形式可视化个人技术栈：核心框架、语言与工具按层级展示。',
    '结合 ECharts 实现技术树可视化，支持按分组折叠与悬停高亮；数据与项目模块的技术栈配置共享，改一处全局生效。',
    '2026-03-25',
    ['echarts', 'dashboard'],
    {
      relatedProject: 'Personal OS',
      metrics: [
        { label: '技术节点', value: '40+' },
        { label: '分组', value: '5' },
      ],
      relations: {
        projectIds: ['p-personal-os'],
        predecessorIds: ['ac-personal-os-v01'],
      },
    },
  ),
  seed(
    'ac-article-ai-toolchain',
    'article',
    '《本地优先的 AI 工具链实践》',
    '梳理本地优先（local-first）的 AI 工具选择、数据归属与自动化接入思路。',
    '围绕「数据不出本地、工具可离线、流程可脚本化」三条原则，对比 CLI / 桌面 / 自托管三种形态，并给出个人环境下的推荐组合与配置示例。',
    '2025-12-15',
    ['ai', '写作', '效率'],
    {
      link: 'https://example.com/blog/local-first-ai',
      metrics: [{ label: '阅读量', value: '1.1k' }],
    },
  ),
  seed(
    'ac-wf-blog-publish',
    'workflow',
    '博客自动发布流水线',
    '草稿检出 → 构建 → RSS/Sitemap 生成 → 发布的端到端自动发布流程。',
    '把原本手动的 6 步发布流程压缩为一次触发：检查待发布草稿、执行构建、生成 RSS 与站点地图、推送到生产目录，全程日志留痕。',
    '2025-11-02',
    ['workflow', '博客'],
    {
      metrics: [
        { label: '发布耗时', value: '12s' },
        { label: '累计发布', value: '23 次' },
      ],
      relations: {
        workflowIds: ['wf-blog-publish'],
        projectIds: ['p-blog'],
        predecessorIds: ['ac-project-blog'],
      },
    },
  ),
  seed(
    'ac-code-zod-loader',
    'code',
    'zod 配置加载器 safe-config',
    '用 zod 做运行时校验的配置加载工具，环境变量与 JSON 配置统一入口。',
    '将散落各处的 process.env 读取收敛为带 schema 的配置对象：读取 → 校验 → 报错定位，支持默认值与自定义错误信息。',
    '2025-09-18',
    ['typescript', 'zod'],
    {
      link: 'https://gist.github.com/example/safe-config',
      metrics: [{ label: '配置项', value: '30+' }],
    },
  ),
  seed(
    'ac-milestone-first-release',
    'milestone',
    'Personal OS 首个可用版本',
    '从原型验证到可日常使用的第一个里程碑版本。',
    '完成首页仪表盘、导航框架与主题换肤的初版实现，并在自己机器上日常使用两周无阻塞问题，决定继续投入迭代。',
    '2025-08-30',
    ['personal-os', '里程碑'],
    {
      relatedProject: 'Personal OS',
      metrics: [{ label: '开发周期', value: '3 个月' }],
      relations: {
        projectIds: ['p-personal-os'],
        derivedIds: ['ac-personal-os-v01'],
      },
    },
  ),
  seed(
    'ac-project-blog',
    'project',
    '个人博客系统上线',
    '自建静态博客：Markdown 写作、自动构建、部署到自有服务器。',
    '早期尝试过 Hexo 与主题魔改，最终沉淀为「Markdown + 构建脚本 + Nginx」的最小方案，并顺手解决了 HTTPS 证书自动续期。',
    '2025-06-10',
    ['blog', 'vue', 'nginx'],
    {
      link: 'https://blog.example.com',
      metrics: [
        { label: '文章数', value: '10' },
        { label: '月访问', value: '3.2k' },
      ],
      relations: {
        projectIds: ['p-blog'],
        derivedIds: ['ac-wf-blog-publish', 'ac-code-nginx-memo'],
      },
      archived: true,
    },
  ),
  seed(
    'ac-article-cli-ux',
    'article',
    '《命令行工具的 UX 设计》',
    '从交互角度拆解 CLI 工具的提示、错误与进度反馈设计。',
    '结合自己写脚本与工具的经验，总结 CLI 中「反馈及时、错误可读、输出可管道」三条设计原则，附正反例对比。',
    '2025-04-22',
    ['写作', 'cli'],
    {
      link: 'https://example.com/blog/cli-ux',
      metrics: [{ label: '获赞', value: '42' }],
      archived: true,
    },
  ),
  seed(
    'ac-code-nginx-memo',
    'code',
    'Nginx 反向代理配置备忘',
    '常用反向代理 / 静态站点 / 证书续期的配置片段集合。',
    '沉淀自己在服务器部署中反复使用的 nginx 配置片段：WebSocket 代理、SPA history 路由回退、gzip 与缓存策略、acme 证书续期钩子。',
    '2025-02-14',
    ['nginx', '运维', '备忘'],
    {
      metrics: [{ label: '配置片段', value: '9' }],
      relations: {
        predecessorIds: ['ac-project-blog'],
      },
    },
  ),
  seed(
    'ac-milestone-10-articles',
    'milestone',
    '累计 10 篇技术文章',
    '技术写作跨过两位数门槛，形成稳定的记录与复盘习惯。',
    '从工具使用笔记到架构决策复盘，10 篇文章覆盖了 Vue、Node、DevOps 与个人项目实践，写作成为个人知识沉淀的主通道。',
    '2026-01-20',
    ['写作', '习惯'],
    {
      metrics: [
        { label: '累计文章', value: '10' },
        { label: '写作时长', value: '8 个月' },
      ],
      relations: {
        derivedIds: ['ac-commit-100'],
      },
    },
  ),
];

/** 首次进入时播种（store 持久化后不再使用）；order 与数组顺序一致 */
export function seedAchievements(): Achievement[] {
  return SEED_ACHIEVEMENTS.map((a, i) => ({
    ...a,
    metrics: a.metrics.map((m) => ({ ...m })),
    relations: {
      projectIds: [...a.relations.projectIds],
      workflowIds: [...a.relations.workflowIds],
      predecessorIds: [...a.relations.predecessorIds],
      derivedIds: [...a.relations.derivedIds],
    },
    reuse: {
      links: a.reuse.links.map((l) => ({ ...l })),
      usageGuide: a.reuse.usageGuide,
      checklist: [...a.reuse.checklist],
      retrospective: a.reuse.retrospective,
      templateSnippet: a.reuse.templateSnippet,
    },
    order: i,
  }));
}

/** 种子集合（引用种子成果 id；仅在首次播种时使用） */
export const SEED_COLLECTIONS: Omit<AchievementCollection, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: '2026 上半年精选',
    description: '上半年的高光成果：里程碑发布、自动化流水线与沉淀文章。',
    color: '#6366f1',
    achievementIds: [
      'ac-personal-os-v01',
      'ac-commit-100',
      'ac-article-monorepo',
      'ac-wf-daily-review',
      'ac-code-draggable',
    ],
  },
  {
    name: 'AI 自动化',
    description: '与 AI 助手协作的自动化工作流与效率成果。',
    color: '#10b981',
    achievementIds: ['ac-wf-daily-review', 'ac-article-ai-toolchain', 'ac-wf-blog-publish'],
  },
  {
    name: '博客与写作',
    description: '写作类成果归档：文章、站点与发布流水线。',
    color: '#f59e0b',
    achievementIds: ['ac-project-blog', 'ac-article-cli-ux', 'ac-wf-blog-publish'],
  },
];

/** 根据种子成果构建集合（剔除失效引用，保证引用完整性） */
export function seedCollections(items: Achievement[]): AchievementCollection[] {
  const idSet = new Set(items.map((a) => a.id));
  const base = new Date('2026-08-13T09:00:00+08:00').toISOString();
  return SEED_COLLECTIONS.map((c, i) => ({
    ...c,
    id: `col-${i + 1}`,
    achievementIds: c.achievementIds.filter((id) => idSet.has(id)),
    createdAt: base,
    updatedAt: base,
  }));
}
