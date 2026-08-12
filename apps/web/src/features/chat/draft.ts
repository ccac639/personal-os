/**
 * Chat 功能域 —— 附件草稿（纯前端，不接后端）
 *
 * 安全约定：附件二进制与 blob URL 只存在于组件内存，
 * 绝不写入 localStorage（storage.ts 的 schema 也不包含附件字段）。
 * 校验逻辑收敛在本模块便于测试：类型白名单 / 大小上限 / 数量上限。
 */
import type { ChatAttachmentDraft, ChatDraftValidationError } from './types';
import { uid } from './utils';

export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/avif',
  'image/bmp',
]);

export interface DraftValidationResult {
  items: ChatAttachmentDraft[];
  errors: ChatDraftValidationError[];
}

/**
 * 校验并转换待加入附件：类型 / 大小 / 数量逐项校验，
 * 非法项返回错误（不阻断合法项），超量直接拒绝。
 */
export function validateDraftFiles(
  files: File[],
  existing: ChatAttachmentDraft[],
  createUrl: (file: File) => string,
): DraftValidationResult {
  const errors: ChatDraftValidationError[] = [];
  const items: ChatAttachmentDraft[] = [];
  let remaining = MAX_ATTACHMENTS - existing.length;

  for (const f of files) {
    if (!ALLOWED_IMAGE_TYPES.has(f.type)) {
      errors.push({
        code: 'type',
        message: `${f.name}：仅支持常见图片格式（PNG/JPG/WebP/GIF/SVG）`,
        fileName: f.name,
      });
      continue;
    }
    if (f.size > MAX_ATTACHMENT_SIZE) {
      errors.push({
        code: 'size',
        message: `${f.name}：超过 10MB 限制`,
        fileName: f.name,
      });
      continue;
    }
    if (remaining <= 0) {
      errors.push({
        code: 'count',
        message: `最多添加 ${MAX_ATTACHMENTS} 张图片`,
      });
      continue;
    }
    items.push({
      id: uid(),
      name: f.name,
      type: f.type,
      size: f.size,
      url: createUrl(f),
    });
    remaining -= 1;
  }
  return { items, errors };
}

/** 拖拽排序：返回新数组，越界 / 相同位置返回原顺序副本 */
export function reorderAttachments<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  if (from < 0 || from >= copy.length || to < 0 || to >= copy.length || from === to) {
    return copy;
  }
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved!);
  return copy;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
