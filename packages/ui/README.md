# @personal-os/ui

全局设计系统（共享 UI 组件库）。

## 目录

```
src/
├── components/   # 组件（Button / Input / Dialog / ... 后续阶段实现）
├── composables/  # 组合式函数（后续阶段实现）
├── styles/       # base.css 全局样式入口
└── index.ts      # 包入口
```

## 使用

```ts
// 组件（实现后）
import { Button } from '@personal-os/ui';

// 样式
// 在应用 CSS 中：
// @import "@personal-os/ui/styles";
```

## 设计原则

- 基于 Tailwind CSS v4（CSS-first，无 tailwind.config.js）
- 设计令牌统一由 `@personal-os/config/tailwind` 的 `@theme` 提供
- 组件基于 reka-ui（headless）封装，样式在本包内完成
- 禁止在应用层直接修改本包组件的内部 DOM 结构
