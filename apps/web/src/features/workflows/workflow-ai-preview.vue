<script setup lang="ts">
/**
 * AI 生成预览层：叠加在画布之上，只渲染 preview state。
 * - 节点：新增（绿）/ 已存在修改（琥珀）虚线卡片，按画布 viewport 变换对齐
 * - 边：SVG 流光（stroke-dashoffset 动画），reduced-motion 关闭
 * - 阶段动画：分析需求 -> 扫描线 -> 节点淡入 -> 连线光流 -> 校验 -> 等待确认
 * - 不修改正式 store 数据；应用/取消都走 store 事务
 */
import { computed, ref } from 'vue';
import {
  AlertTriangle,
  Check,
  GitBranch,
  Link2,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from '@lucide/vue';
import { useWorkflowStore, type AiPhase } from './store';
import { getNodeDef } from './types';

const store = useWorkflowStore();

/** 画布 viewport（缩放/平移），由 canvas 通过 @viewport-change 传入 */
const viewport = ref({ x: 0, y: 0, zoom: 1 });

/** canvas 组件调用：同步画布视口变换 */
function syncViewport(v: { x: number; y: number; zoom: number }) {
  viewport.value = v;
}

/** 减少动态效果（用户偏好） */
const reduceMotion = ref(false);
if (typeof window !== 'undefined') {
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const preview = computed(() => store.aiPreview);
const phase = computed(() => store.aiPhase);

/** 阶段文案 */
const PHASE_TEXT: Record<AiPhase, string> = {
  idle: '',
  analyzing: '正在分析需求…',
  scanning: '扫描画布结构…',
  nodes: '生成节点…',
  edges: '自动连接端口…',
  validating: '校验草稿…',
  ready: '生成完成，请确认',
  error: '生成失败',
};

const phaseText = computed(() => PHASE_TEXT[phase.value]);

/** 预览边（自动边 + 已勾选的待确认边），用于 SVG 渲染 */
const previewEdges = computed(() => store.previewEdges());

/** 边几何（过滤无效引用） */
const edgeGeoms = computed(() =>
  previewEdges.value
    .map((e) => edgeGeom(e.source, e.target))
    .filter((g): g is NonNullable<typeof g> => g !== null),
);

/** 节点几何（w-60 = 240px；源端口在右侧，目标在左侧） */
const NODE_W = 240;
const NODE_H = 78;

function edgePath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = Math.max(40, Math.abs(tx - sx) / 2);
  return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
}

/** 预览边几何（相对画布坐标，外层已乘 viewport 变换） */
function edgeGeom(source: string, target: string) {
  const s = preview.value?.nodes.find((n) => n.stableId === source);
  const t = preview.value?.nodes.find((n) => n.stableId === target);
  if (!s || !t) return null;
  return {
    d: edgePath(
      s.position.x + NODE_W,
      s.position.y + NODE_H / 2,
      t.position.x,
      t.position.y + NODE_H / 2,
    ),
    key: `${source}->${target}`,
  };
}

/** 待确认端口勾选 */
function toggle(i: number) {
  store.togglePendingChoice(i);
}

/** 是否应用过（展示提示用） */
const applied = ref(false);

function apply(scope: 'all' | 'nodes' | 'edges') {
  if (store.applyAiDraft(scope)) applied.value = true;
}

function cancel() {
  store.clearAiPreview();
}

function regenerate() {
  if (!store.lastAiPrompt) return;
  store.generateAiWorkflow(store.lastAiPrompt, store.aiPreview?.scope ?? 'new');
}

defineExpose({ syncViewport });

/** 扫描线样式：reduced-motion 时隐藏 */
const scanCls = computed(() => (reduceMotion.value ? 'hidden' : 'ai-scanline'));
</script>

<template>
  <!-- 预览层：覆盖画布，随 viewport 变换；不拦截画布交互（节点卡片 pointer-events-none） -->
  <div
    v-if="preview && phase !== 'error'"
    class="ai-preview pointer-events-none absolute inset-0 z-10"
  >
    <!-- 视口变换容器：所有预览几何与画布坐标对齐 -->
    <div
      class="absolute top-0 left-0"
      :style="{
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        transformOrigin: '0 0',
      }"
    >
      <!-- 连线：SVG 流光 -->
      <svg class="absolute top-0 left-0 overflow-visible" width="0" height="0">
        <g v-for="g in edgeGeoms" :key="g.key">
          <path
            :d="g.d"
            class="ai-preview-edge"
            fill="none"
            stroke="var(--color-accent-500)"
            stroke-width="2.2"
            stroke-dasharray="10 6"
          />
        </g>
      </svg>

      <!-- 节点卡片（新增/修改） -->
      <div
        v-for="(n, i) in preview.nodes"
        :key="n.stableId"
        class="ai-preview-node absolute w-60 rounded-xl border bg-white/90 shadow-md backdrop-blur-sm dark:bg-slate-900/90"
        :class="[
          n.isNew ? 'border-emerald-400' : 'border-amber-400',
          phase === 'ready' && !reduceMotion ? 'ai-node-in' : '',
        ]"
        :style="{
          left: `${n.position.x}px`,
          top: `${n.position.y}px`,
          transitionDelay: reduceMotion ? '0ms' : `${Math.min(i * 90, 700)}ms`,
        }"
      >
        <header class="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
          <span
            class="flex size-7 shrink-0 items-center justify-center rounded-md"
            :class="getNodeDef(n.kind).chip"
          >
            <component :is="getNodeDef(n.kind).icon" class="size-4" />
          </span>
          <span class="text-surface-900 min-w-0 flex-1 truncate text-sm font-semibold">
            {{ n.label }}
          </span>
          <span
            class="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
            :class="
              n.isNew ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
            "
          >
            {{ n.isNew ? '新增' : '修改' }}
          </span>
        </header>
        <p class="text-surface-800/60 truncate px-3 pb-2.5 text-xs">
          {{ getNodeDef(n.kind).description }}
        </p>
      </div>
    </div>

    <!-- 顶部状态条（阶段动画 + 扫描线） -->
    <div
      class="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-violet-500/30 bg-white/90 px-3 py-1.5 text-xs shadow-md backdrop-blur dark:bg-slate-900/90"
    >
      <Loader2 v-if="store.aiBusy" class="size-3.5 animate-spin text-violet-500" />
      <Sparkles v-else class="size-3.5 text-violet-500" />
      <span class="text-surface-900 font-medium">{{ phaseText }}</span>
      <span v-if="preview" class="text-surface-800/50">
        · {{ preview.nodes.length }} 节点 / {{ previewEdges.length }} 连线
      </span>
    </div>
    <div
      v-if="store.aiBusy"
      class="absolute top-12 left-1/2 z-20 h-0.5 w-48 -translate-x-1/2 overflow-hidden rounded-full bg-violet-500/10"
    >
      <div :class="scanCls" class="h-full w-1/3 bg-violet-500" />
    </div>

    <!-- 警告 / 待确认端口（右侧浮层） -->
    <div
      class="border-surface-100 pointer-events-auto absolute top-3 right-3 z-20 flex max-h-[60%] w-64 flex-col gap-2 overflow-y-auto rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur dark:bg-slate-900/95"
    >
      <h3 class="text-surface-900 flex items-center gap-1.5 text-xs font-semibold">
        <AlertTriangle class="size-3.5 text-amber-500" />
        校验提示
        <span class="text-surface-800/40 font-normal">{{ preview.warnings.length }}</span>
      </h3>
      <ul class="space-y-1">
        <li
          v-for="(w, i) in preview.warnings.slice(0, 5)"
          :key="i"
          class="text-surface-800/70 text-[11px] leading-snug"
        >
          · {{ w }}
        </li>
      </ul>

      <template v-if="preview.auto.pending.length > 0">
        <h3 class="text-surface-900 mt-1 flex items-center gap-1.5 text-xs font-semibold">
          <GitBranch class="size-3.5 text-violet-500" />
          待确认端口
        </h3>
        <label
          v-for="(p, i) in preview.auto.pending"
          :key="i"
          class="border-surface-100 flex items-start gap-2 rounded-lg border px-2 py-1.5 text-[11px]"
        >
          <input
            type="checkbox"
            :checked="preview.pendingChoices[i] === true"
            class="mt-0.5 size-3 accent-violet-500"
            @change="toggle(i)"
          />
          <span class="min-w-0">
            <span class="text-surface-900 block font-medium">{{ p.sourceLabel }}</span>
            <span class="text-surface-800/50 block truncate">
              → {{ p.targets.map((t) => t.label).join(' / ') }}
            </span>
          </span>
        </label>
      </template>

      <template v-if="preview.auto.explanations.length > 0">
        <h3 class="text-surface-900 mt-1 flex items-center gap-1.5 text-xs font-semibold">
          <Link2 class="size-3.5 text-emerald-500" />
          自动连线
        </h3>
        <ul class="space-y-0.5">
          <li
            v-for="(ex, i) in preview.auto.explanations"
            :key="i"
            class="text-surface-800/70 font-mono text-[10px]"
          >
            {{ ex }}
          </li>
        </ul>
      </template>
    </div>

    <!-- 底部操作栏 -->
    <div
      class="border-surface-100 pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-white/95 px-3 py-2 shadow-lg backdrop-blur dark:bg-slate-900/95"
    >
      <button
        type="button"
        class="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
        :disabled="store.running || store.aiBusy"
        @click="apply('all')"
      >
        <Check class="size-3.5" />
        应用全部
      </button>
      <button
        type="button"
        class="hover:bg-surface-100 text-surface-900 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition disabled:opacity-50"
        :disabled="store.running || store.aiBusy"
        @click="apply('nodes')"
      >
        仅节点
      </button>
      <button
        type="button"
        class="hover:bg-surface-100 text-surface-900 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition disabled:opacity-50"
        :disabled="store.running || store.aiBusy"
        @click="apply('edges')"
      >
        仅连接
      </button>
      <button
        type="button"
        class="hover:bg-surface-100 text-surface-900 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition disabled:opacity-50"
        :disabled="store.running || store.aiBusy || !store.lastAiPrompt"
        @click="regenerate"
      >
        <RefreshCw class="size-3.5" />
        重新生成
      </button>
      <button
        type="button"
        class="hover:bg-surface-100 text-surface-900 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition"
        @click="cancel"
      >
        <X class="size-3.5" />
        取消
      </button>
    </div>
  </div>

  <!-- 生成失败提示（独立小浮层） -->
  <div
    v-else-if="phase === 'error' && store.aiError"
    class="pointer-events-auto absolute right-3 bottom-3 z-20 flex max-w-xs items-start gap-2 rounded-xl border border-red-300 bg-red-50/95 px-3 py-2.5 text-xs shadow-lg backdrop-blur dark:border-red-500/40 dark:bg-red-950/90"
  >
    <AlertTriangle class="mt-0.5 size-4 shrink-0 text-red-500" />
    <div class="min-w-0">
      <p class="font-medium text-red-700 dark:text-red-300">{{ store.aiError }}</p>
      <button
        type="button"
        class="mt-1 text-red-600 underline-offset-2 hover:underline dark:text-red-400"
        @click="cancel"
      >
        关闭
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 节点淡入：轻微缩放 + 上移（只作用于 preview 节点） */
.ai-node-in {
  animation: ai-node-fade 0.35s ease-out both;
}
@keyframes ai-node-fade {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 连线流光：有限 stroke-dashoffset 动画 */
.ai-preview-edge {
  animation: ai-edge-flow 0.9s linear infinite;
}
@keyframes ai-edge-flow {
  to {
    stroke-dashoffset: -32;
  }
}

/* 扫描线 */
.ai-scanline {
  animation: ai-scan 1.1s ease-in-out infinite;
}
@keyframes ai-scan {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(320%);
  }
}

/* 用户偏好减少动效：关闭全部复杂动画 */
@media (prefers-reduced-motion: reduce) {
  .ai-node-in,
  .ai-preview-edge,
  .ai-scanline {
    animation: none !important;
  }
}
</style>
