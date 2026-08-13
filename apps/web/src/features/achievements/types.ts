/**
 * 已完成（成果库）领域类型
 *
 * 本模块为纯前端 mock：数据由 localStorage 持久化，不依赖后端。
 * 附件仅保存 URL/元数据（LinkItem），绝不持久化文件二进制。
 */

/** 成果类型 */
export type AchievementType = 'project' | 'article' | 'workflow' | 'code' | 'milestone';

/** 关键指标（key-value 对，如「测试覆盖率 / 96%」） */
export interface AchievementMetric {
  label: string;
  value: string;
}

/** 关联链接（复用包关键链接 / 附件元数据；仅存 URL，不持久化文件二进制） */
export interface LinkItem {
  label: string;
  /** 仅 http/https 外链，打开时走安全属性 */
  url: string;
}

/** 成果关系（仅存本地引用 ID，不修改其他模块 Store） */
export interface AchievementRelations {
  /** 关联项目 id（对应 projects 模块的 project.id） */
  projectIds: string[];
  /** 关联工作流 id（对应 workflows 模块的 workflow.id） */
  workflowIds: string[];
  /** 前置成果 id（本成果承接/依赖的成果） */
  predecessorIds: string[];
  /** 衍生成果 id（由本成果派生的成果） */
  derivedIds: string[];
}

export function emptyRelations(): AchievementRelations {
  return { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] };
}

/** 复用包：把成果沉淀为可复用资产（关键链接 / 使用说明 / 交付清单 / 复盘 / 模板片段） */
export interface ReusePackage {
  /** 关键链接（仅保存名称与 URL） */
  links: LinkItem[];
  /** 使用说明 */
  usageGuide: string;
  /** 交付清单（逐项可勾选） */
  checklist: string[];
  /** 复盘笔记 */
  retrospective: string;
  /** 可复制模板片段（代码 / 文案） */
  templateSnippet: string;
}

export function emptyReuse(): ReusePackage {
  return { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' };
}

/** 成果条目 */
export interface Achievement {
  id: string;
  type: AchievementType;
  title: string;
  /** 一句话摘要（卡片/列表展示） */
  summary: string;
  /** 详细描述（抽屉展示） */
  description: string;
  tags: string[];
  /** 关联项目（自由文本，兼容旧数据；结构化关系见 relations.projectIds） */
  relatedProject?: string;
  /** 完成日期 YYYY-MM-DD */
  completedAt: string;
  /** 外部链接 */
  link?: string;
  metrics: AchievementMetric[];
  /** 关系（仅存本地引用 ID） */
  relations: AchievementRelations;
  /** 复用包 */
  reuse: ReusePackage;
  pinned: boolean;
  archived: boolean;
  /** 手动排序序号（越小越靠前；置顶组内生效） */
  order?: number;
  createdAt: string;
  updatedAt: string;
}

/** 新增/编辑表单负载（不含 id 与运行时状态字段） */
export type AchievementDraft = Omit<
  Achievement,
  'id' | 'pinned' | 'archived' | 'createdAt' | 'updatedAt' | 'order'
>;

/** 归档过滤：全部 / 仅未归档 / 仅已归档 */
export type ArchiveFilter = 'all' | 'active' | 'archived';

/** 成果库视图模式 */
export type AchievementView = 'card' | 'list' | 'timeline';

/** 排序方式（置顶恒优先） */
export type AchievementSort = 'date-desc' | 'date-asc' | 'updated' | 'title' | 'manual';

/** 导出范围：全库 / 单项 / 单个集合 */
export type ExportScope = 'all' | 'single' | 'collection';

/** 筛选条件（year/month 为 null 表示不限制；month 依赖 year） */
export interface AchievementFilters {
  keyword: string;
  types: AchievementType[];
  year: number | null;
  month: number | null;
  tags: string[];
  archived: ArchiveFilter;
  sort: AchievementSort;
  /** 结构化搜索：标题包含 */
  titleQuery: string;
  /** 结构化搜索：描述包含 */
  descQuery: string;
  /** 结构化搜索：关联项目名称包含（匹配 relations.projectIds 对应名称或 relatedProject 文本） */
  projectQuery: string;
}

/** 空筛选（默认值） */
export function emptyFilters(): AchievementFilters {
  return {
    keyword: '',
    types: [],
    year: null,
    month: null,
    tags: [],
    archived: 'active',
    sort: 'date-desc',
    titleQuery: '',
    descQuery: '',
    projectQuery: '',
  };
}

/** UI 偏好：视图 + 筛选（含排序），独立于成果数据持久化 */
export interface AchievementUiState {
  view: AchievementView;
  filters: AchievementFilters;
}

export function defaultUiState(): AchievementUiState {
  return { view: 'card', filters: emptyFilters() };
}

/** 成果集合：可创建、手动排序（achievementIds 有序）、封面色、说明、成果引用 */
export interface AchievementCollection {
  id: string;
  name: string;
  description: string;
  /** 封面色（CSS 颜色值） */
  color: string;
  /** 引用成果 id（有序，集合内手动排序） */
  achievementIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** 集合表单负载（不含 id 与运行时状态字段） */
export type CollectionDraft = Pick<AchievementCollection, 'name' | 'description' | 'color'>;

/** 保存的筛选方案（独立于当前筛选持久化，可一键恢复） */
export interface SavedFilter {
  id: string;
  name: string;
  filters: AchievementFilters;
  createdAt: string;
}
