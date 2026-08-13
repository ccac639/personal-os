/**
 * 复用包导出（纯函数，便于测试）
 *
 * 复用包只包含文本与 URL 元数据（附件仅存链接，不导出文件二进制）。
 */
import type { Achievement } from './types';

/** 复用包导出文件应用标识 */
export const REUSE_EXPORT_APP = 'personal-os-achievement-reuse';
export const REUSE_EXPORT_VERSION = 1;

export interface ReuseExportPayload {
  version: number;
  app: string;
  exportedAt: string;
  achievement: {
    id: string;
    title: string;
    type: Achievement['type'];
    completedAt: string;
  };
  reuse: Achievement['reuse'];
}

/** 生成复用包导出 JSON（含版本号与导出时间，可独立存档/分发） */
export function buildReuseExport(item: Achievement): string {
  const payload: ReuseExportPayload = {
    version: REUSE_EXPORT_VERSION,
    app: REUSE_EXPORT_APP,
    exportedAt: new Date().toISOString(),
    achievement: {
      id: item.id,
      title: item.title,
      type: item.type,
      completedAt: item.completedAt,
    },
    reuse: item.reuse,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * 复用包 Markdown 导出（人可读、可复制到文档/笔记工具）。
 * 只包含文本与 URL 元数据；外链按原样输出，无文件二进制。
 */
export function buildReuseMarkdown(item: Achievement): string {
  const lines: string[] = [];
  lines.push(`# 复用包：${item.title}`);
  lines.push('');
  lines.push(`- 类型：${item.type}`);
  lines.push(`- 完成日期：${item.completedAt}`);
  lines.push('');

  const r = item.reuse;
  if (r.links.length > 0) {
    lines.push('## 关键链接');
    for (const l of r.links) lines.push(`- [${l.label}](${l.url})`);
    lines.push('');
  }
  if (r.usageGuide.trim()) {
    lines.push('## 使用说明');
    lines.push(r.usageGuide.trim());
    lines.push('');
  }
  if (r.checklist.length > 0) {
    lines.push('## 交付清单');
    for (const c of r.checklist) lines.push(`- [ ] ${c}`);
    lines.push('');
  }
  if (r.retrospective.trim()) {
    lines.push('## 复盘笔记');
    lines.push(r.retrospective.trim());
    lines.push('');
  }
  if (r.templateSnippet.trim()) {
    lines.push('## 模板片段');
    lines.push('```');
    lines.push(r.templateSnippet.trim());
    lines.push('```');
    lines.push('');
  }
  // 去掉结尾多余空行
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

/** 是否包含可复用的实质内容（任一字段非空） */
export function hasReuse(item: Achievement): boolean {
  const r = item.reuse;
  return (
    r.links.length > 0 ||
    r.usageGuide.trim() !== '' ||
    r.checklist.length > 0 ||
    r.retrospective.trim() !== '' ||
    r.templateSnippet.trim() !== ''
  );
}

/** 复用包内容摘要（列表/卡片角标与抽屉占位用） */
export function reuseSummary(item: Achievement): string[] {
  const r = item.reuse;
  const parts: string[] = [];
  if (r.links.length > 0) parts.push(`关键链接 ${r.links.length} 个`);
  if (r.usageGuide.trim()) parts.push('使用说明');
  if (r.checklist.length > 0) parts.push(`交付清单 ${r.checklist.length} 项`);
  if (r.retrospective.trim()) parts.push('复盘笔记');
  if (r.templateSnippet.trim()) parts.push('模板片段');
  return parts;
}

/** 复用包导出文件名（下载用） */
export function reuseFilename(item: Achievement, date = new Date()): string {
  const safe = item.title
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const label = safe || item.id;
  return `reuse-${label}-${date.toISOString().slice(0, 10)}.json`;
}

/** 复用包 Markdown 导出文件名（与 JSON 导出同源清洗，扩展名 .md） */
export function reuseMarkdownFilename(item: Achievement, date = new Date()): string {
  const safe = item.title
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const label = safe || item.id;
  return `reuse-${label}-${date.toISOString().slice(0, 10)}.md`;
}
