/**
 * Admin 功能域 —— 系统诊断
 *
 * - 生成可复制纯文本 / 可导出 JSON 的本地诊断报告。
 * - 只读操作：不修改任何用户数据。
 * - 敏感边界：Provider 只报告「已配置 / 未配置」，绝不暴露 API Key 内容或长度。
 */
import { APP_VERSION } from './backup';
import { MODULE_REGISTRY, scanModule } from './registry';
import type { DiagnosticsReport, ProviderDiagnostic, StorageEstimate } from './types';

/** Web Storage 常见配额上限：5MB（浏览器默认，本地应用可接受近似值） */
const DEFAULT_QUOTA_BYTES = 5 * 1024 * 1024;
/** 接近配额阈值：80% */
const NEAR_QUOTA_RATIO = 0.8;

/** 估算 localStorage 用量与配额占用（只读遍历，不删除任何数据） */
export function estimateStorage(): StorageEstimate {
  let totalBytes = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key === null) continue;
      const value = window.localStorage.getItem(key);
      if (value === null) continue;
      try {
        totalBytes += new Blob([value]).size;
      } catch {
        totalBytes += value.length * 2;
      }
    }
  } catch {
    /* localStorage 不可用：用量按 0 处理，可用性由能力探测表达 */
  }
  const ratio = totalBytes / DEFAULT_QUOTA_BYTES;
  return {
    totalBytes,
    quotaBytes: DEFAULT_QUOTA_BYTES,
    ratio,
    nearQuota: ratio >= NEAR_QUOTA_RATIO,
  };
}

export interface CapabilityProbe {
  fileImport: boolean;
  blobDownload: boolean;
  clipboard: boolean;
  webStorage: boolean;
}

/** 可选能力探测（仅检测存在性，不触发权限弹窗） */
export function probeCapabilities(): CapabilityProbe {
  return {
    fileImport: typeof FileReader !== 'undefined' && typeof File !== 'undefined',
    blobDownload:
      typeof Blob !== 'undefined' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function',
    clipboard:
      typeof navigator !== 'undefined' &&
      navigator.clipboard !== undefined &&
      typeof navigator.clipboard.writeText === 'function',
    webStorage: typeof window !== 'undefined' && window.localStorage !== undefined,
  };
}

/** 读取 Provider 诊断（仅报告是否已配置，绝不读取 Key 内容） */
export function collectProviderDiagnostics(
  providers: { id: string; name: string; enabled: boolean; hasKey: boolean }[],
): ProviderDiagnostic[] {
  return providers.map((p) => ({
    id: p.id,
    name: p.name,
    enabled: p.enabled,
    configured: p.hasKey,
  }));
}

/** 生成诊断报告（不修改任何数据） */
export function buildDiagnosticsReport(options: {
  route: string;
  theme: string;
  density: string;
  reduceMotion: boolean;
  providers: { id: string; name: string; enabled: boolean; hasKey: boolean }[];
}): DiagnosticsReport {
  const caps = probeCapabilities();
  return {
    generatedAt: new Date().toISOString(),
    app: {
      name: 'Personal OS',
      version: APP_VERSION,
      route: options.route,
      theme: options.theme,
      density: options.density,
      reduceMotion: options.reduceMotion,
      language: navigator.language ?? 'unknown',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown',
    },
    storage: estimateStorage(),
    modules: MODULE_REGISTRY.map((entry) => scanModule(entry)),
    providers: collectProviderDiagnostics(options.providers),
    capabilities: {
      fileImport: caps.fileImport,
      blobDownload: caps.blobDownload,
      clipboard: caps.clipboard,
      webStorage: caps.webStorage,
    },
    notice:
      '提醒：这是本地 mock 前端，未连接真实模型、后端与定时任务；本报告仅反映浏览器本地状态。',
  };
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const STATUS_LABEL: Record<string, string> = {
  ok: '正常',
  missing: '无数据',
  corrupt: '损坏',
  unreadable: '不可读',
  newer: '版本过新',
};

/** 诊断报告 → 可复制纯文本 */
export function diagnosticsToText(report: DiagnosticsReport): string {
  const lines: string[] = [];
  lines.push('Personal OS 本地诊断报告');
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push('');
  lines.push(`应用：${report.app.name} v${report.app.version}`);
  lines.push(`当前路由：${report.app.route}`);
  lines.push(`主题：${report.app.theme}`);
  lines.push(`显示密度：${report.app.density}`);
  lines.push(`减少动效：${report.app.reduceMotion ? '开' : '关'}`);
  lines.push(`浏览器语言：${report.app.language}`);
  lines.push(`时区：${report.app.timezone}`);
  lines.push('');
  lines.push(
    `本地存储用量：${fmtBytes(report.storage.totalBytes)} / ${fmtBytes(report.storage.quotaBytes)}`,
  );
  lines.push(`接近配额：${report.storage.nearQuota ? '是' : '否'}`);
  lines.push('');
  lines.push('模块状态：');
  for (const m of report.modules) {
    const version = m.version !== null ? `v${m.version}` : '未识别';
    const summary = m.summary ? `（${m.summary.detail}）` : '';
    lines.push(`  - ${m.label}：${STATUS_LABEL[m.status] ?? m.status}，版本 ${version}${summary}`);
  }
  lines.push('');
  lines.push('AI Provider：');
  for (const p of report.providers) {
    lines.push(
      `  - ${p.name}：${p.enabled ? '启用' : '禁用'} / ${p.configured ? '已配置' : '未配置'}`,
    );
  }
  lines.push('');
  lines.push('能力状态：');
  lines.push(`  文件导入：${report.capabilities.fileImport ? '可用' : '不可用'}`);
  lines.push(`  Blob 下载：${report.capabilities.blobDownload ? '可用' : '不可用'}`);
  lines.push(`  剪贴板 API：${report.capabilities.clipboard ? '可用' : '不可用'}`);
  lines.push(`  Web Storage：${report.capabilities.webStorage ? '可用' : '不可用'}`);
  lines.push('');
  lines.push(report.notice);
  return lines.join('\n');
}

/** 诊断报告 → JSON 文本 */
export function diagnosticsToJson(report: DiagnosticsReport): string {
  return JSON.stringify(report, null, 2);
}

/** 复制纯文本到剪贴板；不可用时回退到选中提示（返回是否成功） */
export async function copyDiagnosticsText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 权限拒绝等，回退 */
  }
  return false;
}
