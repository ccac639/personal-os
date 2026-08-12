/**
 * Chat 功能域 —— Markdown 渲染管线
 *
 * marked（GFM 解析）→ lowlight（代码高亮，hast 树）→ DOMPurify（XSS 清洗）。
 * 渲染结果以 HTML 字符串交给 v-html 输出，样式在组件内通过 .markdown-body 收敛。
 */
import DOMPurify from 'dompurify';
import { common, createLowlight } from 'lowlight';
import { Marked } from 'marked';

const lowlight = createLowlight(common);

/** lowlight 返回的 hast 节点（仅需 text / element 两种形态） */
interface HastNode {
  type: 'text' | 'element' | 'root' | string;
  tagName?: string;
  properties?: { className?: string | string[] };
  value?: string;
  children?: HastNode[];
}

/** 极简 hast → HTML 序列化（代码高亮树只有 span + text，够用且可控） */
function serializeHast(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  if (node.type === 'element') {
    const tag = node.tagName ?? 'span';
    const classes = node.properties?.className;
    const cls = Array.isArray(classes) ? classes.join(' ') : classes;
    const attr = cls ? ` class="${cls}"` : '';
    const inner = (node.children ?? []).map(serializeHast).join('');
    return `<${tag}${attr}>${inner}</${tag}>`;
  }
  return '';
}

/** 代码块高亮：优先按语言，失败/未知回退自动检测 */
function highlightCode(code: string, lang?: string): string {
  try {
    const tree =
      lang && lowlight.registered(lang)
        ? lowlight.highlight(lang, code)
        : lowlight.highlightAuto(code);
    return tree.children.map(serializeHast).join('');
  } catch {
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

const marked = new Marked({ gfm: true, breaks: true });

marked.use({
  renderer: {
    code(token: { text: string; lang?: string }) {
      const lang = token.lang?.toLowerCase() ?? '';
      const label = lang ? `<span class="code-lang">${lang}</span>` : '';
      // 复制按钮：点击事件由 chat-message.vue 事件委托处理，不注入内联 handler
      const copyBtn =
        '<button type="button" class="code-copy-btn" aria-label="复制代码" title="复制代码">复制</button>';
      return `<pre class="code-block">${copyBtn}${label}<code class="hljs">${highlightCode(
        token.text,
        lang,
      )}</code></pre>`;
    },
  },
});

/** 渲染 Markdown 为安全 HTML */
export function renderMarkdown(src: string): string {
  const raw = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['class'],
  });
}
