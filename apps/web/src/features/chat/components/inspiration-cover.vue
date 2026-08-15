<script setup lang="ts">
/**
 * 灵感封面：纯本地 CSS 视觉预设（配色 / 网格 / 纸张 / 代码 / 极简 / 几何）
 * 不使用外部图片 URL，不下载图像，不引入版权素材。
 */
import { computed } from 'vue';

import { visualPresetClass } from '../inspiration';
import type { InspirationCategory, InspirationVisualPreset } from '../inspiration-types';

const props = defineProps<{
  preset: InspirationVisualPreset;
  category: InspirationCategory;
  title: string;
}>();

const className = computed(() => visualPresetClass(props.preset));

const categoryMark = computed(() => {
  const map: Record<InspirationCategory, string> = {
    writing: '文',
    code: '码',
    vision: '视',
    research: '研',
    efficiency: '效',
    other: '灵',
  };
  return map[props.category] ?? '灵';
});
</script>

<template>
  <div
    class="insp-cover relative flex h-28 w-full overflow-hidden"
    :class="className"
    aria-hidden="true"
  >
    <span class="insp-cover-mark">{{ categoryMark }}</span>
  </div>
</template>

<style scoped>
.insp-cover {
  position: relative;
}

.insp-cover-mark {
  position: absolute;
  right: 0.6rem;
  bottom: 0.35rem;
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.05em;
  opacity: 0.16;
}

/* 配色块：语义色渐变 + 大面积色域 */
.insp-cover-color {
  background: linear-gradient(
    135deg,
    var(--color-info-600) 0%,
    var(--color-success-700) 45%,
    #ea580c 100%
  );
}

/* 网格：细线网格 + 深色底 */
.insp-cover-grid {
  background-color: var(--color-surface-900);
  background-image:
    linear-gradient(rgb(148 163 184 / 0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgb(148 163 184 / 0.14) 1px, transparent 1px);
  background-size: 22px 22px;
}

.insp-cover-grid .insp-cover-mark {
  color: var(--color-surface-200);
}

/* 纸张：米白底 + 横线 */
.insp-cover-paper {
  background-color: #f8f5f0;
  background-image: linear-gradient(rgb(148 163 184 / 0.28) 1px, transparent 1px);
  background-size: 100% 26px;
  background-position: 0 8px;
}

.insp-cover-paper .insp-cover-mark {
  color: var(--color-surface-500);
}

/* 代码：深底 + 代码行 */
.insp-cover-code {
  background-color: var(--color-surface-900);
  background-image:
    repeating-linear-gradient(
      180deg,
      transparent 0,
      transparent 9px,
      rgb(52 211 153 / 0.28) 9px,
      rgb(52 211 153 / 0.28) 11px
    ),
    repeating-linear-gradient(
      90deg,
      transparent 0,
      transparent 18px,
      rgb(125 211 252 / 0.16) 18px,
      rgb(125 211 252 / 0.16) 20px
    );
}

.insp-cover-code .insp-cover-mark {
  color: #5eead4;
}

/* 极简排版：浅底 + 大号衬线标记 */
.insp-cover-minimal {
  background: linear-gradient(160deg, #eef2ff 0%, var(--color-page) 100%);
}

.insp-cover-minimal .insp-cover-mark {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--color-brand-500);
}

/* 抽象几何：径向 + 圆锥渐变 */
.insp-cover-geometry {
  background:
    radial-gradient(circle at 20% 20%, rgb(232 121 249 / 0.5) 0, transparent 34%),
    radial-gradient(circle at 85% 70%, rgb(56 189 248 / 0.45) 0, transparent 40%),
    conic-gradient(from 210deg at 70% 30%, rgb(251 191 36 / 0.5), transparent 40%),
    var(--color-page);
}

.insp-cover-geometry .insp-cover-mark {
  color: var(--color-accent-400);
}
</style>
