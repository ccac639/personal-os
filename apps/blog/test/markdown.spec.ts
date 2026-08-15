import { describe, expect, it } from 'vitest';

import {
  escapeHtml,
  estimateReadingMinutes,
  extractHeadings,
  renderMarkdown,
} from '../server/utils/markdown';

describe('markdown 渲染器（子集）', () => {
  it('标题降一级渲染并带锚点 id', () => {
    expect(renderMarkdown('# 一级\n\n## 二级')).toContain('<h2 id="一级">一级</h2>');
    expect(renderMarkdown('# 一级\n\n## 二级')).toContain('<h3 id="二级">二级</h3>');
  });

  it('extractHeadings 提取标题结构（id 与渲染一致）', () => {
    const src = '# 标题\n\n## 子标题\n\n## 标题\n\n### 嵌套';
    const headings = extractHeadings(src);
    expect(headings).toEqual([
      { id: '标题', text: '标题', level: 2 },
      { id: '子标题', text: '子标题', level: 3 },
      { id: '标题-2', text: '标题', level: 3 },
      { id: '嵌套', text: '嵌套', level: 4 },
    ]);
    // 与渲染 HTML 中的 id 一致
    const html = renderMarkdown(src);
    expect(html).toContain('<h2 id="标题">');
    expect(html).toContain('<h3 id="标题-2">');
  });

  it('extractHeadings 处理符号/去重边界', () => {
    expect(extractHeadings('## 你好，世界！')).toEqual([
      { id: '你好-世界', text: '你好，世界！', level: 3 },
    ]);
    expect(extractHeadings('## !!!')).toEqual([{ id: 'section', text: '!!!', level: 3 }]);
  });

  it('段落与软换行', () => {
    const html = renderMarkdown('第一段\n第二行\n\n新段落');
    expect(html).toContain('<p>第一段 第二行</p>');
    expect(html).toContain('<p>新段落</p>');
  });

  it('行内样式：粗体/斜体/行内代码', () => {
    const html = renderMarkdown('**粗体** 与 *斜体* 与 `code <tag>`');
    expect(html).toContain('<strong>粗体</strong>');
    expect(html).toContain('<em>斜体</em>');
    expect(html).toContain('<code>code &lt;tag&gt;</code>');
  });

  it('链接：外部加 target/rel，站内相对链接不加', () => {
    const html = renderMarkdown('[外部](https://example.com) 与 [站内](/posts/a)');
    expect(html).toContain(
      '<a href="https://example.com" rel="noopener noreferrer" target="_blank">外部</a>',
    );
    expect(html).toContain('<a href="/posts/a">站内</a>');
  });

  it('危险协议退化为纯文本，不输出链接', () => {
    const html = renderMarkdown('[坏链接](javascript:alert(1))');
    expect(html).not.toContain('<a');
    expect(html).toContain('[坏链接](javascript:alert(1))');
  });

  it('原始 HTML 一律转义', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('围栏代码块带语言 class 且内容转义', () => {
    const html = renderMarkdown('```ts\nconst a: string = "<b>";\n```');
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain('const a: string = "&lt;b&gt;";');
  });

  it('引用块', () => {
    const html = renderMarkdown('> 第一行引用\n> 第二行引用');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<p>第一行引用 第二行引用</p>');
  });

  it('无序列表与二级嵌套', () => {
    const html = renderMarkdown('- 甲\n- 乙\n  - 乙一\n- 丙');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>甲</li>');
    expect(html).toContain('<li>乙一</li>');
    expect(html).toContain('</ul>');
  });

  it('有序列表', () => {
    const html = renderMarkdown('1. 第一步\n2. 第二步');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>第一步</li>');
  });

  it('分隔线', () => {
    expect(renderMarkdown('---')).toContain('<hr>');
  });

  it('图片', () => {
    const html = renderMarkdown('![alt 文本](/img/a.png "标题")');
    expect(html).toContain(
      '<img src="/img/a.png" alt="alt 文本" loading="lazy" decoding="async" width="768" height="432" title="标题">',
    );
  });
});

describe('阅读时长估算', () => {
  it('中文按 400 字/分钟', () => {
    expect(estimateReadingMinutes('中'.repeat(800))).toBe(2);
  });

  it('英文按 200 词/分钟', () => {
    expect(estimateReadingMinutes('word '.repeat(200))).toBe(1);
  });

  it('至少 1 分钟', () => {
    expect(estimateReadingMinutes('短')).toBe(1);
  });
});

describe('escapeHtml', () => {
  it('转义五个特殊字符', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
