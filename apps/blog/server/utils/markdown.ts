/**
 * Markdown 子集渲染器（零依赖实现）。
 *
 * 为什么自研而不是引入 markdown-it / @nuxt/content：
 * 本线红线禁止新增运行时依赖（改动会触及根 lockfile），而博客内容为自有
 * 策展内容，只需覆盖固定子集即可安全发布。这里只实现以下语法，其余一律
 * 按纯文本转义输出，杜绝原始 HTML 注入：
 *
 *   - 围栏代码块 ```lang ... ```
 *   - 标题 # ~ ######（渲染时整体降一级，避免与页面 h1 标题冲突）
 *   - 段落、软换行、分隔线 ---
 *   - 无序/有序列表（支持一级缩进嵌套）
 *   - 引用块 >
 *   - 行内：`code`、**bold**、*italic*、[link](url)、![alt](src)
 *
 * 所有文本先做 HTML 转义再套行内规则；链接仅允许 http(s)/mailto/站内相对
 * 路径，javascript: 等危险协议直接退化为纯文本。
 */

/** HTML 属性值转义（文本内容用 escapeText，属性值必须转引号）。 */
export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 文本内容转义：引号在文本节点中无需转义，保留可让行内语法继续匹配。 */
function escapeText(input: string): string {
  return input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const SAFE_URL_RE = /^(?:https?:|mailto:|\/|#)/i;

/** 校验链接协议，危险协议返回 null（调用方退化为纯文本）。 */
function safeHref(href: string): string | null {
  const trimmed = href.trim();
  return SAFE_URL_RE.test(trimmed) ? trimmed : null;
}

/** 解析 `url "title"` 形态的链接/图片目标。 */
function parseLinkTarget(raw: string): { href: string; title?: string } {
  const parts = raw.trim().split(/\s+/);
  const href = parts[0] ?? '';
  const title = parts.slice(1).join(' ').replace(/^"|"$/g, '');
  return { href, title: title === '' ? undefined : title };
}

/** 行内规则（顺序即优先级：code > image > link > bold > italic）。 */
const INLINE_RE =
  /(`+)(.+?)\1|!\[([^\]]*)\]\(([^)]*)\)|\[([^\]]+)\]\(([^)]*)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;

function renderInline(text: string): string {
  return text.replace(
    INLINE_RE,
    (
      match,
      _ticks: string,
      code: string | undefined,
      alt: string | undefined,
      imgTarget: string | undefined,
      label: string | undefined,
      linkTarget: string | undefined,
      bold: string | undefined,
      bold2: string | undefined,
      italic: string | undefined,
      italic2: string | undefined,
    ) => {
      if (code !== undefined) {
        // 内容来自已转义文本，直接取用（只去除首尾单个空格），避免二次转义
        return `<code>${code.replace(/^ +| +$/g, '')}</code>`;
      }
      if (alt !== undefined && imgTarget !== undefined) {
        const target = parseLinkTarget(imgTarget);
        const safe = safeHref(target.href);
        if (!safe) {
          return escapeText(match);
        }
        const titleAttr = target.title ? ` title="${escapeHtml(target.title)}"` : '';
        return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}" loading="lazy"${titleAttr}>`;
      }
      if (label !== undefined && linkTarget !== undefined) {
        const target = parseLinkTarget(linkTarget);
        const safe = safeHref(target.href);
        if (!safe) {
          // 危险协议：退化为纯文本（仍转义），不输出链接
          return escapeText(match);
        }
        const external = /^https?:/i.test(safe);
        const rel = external ? ' rel="noopener noreferrer" target="_blank"' : '';
        return `<a href="${escapeHtml(safe)}"${rel}>${renderInline(label)}</a>`;
      }
      if (bold !== undefined) {
        return `<strong>${renderInline(bold)}</strong>`;
      }
      if (bold2 !== undefined) {
        return `<strong>${renderInline(bold2)}</strong>`;
      }
      if (italic !== undefined) {
        return `<em>${renderInline(italic)}</em>`;
      }
      if (italic2 !== undefined) {
        return `<em>${renderInline(italic2)}</em>`;
      }
      return match;
    },
  );
}

interface ListItem {
  /** 缩进层级（0 = 一级，1 = 二级）。 */
  depth: number;
  content: string;
  ordered: boolean;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const QUOTE_RE = /^>\s?/;
const UNORDERED_ITEM_RE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_ITEM_RE = /^(\s*)\d+[.)]\s+(.*)$/;

/** 将 Markdown 子集渲染为 HTML。 */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    const text = escapeText(paragraph.join('\n')).replace(/\n/g, ' ');
    blocks.push(`<p>${renderInline(text)}</p>`);
    paragraph = [];
  };

  const pushBlockquote = (quoteLines: string[]) => {
    const inner = quoteLines.map((l) => l.replace(QUOTE_RE, '')).join('\n');
    const paragraphs = inner
      .split(/\n{2,}/)
      .filter((p) => p.trim().length > 0)
      .map((p) => `<p>${renderInline(escapeText(p.replace(/\n/g, ' ')))}</p>`)
      .join('\n');
    blocks.push(`<blockquote>\n${paragraphs}\n</blockquote>`);
  };

  const pushList = (items: ListItem[]) => {
    const rootOrdered = items[0]?.ordered ?? false;
    let html = rootOrdered ? '<ol>' : '<ul>';
    let prevDepth = 0;
    let nestedOrdered = false;
    for (const item of items) {
      if (item.depth > prevDepth) {
        // 进入嵌套层：用当前项目的有序标记开标签
        html += `\n${item.ordered ? '<ol>' : '<ul>'}`;
        nestedOrdered = item.ordered;
      } else if (item.depth < prevDepth) {
        // 退出嵌套层：用进入该层时记录的有序标记闭合
        html += `\n${nestedOrdered ? '</ol>' : '</ul>'}`;
      }
      html += `\n<li>${renderInline(escapeText(item.content))}</li>`;
      prevDepth = item.depth;
    }
    if (prevDepth === 1) {
      html += `\n${nestedOrdered ? '</ol>' : '</ul>'}`;
    }
    html += `\n${rootOrdered ? '</ol>' : '</ul>'}`;
    blocks.push(html);
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    // 空行：结束当前段落
    if (line.trim() === '') {
      flushParagraph();
      i += 1;
      continue;
    }

    // 围栏代码块
    const fenceMatch = /^```(\w*)\s*$/.exec(line);
    if (fenceMatch) {
      flushParagraph();
      const lang = fenceMatch[1];
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        codeLines.push(lines[i]!);
        i += 1;
      }
      // 已消费到结束围栏或文件末尾
      i += 1;
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      blocks.push(`<pre><code${langAttr}>${escapeText(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // 标题（降一级：h1 -> h2 ... h6 -> h6）
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph();
      const level = Math.min(6, heading[1]!.length + 1);
      blocks.push(`<h${level}>${renderInline(escapeText(heading[2]!))}</h${level}>`);
      i += 1;
      continue;
    }

    // 分隔线
    if (HR_RE.test(line)) {
      flushParagraph();
      blocks.push('<hr>');
      i += 1;
      continue;
    }

    // 引用块：连续 '>' 行
    if (QUOTE_RE.test(line)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i]!)) {
        quoteLines.push(lines[i]!);
        i += 1;
      }
      pushBlockquote(quoteLines);
      continue;
    }

    // 列表：连续项目行（含二级缩进），遇空行结束
    const firstUnordered = UNORDERED_ITEM_RE.exec(line);
    const firstOrdered = ORDERED_ITEM_RE.exec(line);
    if (firstUnordered || firstOrdered) {
      flushParagraph();
      const items: ListItem[] = [];
      const baseOrdered = Boolean(firstOrdered);
      while (i < lines.length) {
        const raw = lines[i]!;
        if (raw.trim() === '') {
          break;
        }
        const u = UNORDERED_ITEM_RE.exec(raw);
        const o = ORDERED_ITEM_RE.exec(raw);
        const match = baseOrdered ? o : u;
        if (!match) {
          break;
        }
        const indent = match[1]!.replace(/\t/g, '  ').length;
        const depth = indent >= 2 ? 1 : 0;
        items.push({ depth, content: match[2]!.trim(), ordered: Boolean(o) });
        i += 1;
      }
      pushList(items);
      continue;
    }

    // 普通段落行
    paragraph.push(line);
    i += 1;
  }

  flushParagraph();
  return blocks.join('\n');
}

/** 估算阅读时长：中文按 400 字/分钟、英文按 200 词/分钟，向上取整且至少 1 分钟。 */
export function estimateReadingMinutes(source: string): number {
  const cjkCount = (source.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const latinWords = (source.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) ?? []).length;
  const minutes = Math.ceil(cjkCount / 400 + latinWords / 200);
  return Math.max(1, minutes);
}
