<script setup lang="ts">
import {
  CalendarClock,
  Ellipsis,
  ListTodo,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { PROJECT_HEALTH_META } from './health';
import type { ProjectCardMetrics } from './health';
import { PROJECT_STATUS_META } from './types';
import type { ProjectDetail } from './types';

const props = defineProps<{
  project: ProjectDetail;
  /** 列表页聚合计算的指标（避免每卡重复统计） */
  metrics: ProjectCardMetrics;
}>();

const emit = defineEmits<{
  edit: [project: ProjectDetail];
  archive: [project: ProjectDetail];
  restore: [project: ProjectDetail];
  delete: [project: ProjectDetail];
  favorite: [project: ProjectDetail];
  'quick-task': [project: ProjectDetail];
}>();

const router = useRouter();

const meta = computed(() => PROJECT_STATUS_META[props.project.status]);
const health = computed(() => PROJECT_HEALTH_META[props.metrics.health]);

/** 菜单开关（收藏 / 编辑 / 归档 / 删除等低频操作收纳于此） */
const menuOpen = ref(false);

function toggleMenu(e: MouseEvent) {
  e.stopPropagation();
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function run(fn: () => void) {
  closeMenu();
  fn();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeMenu();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

function openDetail() {
  closeMenu();
  router.push(`/projects/${props.project.id}`);
}
</script>

<template>
  <article
    class="border-surface-100 bg-surface-0 shadow-card hover:border-brand-500/40 hover:shadow-float group rounded-card relative flex cursor-pointer flex-col border p-4 transition"
    @click="openDetail"
  >
    <!-- 头部：收藏 + 名称 + 菜单 -->
    <div class="mb-2 flex items-start justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="meta.dot" />
        <h3 class="text-surface-900 min-w-0 truncate text-sm font-semibold">
          {{ project.name }}
        </h3>
      </div>
      <div class="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          class="flex size-7 items-center justify-center rounded-lg transition-colors"
          :class="
            project.favorite
              ? 'text-amber-500 hover:bg-amber-500/10'
              : 'text-surface-800/40 hover:bg-surface-100 hover:text-surface-900'
          "
          :title="project.favorite ? '取消收藏' : '收藏（置顶展示）'"
          :aria-label="project.favorite ? '取消收藏' : '收藏项目'"
          @click.stop="emit('favorite', project)"
        >
          <Star class="size-3.5" :fill="project.favorite ? 'currentColor' : 'none'" />
        </button>
        <div class="relative">
          <button
            type="button"
            class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 flex size-7 items-center justify-center rounded-lg transition-colors"
            :aria-label="`项目菜单：${project.name}`"
            :title="'更多操作'"
            @click="toggleMenu"
          >
            <Ellipsis class="size-3.5" />
          </button>
          <div
            v-if="menuOpen"
            class="border-surface-100 bg-surface-0 shadow-float absolute top-8 right-0 z-20 w-36 overflow-hidden rounded-xl border py-1"
            role="menu"
            :aria-label="`项目操作：${project.name}`"
            @click.stop
          >
            <button
              type="button"
              role="menuitem"
              class="text-surface-800/80 hover:bg-surface-50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
              @click="run(() => emit('edit', project))"
            >
              <Pencil class="size-3.5" />
              编辑
            </button>
            <button
              type="button"
              role="menuitem"
              class="text-surface-800/80 hover:bg-surface-50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
              @click="run(() => emit('quick-task', project))"
            >
              <Plus class="size-3.5" />
              快速任务
            </button>
            <button
              v-if="project.status !== 'archived'"
              type="button"
              role="menuitem"
              class="text-surface-800/80 hover:bg-surface-50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
              @click="run(() => emit('archive', project))"
            >
              <RotateCcw class="size-3.5" />
              归档
            </button>
            <button
              v-else
              type="button"
              role="menuitem"
              class="text-surface-800/80 hover:bg-surface-50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
              @click="run(() => emit('restore', project))"
            >
              <RotateCcw class="size-3.5" />
              恢复
            </button>
            <button
              type="button"
              role="menuitem"
              class="text-surface-800/80 hover:bg-surface-50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:text-red-600"
              @click="run(() => emit('delete', project))"
            >
              <Trash2 class="size-3.5" />
              删除
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 状态 + 进度 -->
    <div class="mb-3 flex items-center gap-2">
      <span
        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        :class="meta.badge"
      >
        {{ meta.label }}
      </span>
      <span class="text-surface-900 ml-auto text-sm font-semibold">{{ metrics.progress }}%</span>
    </div>
    <div class="bg-surface-100 mb-3 h-1.5 overflow-hidden rounded-full">
      <div
        class="h-full rounded-full transition-all"
        :class="metrics.progress >= 100 ? 'bg-green-500' : 'bg-brand-500'"
        :style="{ width: `${metrics.progress}%` }"
      />
    </div>

    <!-- 下一个关键日期 -->
    <div
      class="text-surface-800/60 flex items-center gap-1.5 text-xs"
      :title="
        metrics.nextDate
          ? `${metrics.nextDate.label}截止：${metrics.nextDate.date}`
          : '暂无后续关键日期'
      "
    >
      <CalendarClock class="text-surface-800/40 size-3.5 shrink-0" />
      <span v-if="metrics.nextDate" class="min-w-0 truncate">
        {{ metrics.nextDate.label }} · {{ metrics.nextDate.date }}
      </span>
      <span v-else>暂无关键日期</span>
    </div>

    <!-- 未完成任务 -->
    <div class="text-surface-800/60 mt-1.5 flex items-center gap-1.5 text-xs">
      <ListTodo class="text-surface-800/40 size-3.5 shrink-0" />
      <span>{{ metrics.unfinished }} 个未完成</span>
    </div>

    <!-- 健康状态 -->
    <div class="mt-auto pt-3">
      <span
        class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
        :class="health.badge"
        :title="metrics.health === 'ok' ? '无风险规则触发' : '存在风险规则，进入详情查看'"
      >
        <span class="size-1.5 rounded-full" :class="health.dot" />
        {{ health.label }}
      </span>
    </div>
  </article>
</template>
