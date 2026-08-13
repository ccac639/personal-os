/**
 * Admin 功能域 —— 类型定义
 *
 * 管理系统是个人本地应用的「设置 / 数据维护 / 诊断 / 备份 / 安全边界」工作台。
 * 本项目仅供单个所有者本地使用：无登录、无用户、无后端 API。
 */

/** 管理系统二级导航 section */
export type AdminSection =
  'overview' | 'preferences' | 'ai-providers' | 'data' | 'automation' | 'diagnostics' | 'danger';

/** 主题模式：浅色 / 深色 / 跟随系统 */
export type AdminThemeMode = 'light' | 'dark' | 'system';
/** 信息密度 */
export type AdminDensity = 'comfortable' | 'compact';
/** 默认进入页面 */
export type AdminDefaultPage = 'dashboard' | 'chat' | 'workflows' | 'projects' | 'achievements';

/* ---------------- 个人偏好 ---------------- */

export interface AdminProfile {
  displayName: string;
  avatarUrl: string;
  bio: string;
  timezone: string;
  language: string;
}

export interface AdminAppearance {
  themeMode: AdminThemeMode;
  /** 是否在管理系统中显式选择过主题（避免首次进入时覆盖既有主题） */
  themeModeInitialized: boolean;
  density: AdminDensity;
  reduceMotion: boolean;
  defaultPage: AdminDefaultPage;
  use24Hour: boolean;
  relativeTime: boolean;
}

/** 工作流运行模式偏好 */
export type WorkflowRunMode = 'manual' | 'simulate';

export interface AutomationPrefs {
  workflowRunMode: WorkflowRunMode;
  notifyWorkflowComplete: boolean;
  notifyWorkflowFailed: boolean;
  notifyHealthWarning: boolean;
  dailyPlanReminder: boolean;
  dailyPlanTime: string;
  deadlineReminder: boolean;
  deadlineTime: string;
  weeklyReviewReminder: boolean;
  weeklyReviewTime: string;
  /** 周复盘提醒日：0=周日 … 6=周六 */
  weeklyReviewDay: number;
}

export interface AdminPreferences {
  profile: AdminProfile;
  appearance: AdminAppearance;
  automation: AutomationPrefs;
}

export interface AdminPrefsEnvelope {
  version: number;
  prefs: AdminPreferences;
}

export interface AdminPrefsResult {
  prefs: AdminPreferences;
  /** 数据损坏 / 版本过新 / 读取失败被回退时置 true，UI 非阻塞提示 */
  recovered: boolean;
}

/* ---------------- AI 配置 ---------------- */

export type ProviderCapability = 'chat' | 'writing' | 'code' | 'vision';

/** Provider 配置（持久化部分：apiKey 绝不落盘） */
export interface AdminProvider {
  id: string;
  name: string;
  enabled: boolean;
  defaultModel: string;
  capabilities: ProviderCapability[];
  /** 优先级：数字越小越优先 */
  priority: number;
  /** 超时偏好（秒） */
  timeoutSeconds: number;
  /** 是否已配置 API Key（仅布尔标记，key 本身只在内存态） */
  hasKey: boolean;
}

/** Provider 会话内存态（含 API Key，仅存在于 Pinia store 内存） */
export interface AdminProviderDraft extends AdminProvider {
  apiKey: string;
}

export interface AdminModelEntry {
  id: string;
  name: string;
  providerId: string;
  modes: ProviderCapability[];
  context: string;
  isDefault: boolean;
}

export interface ConnectionCheckResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

/* ---------------- 存储注册表 / 模块快照 ---------------- */

export type StorageKeyKind = 'data' | 'cache' | 'legacy';

export interface RegistryKey {
  key: string;
  kind: StorageKeyKind;
}

export interface ModuleSummary {
  /** 记录数量（能安全推断时） */
  count: number;
  /** 人读摘要，如「12 条会话」 */
  detail: string;
}

export interface AdminModuleEntry {
  id: string;
  label: string;
  keys: RegistryKey[];
  /** 当前数据版本；无版本信封（如裸数组）时为 null */
  currentVersion: number | null;
  /** 是否支持合并恢复（仅结构简单的模块启用） */
  mergeSupported: boolean;
  /** 从原始存储字符串识别版本号（宽容解析，失败返回 null） */
  versionOf: (raw: string) => number | null;
  /** 对解析后的数据生成摘要（宽容解析，失败返回 count 0） */
  summarize: (parsed: unknown) => ModuleSummary;
}

export type ModuleStatus = 'ok' | 'missing' | 'corrupt' | 'unreadable' | 'newer';

export interface ModuleSnapshot {
  moduleId: string;
  label: string;
  status: ModuleStatus;
  present: boolean;
  version: number | null;
  summary: ModuleSummary | null;
  keysFound: string[];
  sizeBytes: number;
}

/* ---------------- 备份 / 恢复 ---------------- */

export interface BackupModuleData {
  key: string;
  kind: StorageKeyKind;
  data: unknown;
}

export interface BackupModule {
  moduleId: string;
  label: string;
  version: number | null;
  keys: BackupModuleData[];
}

export interface BackupPayload {
  app: 'personal-os';
  appVersion: string;
  exportedAt: string;
  modules: BackupModule[];
}

export type RestoreMode = 'skip' | 'overwrite' | 'merge';

export interface RestorePlanItem {
  moduleId: string;
  label: string;
  /** 备份内该模块数据版本 */
  backupVersion: number | null;
  /** 当前本地版本 */
  localVersion: number | null;
  /** 版本对比：备份比本地新 / 相同 / 旧 / 无版本信息 */
  conflict: 'newer' | 'same' | 'older' | 'none';
  /** 摘要计数（来自备份数据） */
  count: number;
  /** 备份中该模块数据是否可解析 */
  parseable: boolean;
  supportedModes: RestoreMode[];
}

export interface RestorePreview {
  valid: boolean;
  error?: string;
  appVersion?: string;
  exportedAt?: string;
  modules: RestorePlanItem[];
}

export interface RestoreResult {
  ok: boolean;
  restored: string[];
  skipped: string[];
  error?: string;
}

/** 导入前自动创建的临时回滚备份（仅内存，可下载） */
export interface RollbackSnapshot {
  createdAt: string;
  appVersion: string;
  modules: BackupModule[];
}

/* ---------------- 诊断 ---------------- */

export interface StorageEstimate {
  totalBytes: number;
  quotaBytes: number;
  ratio: number;
  nearQuota: boolean;
}

export interface ProviderDiagnostic {
  id: string;
  name: string;
  enabled: boolean;
  /** 仅报告「已配置 / 未配置」，绝不暴露 Key 内容或长度 */
  configured: boolean;
}

export interface DiagnosticsReport {
  generatedAt: string;
  app: {
    name: string;
    version: string;
    route: string;
    theme: string;
    density: string;
    reduceMotion: boolean;
    language: string;
    timezone: string;
  };
  storage: StorageEstimate;
  modules: ModuleSnapshot[];
  providers: ProviderDiagnostic[];
  capabilities: Record<string, boolean>;
  /** 本地 mock 前端提醒文案 */
  notice: string;
}

/* ---------------- 通知模拟 ---------------- */

export type SimulatedNotificationKind =
  | 'workflow-complete'
  | 'workflow-failed'
  | 'health-warning'
  | 'daily-plan'
  | 'deadline'
  | 'weekly-review';

export interface SimulatedNotification {
  id: number;
  kind: SimulatedNotificationKind;
  title: string;
  body: string;
  time: string;
}
