---
title: Tailwind v4 设计令牌：从 theme 到语义化类
description: 示例文章：CSS-first 配置下如何用 @theme 定义设计令牌并保持深浅色可读。
date: 2026-08-09
tags: [tailwind, css]
category: 技术
---

> 本文为示例文章，演示代码块、列表与行内样式的渲染效果。

Tailwind v4 把配置从 `tailwind.config.js` 搬进了 CSS，用 `@theme` 声明
设计令牌，例如：

```css
@theme {
  --color-brand-500: #6366f1;
  --color-surface-900: #0f172a;
}
```

## 语义化类名

页面里尽量少写裸色值，而是组合出语义：

- `bg-surface-50` / `dark:bg-surface-900`：页面底色
- `text-surface-900` / `dark:text-surface-100`：正文
- `border-surface-100`：分隔线

## 深浅色适配

`dark:` 变体在 v4 默认跟随 `prefers-color-scheme`，无需手动切换器：

```html
<div class="bg-surface-0 dark:bg-surface-900">内容卡片</div>
```

## 小贴士

- `*italic*` 与 `**bold**` 行内样式
- `inline code` 用于行内代码
- 外部链接默认新窗口打开：<https://tailwindcss.com>

## 待办

1. 校验色阶对比度
2. 补充代码块配色
3. 沉淀到 `@personal-os/config/tailwind`

---

以上即本篇要点，完整实现见仓库源码。
