/**
 * Chat 功能域 —— 消息 / 会话导出
 *
 * - messageToMarkdown / sessionToMarkdown / sessionToJson 为纯函数，
 *   便于测试与未来扩展（剪贴板、文件、消息外发）
 * - downloadTextFile 用 Blob 触发浏览器下载；失败时 toast 提示
 * 导出内容为纯文本会话数据，不包含附件二进制。
 */
import { modelLabel } from './models';
import { promptPresetName } from './presets';
import { pushToast } from './toast';
import type { ChatMessage, ChatSession } from './types';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function roleLabel(role: ChatMessage['role']): string {
  return role === 'user' ? '用户' : '助手';
}

/** 单条消息 → Markdown（含时间 / 模型 / 书签 / 引用） */
export function messageToMarkdown(msg: ChatMessage): string {
  const lines: string[] = [];
  lines.push(
    `### ${roleLabel(msg.role)} · ${fmtTime(msg.createdAt)}${msg.model ? ` · ${modelLabel(msg.model)}` : ''}${msg.bookmarked ? ' · 📌 已书签' : ''}`,
  );
  if (msg.quote) {
    lines.push(
      '',
      `> 引用自 ${roleLabel(msg.quote.role)}：${msg.quote.content.replace(/\n/g, '\n> ')}`,
    );
  }
  lines.push('', msg.content);
  return lines.join('\n');
}

/** 会话 → Markdown 文档（标题 / 元信息 / 系统提示词 / 全部消息） */
export function sessionToMarkdown(session: ChatSession): string {
  const bookmarks = session.messages.filter((m) => m.bookmarked).length;
  const userCount = session.messages.filter((m) => m.role === 'user').length;
  const header: string[] = [
    `# ${session.title}`,
    '',
    `- 模型：${modelLabel(session.model)}`,
    `- 创建：${fmtTime(session.createdAt)}`,
    `- 更新：${fmtTime(session.updatedAt)}`,
    `- 消息：${session.messages.length} 条（用户 ${userCount} / 助手 ${session.messages.length - userCount}）`,
    `- 书签：${bookmarks} 条`,
  ];
  if (session.systemPrompt?.text) {
    header.push(
      '',
      `- 系统提示词（${promptPresetName(session.systemPrompt.presetId)}）：`,
      '',
      '```',
      session.systemPrompt.text,
      '```',
    );
  }
  const body: string[] = [];
  session.messages.forEach((m, i) => {
    body.push('', '---', '', `## ${i + 1}. ${roleLabel(m.role)}`, '', messageToMarkdown(m));
  });
  return [...header, ...body].join('\n');
}

/** 会话 → JSON 文档（自包含：书签 / 引用 / 系统提示词均保留） */
export function sessionToJson(session: ChatSession): string {
  return JSON.stringify(
    {
      app: 'personal-os-chat',
      version: 1,
      exportedAt: new Date().toISOString(),
      session,
    },
    null,
    2,
  );
}

/** 触发浏览器下载文本文件；失败（环境不支持等）非阻塞提示 */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/markdown;charset=utf-8',
): void {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    pushToast('导出失败，请重试', 'warning');
  }
}

/** 文件名安全化：去除路径保留字符并限长 */
export function sanitizeFilename(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '-').trim();
  return cleaned.slice(0, 60) || '会话';
}
