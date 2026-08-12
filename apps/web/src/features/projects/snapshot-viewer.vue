<script setup lang="ts">
import { CalendarClock, Flag, FolderOpen, ListTodo, X } from '@lucide/vue';
import { computed } from 'vue';

import { useProjectStore } from './store';
import { formatDateTime } from './utils';
import type { ProjectSnapshot } from './types';

const props = defineProps<{ snapshotId: string | null }>();

const emit = defineEmits<{ close: [] }>();

const store = useProjectStore();

const snapshot = computed<ProjectSnapshot | null>(() =>
  props.snapshotId ? store.snapshotById(props.snapshotId) : null,
);
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="opacity-0"
  >
    <div
      v-if="snapshot"
      class="fixed inset-0 z-40 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="归档快照详情"
    >
      <div class="bg-surface-900/40 absolute inset-0 backdrop-blur-[2px]" @click="emit('close')" />
      <div
        class="border-surface-100 bg-surface-0 shadow-float relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-t-2xl border sm:rounded-2xl"
      >
        <header class="border-surface-100 flex items-center justify-between border-b px-5 py-3.5">
          <div class="min-w-0">
            <h2 class="text-surface-900 truncate text-sm font-semibold">
              快照：{{ snapshot.data.project.name }}
            </h2>
            <p class="text-surface-800/50 mt-0.5 text-xs">
              生成于 {{ formatDateTime(snapshot.createdAt) }}
            </p>
          </div>
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-7 items-center justify-center rounded-lg transition-colors"
            aria-label="关闭快照"
            title="关闭"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </header>

        <div class="flex-1 space-y-5 overflow-y-auto p-5">
          <!-- 项目 -->
          <section>
            <h3 class="text-surface-800/50 mb-2 flex items-center gap-1.5 text-xs font-medium">
              <FolderOpen class="size-3.5" /> 项目
            </h3>
            <p class="text-surface-900 text-sm font-medium">{{ snapshot.data.project.name }}</p>
            <p
              v-if="snapshot.data.project.description"
              class="text-surface-800/60 mt-1 text-sm leading-6"
            >
              {{ snapshot.data.project.description }}
            </p>
            <p class="text-surface-800/40 mt-1.5 text-xs">
              状态：{{ snapshot.data.project.status }} · 技术栈：{{
                snapshot.data.project.techStack.join('、') || '—'
              }}
            </p>
          </section>

          <!-- 任务 -->
          <section>
            <h3 class="text-surface-800/50 mb-2 flex items-center gap-1.5 text-xs font-medium">
              <ListTodo class="size-3.5" /> 任务（{{ snapshot.data.tasks.length }}）
            </h3>
            <div v-if="snapshot.data.tasks.length" class="space-y-1.5">
              <div
                v-for="t in snapshot.data.tasks"
                :key="t.id"
                class="border-surface-100 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span
                  class="min-w-0 flex-1 truncate"
                  :class="
                    t.status === 'done' ? 'text-surface-800/40 line-through' : 'text-surface-800/80'
                  "
                >
                  {{ t.title }}
                </span>
                <span class="text-surface-800/40 shrink-0 text-xs">{{ t.status }}</span>
                <span v-if="t.dueDate" class="text-surface-800/40 shrink-0 text-xs">{{
                  t.dueDate
                }}</span>
              </div>
            </div>
            <p v-else class="text-surface-800/40 text-xs">无任务</p>
          </section>

          <!-- 里程碑 -->
          <section>
            <h3 class="text-surface-800/50 mb-2 flex items-center gap-1.5 text-xs font-medium">
              <Flag class="size-3.5" /> 里程碑（{{ snapshot.data.milestones.length }}）
            </h3>
            <div v-if="snapshot.data.milestones.length" class="space-y-1.5">
              <div
                v-for="m in snapshot.data.milestones"
                :key="m.id"
                class="border-surface-100 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span class="min-w-0 flex-1 truncate">{{ m.title }}</span>
                <span class="text-surface-800/40 shrink-0 text-xs">
                  {{ m.startDate ?? '?' }} → {{ m.dueDate ?? '?' }}
                </span>
                <span class="text-surface-800/40 shrink-0 text-xs">{{ m.status }}</span>
              </div>
            </div>
            <p v-else class="text-surface-800/40 text-xs">无里程碑</p>
          </section>

          <!-- 活动 -->
          <section>
            <h3 class="text-surface-800/50 mb-2 flex items-center gap-1.5 text-xs font-medium">
              <CalendarClock class="size-3.5" /> 活动记录（{{ snapshot.data.activities.length }}）
            </h3>
            <div v-if="snapshot.data.activities.length" class="space-y-1.5">
              <div
                v-for="a in snapshot.data.activities.slice(0, 20)"
                :key="a.id"
                class="flex items-start gap-2 text-sm"
              >
                <span class="text-surface-800/40 mt-0.5 shrink-0 text-xs">{{
                  formatDateTime(a.createdAt)
                }}</span>
                <span class="text-surface-800/80 min-w-0 flex-1 truncate">{{ a.title }}</span>
              </div>
              <p v-if="snapshot.data.activities.length > 20" class="text-surface-800/40 text-xs">
                仅展示最近 20 条，共 {{ snapshot.data.activities.length }} 条
              </p>
            </div>
            <p v-else class="text-surface-800/40 text-xs">无活动记录</p>
          </section>

          <!-- 复盘 -->
          <section v-if="snapshot.data.retrospective">
            <h3 class="text-surface-800/50 mb-2 text-xs font-medium">复盘笔记</h3>
            <div class="text-surface-800/70 space-y-2 text-sm">
              <p v-if="snapshot.data.retrospective.done" class="leading-6 whitespace-pre-wrap">
                <span class="text-surface-800/50">本期完成：</span
                >{{ snapshot.data.retrospective.done }}
              </p>
              <p v-if="snapshot.data.retrospective.blockers" class="leading-6 whitespace-pre-wrap">
                <span class="text-surface-800/50">阻塞问题：</span
                >{{ snapshot.data.retrospective.blockers }}
              </p>
              <p v-if="snapshot.data.retrospective.next" class="leading-6 whitespace-pre-wrap">
                <span class="text-surface-800/50">下期计划：</span
                >{{ snapshot.data.retrospective.next }}
              </p>
              <p v-if="snapshot.data.retrospective.lessons" class="leading-6 whitespace-pre-wrap">
                <span class="text-surface-800/50">经验记录：</span
                >{{ snapshot.data.retrospective.lessons }}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>
