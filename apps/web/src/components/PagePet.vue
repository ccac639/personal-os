<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { X } from '@lucide/vue';
import { BACKGROUND_PRESETS, FONT_PRESETS, useThemeStore } from '@/stores/theme';

const theme = useThemeStore();

/** 宠物按钮尺寸与视口边距（px） */
const PET_SIZE = 64;
const MARGIN = 8;
/** 位置持久化 key */
const POS_KEY = 'personal-os-pet-position';

const open = ref(false);
const bouncing = ref(false);
const dragging = ref(false);
const suppressClick = ref(false);

/** 宠物当前坐标（fixed 定位的 left/top） */
const pos = ref<{ x: number; y: number } | null>(loadPosition() ?? defaultPosition());

function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'x' in parsed && 'y' in parsed) {
      const { x, y } = parsed as { x: number; y: number };
      if (typeof x === 'number' && typeof y === 'number') return { x, y };
    }
  } catch {
    /* localStorage 不可用或数据损坏时忽略 */
  }
  return null;
}

function savePosition() {
  if (!pos.value) return;
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos.value));
  } catch {
    /* 忽略写入失败 */
  }
}

/** 默认位置：视口右下角 */
function defaultPosition() {
  return clampPosition(window.innerWidth - PET_SIZE - 24, window.innerHeight - PET_SIZE - 24);
}

/** 限制在视口内 */
function clampPosition(x: number, y: number) {
  return {
    x: Math.min(Math.max(x, MARGIN), window.innerWidth - PET_SIZE - MARGIN),
    y: Math.min(Math.max(y, MARGIN), window.innerHeight - PET_SIZE - MARGIN),
  };
}

const petStyle = computed(() => {
  if (!pos.value) return {};
  return { left: `${pos.value.x}px`, top: `${pos.value.y}px` };
});

/** 宠物靠近屏幕顶部时，面板改为显示在下方 */
const panelBelow = computed(() => (pos.value?.y ?? 0) < 160);

onMounted(() => {
  if (pos.value) pos.value = clampPosition(pos.value.x, pos.value.y);
  window.addEventListener('resize', handleResize);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
});

function handleResize() {
  if (pos.value) pos.value = clampPosition(pos.value.x, pos.value.y);
}

/** 拖拽起始状态 */
const dragStart = { x: 0, y: 0, px: 0, py: 0, moved: false };

function onPointerDown(event: PointerEvent) {
  if (!pos.value) return;
  dragStart.x = event.clientX;
  dragStart.y = event.clientY;
  dragStart.px = pos.value.x;
  dragStart.py = pos.value.y;
  dragStart.moved = false;
  dragging.value = true;
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value || !pos.value) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragStart.moved = true;
  pos.value = clampPosition(dragStart.px + dx, dragStart.py + dy);
}

function onPointerUp() {
  if (!dragging.value) return;
  dragging.value = false;
  savePosition();
  // 发生了拖拽则抑制随后的 click，避免误开面板
  if (dragStart.moved) {
    suppressClick.value = true;
    window.setTimeout(() => (suppressClick.value = false), 0);
  }
}

function onClick() {
  if (suppressClick.value) return;
  toggle();
}

function toggle() {
  if (open.value) {
    open.value = false;
    return;
  }
  bouncing.value = true;
  open.value = true;
  window.setTimeout(() => (bouncing.value = false), 500);
}
</script>

<template>
  <!-- 可拖拽页面宠物（位置持久化，全局换肤入口） -->
  <div class="fixed z-50 flex flex-col items-end select-none" :style="petStyle">
    <!-- 设置面板 -->
    <Transition name="pop">
      <div
        v-if="open"
        class="border-surface-100 bg-surface-0 absolute right-0 w-72 rounded-xl border p-5 shadow-xl"
        :class="panelBelow ? 'top-24' : 'bottom-20'"
      >
        <div class="mb-4 flex items-center justify-between">
          <h3 class="text-surface-900 font-semibold">✨ 页面外观</h3>
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 rounded-md p-1 transition"
            aria-label="关闭外观设置"
            @click="open = false"
          >
            <X class="size-4" />
          </button>
        </div>

        <!-- 背景色选择 -->
        <p class="text-surface-900 mb-2 text-sm font-medium">背景色</p>
        <div class="mb-5 grid grid-cols-4 gap-2">
          <button
            v-for="preset in BACKGROUND_PRESETS"
            :key="preset.id"
            type="button"
            :title="preset.label"
            class="h-9 rounded-lg border transition hover:scale-105"
            :style="{ backgroundColor: preset.value }"
            :class="
              theme.background === preset.value
                ? 'border-surface-900 ring-surface-900/20 ring-2'
                : 'border-surface-100 hover:border-surface-800/40'
            "
            @click="theme.setBackground(preset.value)"
          />
        </div>

        <!-- 字体选择 -->
        <p class="text-surface-900 mb-2 text-sm font-medium">字体</p>
        <div class="flex flex-col gap-1.5">
          <button
            v-for="preset in FONT_PRESETS"
            :key="preset.id"
            type="button"
            class="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition"
            :style="{ fontFamily: preset.value }"
            :class="
              theme.font === preset.value
                ? 'border-surface-900 bg-surface-50'
                : 'border-surface-100 hover:border-surface-800/40'
            "
            @click="theme.setFont(preset.value)"
          >
            <span>{{ preset.label }}</span>
            <span class="text-surface-800/50 text-xs">预览 123</span>
          </button>
        </div>

        <!-- 恢复默认 -->
        <button
          type="button"
          class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 mt-4 w-full rounded-lg border py-2 text-sm transition"
          @click="theme.reset()"
        >
          恢复默认
        </button>
      </div>
    </Transition>

    <!-- 宠物按钮：按住可拖拽，轻点打开面板 -->
    <button
      type="button"
      class="pet-button group relative touch-none"
      :class="{ 'pet-bounce': bouncing, 'pet-dragging': dragging }"
      :aria-label="open ? '收起外观设置' : '打开外观设置'"
      @pointerdown="onPointerDown"
      @click="onClick"
    >
      <!-- 气泡提示 -->
      <span
        v-if="!open"
        class="bg-surface-900 text-surface-0 pointer-events-none absolute top-1/2 right-full mr-3 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs whitespace-nowrap opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100"
      >
        拖动我，点我换皮肤 🎨
      </span>

      <!-- 小猫宠物 -->
      <span class="block size-16" :class="{ 'pet-float': !dragging }">
        <svg
          viewBox="0 0 120 120"
          class="size-full drop-shadow-lg transition-transform duration-200"
          :class="dragging ? 'scale-110' : 'group-hover:scale-105 group-hover:-rotate-6'"
        >
          <defs>
            <linearGradient id="petBodyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#fbbf24" />
              <stop offset="100%" stop-color="#f59e0b" />
            </linearGradient>
          </defs>

          <!-- 尾巴 -->
          <path
            d="M80 76 C 100 78, 106 62, 98 50 C 94 44, 88 48, 90 56"
            fill="none"
            stroke="#d97706"
            stroke-width="5"
            stroke-linecap="round"
          />
          <!-- 身体 -->
          <circle
            cx="60"
            cy="68"
            r="34"
            fill="url(#petBodyGrad)"
            stroke="#d97706"
            stroke-width="2"
          />
          <!-- 肚皮 -->
          <ellipse cx="60" cy="80" rx="20" ry="15" fill="#fffbeb" />
          <!-- 耳朵 -->
          <path
            d="M30 50 L22 20 L52 34 Z"
            fill="#fbbf24"
            stroke="#d97706"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <path
            d="M90 50 L98 20 L68 34 Z"
            fill="#fbbf24"
            stroke="#d97706"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <!-- 耳朵内 -->
          <path d="M31 45 L26 25 L47 35 Z" fill="#fcd34d" />
          <path d="M89 45 L94 25 L73 35 Z" fill="#fcd34d" />

          <!-- 眼睛（打开时变成开心弯月） -->
          <template v-if="open">
            <path
              d="M40 64 Q46 55 52 64"
              fill="none"
              stroke="#292524"
              stroke-width="3"
              stroke-linecap="round"
            />
            <path
              d="M68 64 Q74 55 80 64"
              fill="none"
              stroke="#292524"
              stroke-width="3"
              stroke-linecap="round"
            />
          </template>
          <template v-else>
            <g class="pet-eye">
              <circle cx="46" cy="62" r="5" fill="#292524" />
              <circle cx="48" cy="60" r="1.6" fill="#ffffff" />
            </g>
            <g class="pet-eye">
              <circle cx="74" cy="62" r="5" fill="#292524" />
              <circle cx="76" cy="60" r="1.6" fill="#ffffff" />
            </g>
          </template>

          <!-- 腮红 -->
          <ellipse cx="36" cy="72" rx="6" ry="4" fill="#fda4af" opacity="0.7" />
          <ellipse cx="84" cy="72" rx="6" ry="4" fill="#fda4af" opacity="0.7" />
          <!-- 嘴 -->
          <path
            d="M56 74 Q60 78 64 74"
            fill="none"
            stroke="#292524"
            stroke-width="2.5"
            stroke-linecap="round"
          />
          <!-- 胡须 -->
          <path d="M24 66 L12 62" stroke="#a8a29e" stroke-width="1.5" stroke-linecap="round" />
          <path d="M24 74 L12 78" stroke="#a8a29e" stroke-width="1.5" stroke-linecap="round" />
          <path d="M96 66 L108 62" stroke="#a8a29e" stroke-width="1.5" stroke-linecap="round" />
          <path d="M96 74 L108 78" stroke="#a8a29e" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </span>
    </button>
  </div>
</template>

<style scoped>
/* 面板弹出动画 */
.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

/* 宠物上下浮动（拖拽时暂停） */
.pet-float {
  animation: pet-float 5s ease-in-out infinite;
}
@keyframes pet-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

/* 点击弹跳 */
.pet-bounce {
  animation: pet-bounce 0.5s ease;
}
@keyframes pet-bounce {
  0% {
    transform: translateY(0) scale(1);
  }
  30% {
    transform: translateY(-16px) scale(1.08) rotate(-6deg);
  }
  60% {
    transform: translateY(0) scale(0.94);
  }
  100% {
    transform: translateY(0) scale(1);
  }
}

/* 拖拽状态 */
.pet-dragging {
  cursor: grabbing;
}

/* 眨眼 */
.pet-eye {
  animation: pet-blink 4.5s ease-in-out infinite;
  transform-origin: center;
}
.pet-eye:nth-child(2) {
  animation-delay: 0.05s;
}
@keyframes pet-blink {
  0%,
  90%,
  100% {
    transform: scaleY(1);
  }
  93% {
    transform: scaleY(0.1);
  }
  96% {
    transform: scaleY(1);
  }
}

/* 悬停轻微摇摆 */
.pet-button:hover .pet-float {
  animation-duration: 2.5s;
}
</style>
