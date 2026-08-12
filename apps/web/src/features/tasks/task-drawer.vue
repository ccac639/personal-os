<script setup lang="ts">
import { CalendarClock, Check, Circle, ListTodo, Pencil, Plus, Tag, Trash2, X } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { formatDateTime, relativeTime } from '@/features/projects/utils';
import { subtaskStats } from './subtasks';
import { useTaskStore } from './store';
import { TASK_PRIORITY_META, TASK_STATUS_META } from './types';
import type { TaskEvent } from './types';

const props = defineProps<{
  /** 打开时传入任务 id；null 且 open 时显示空态 */
  taskId: string | null;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  edit: [taskId: string];
  delete: [taskId: string];
}>();

const store = useTaskStore();
const newSubtask = ref('');

const task = computed(() => (props.taskId ? store.taskById(props.taskId) : null));
const stats = computed(() => subtaskStats(task.value ?? { subtasks: [] }));
const events = computed<TaskEvent[]>(() => (props.taskId ? store.taskEvents(props.taskId) : []));

watch(
  () => props.open,
  (open) => {
    if (!open) newSubtask.value = '';
  },
);

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

function addSubtask() {
  if (props.taskId && newSubtask.value.trim()) {
    store.addSubtask(props.taskId, newSubtask.value);
    newSubtask.value = '';
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-x-full opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-x-full opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-40"
      role="dialog"
      aria-modal="true"
      aria-label="任务详情"
    >
      <div class="bg-surface-900/30 absolute inset-0 backdrop-blur-[1px]" @click="emit('close')" />
      <aside
        class="border-surface-100 bg-surface-0 shadow-float absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-l"
      >
        <!-- 空态：任务不存在 -->
        <div v-if="!task" class="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <ListTodo class="text-surface-800/30 size-10" />
          <p class="text-surface-800/60 mt-3 text-sm">任务不存在或已被删除</p>
          <button
            type="button"
            class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 mt-4 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
            @click="emit('close')"
          >
            关闭
          </button>
        </div>

        <template v-else>
          <!-- 头部 -->
          <header
            class="border-surface-100 flex items-start justify-between gap-3 border-b px-5 py-4"
          >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-surface-900 min-w-0 text-base font-semibold break-words">
                  {{ task.title }}
                </h2>
                <span
                  class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="TASK_STATUS_META[task.status].badge"
                >
                  {{ TASK_STATUS_META[task.status].label }}
                </span>
              </div>
              <p class="text-surface-800/40 mt-1 text-xs">
                创建于 {{ formatDateTime(task.createdAt) }} · 更新于
                {{ relativeTime(task.updatedAt) }}
              </p>
            </div>
            <button
              type="button"
              class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
              aria-label="关闭详情"
              title="关闭（Esc）"
              @click="emit('close')"
            >
              <X class="size-4" />
            </button>
          </header>

          <!-- 主体 -->
          <div class="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <!-- 描述 -->
            <section>
              <h3 class="text-surface-800/50 mb-1.5 text-xs font-medium">描述</h3>
              <p
                v-if="task.description"
                class="text-surface-800/80 text-sm leading-6 whitespace-pre-wrap"
              >
                {{ task.description }}
              </p>
              <p v-else class="text-surface-800/40 text-sm">暂无描述</p>
            </section>

            <!-- 元信息 -->
            <section>
              <h3 class="text-surface-800/50 mb-1.5 text-xs font-medium">属性</h3>
              <div class="flex flex-wrap items-center gap-1.5">
                <span
                  class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
                  :class="TASK_PRIORITY_META[task.priority].badge"
                >
                  {{ TASK_PRIORITY_META[task.priority].label }}优先级
                </span>
                <span
                  v-for="tag in task.tags"
                  :key="tag"
                  class="border-surface-100 bg-surface-50 text-surface-800/60 flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs"
                >
                  <Tag class="size-3" />
                  {{ tag }}
                </span>
                <span
                  v-if="task.dueDate"
                  class="text-surface-800/60 flex items-center gap-1 rounded border border-red-100 bg-red-500/5 px-1.5 py-0.5 text-xs"
                >
                  <CalendarClock class="size-3" />
                  {{ task.dueDate }}
                </span>
                <span v-if="!task.dueDate" class="text-surface-800/40 text-xs">无截止日期</span>
              </div>
            </section>

            <!-- 子任务 checklist -->
            <section>
              <div class="mb-1.5 flex items-center justify-between">
                <h3 class="text-surface-800/50 text-xs font-medium">子任务</h3>
                <span v-if="stats.total > 0" class="text-surface-800/50 text-xs">
                  {{ stats.done }}/{{ stats.total }}
                </span>
              </div>
              <ul v-if="task.subtasks.length" class="space-y-1.5">
                <li
                  v-for="sub in task.subtasks"
                  :key="sub.id"
                  class="group flex items-center gap-2 rounded-lg px-1 py-0.5"
                >
                  <button
                    type="button"
                    class="text-surface-800/40 hover:text-brand-600 shrink-0 transition-colors"
                    :aria-label="sub.done ? `标记未完成：${sub.title}` : `标记完成：${sub.title}`"
                    :title="sub.done ? '标记未完成' : '标记完成'"
                    @click="store.toggleSubtask(task.id, sub.id)"
                  >
                    <Check v-if="sub.done" class="size-4 text-green-600" />
                    <Circle v-else class="size-4" />
                  </button>
                  <span
                    class="min-w-0 flex-1 text-sm break-words"
                    :class="sub.done ? 'text-surface-800/40 line-through' : 'text-surface-800/80'"
                  >
                    {{ sub.title }}
                  </span>
                  <button
                    type="button"
                    class="text-surface-800/30 shrink-0 rounded p-0.5 transition-colors hover:text-red-600"
                    :aria-label="`删除子任务：${sub.title}`"
                    title="删除子任务"
                    @click="store.removeSubtask(task.id, sub.id)"
                  >
                    <X class="size-3.5" />
                  </button>
                </li>
              </ul>
              <p v-else class="text-surface-800/40 text-xs">暂无子任务</p>
              <div class="mt-2 flex items-center gap-2">
                <input
                  v-model="newSubtask"
                  type="text"
                  class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-xs transition outline-none focus:ring-4"
                  placeholder="添加子任务，回车确认"
                  autocomplete="off"
                  @keydown.enter.prevent="addSubtask"
                />
                <button
                  type="button"
                  class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors"
                  aria-label="添加子任务"
                  title="添加子任务"
                  @click="addSubtask"
                >
                  <Plus class="size-3.5" />
                  添加
                </button>
              </div>
            </section>

            <!-- 活动历史 -->
            <section>
              <h3 class="text-surface-800/50 mb-2 text-xs font-medium">活动历史</h3>
              <div v-if="events.length" class="space-y-3">
                <div v-for="e in events" :key="e.id" class="flex gap-2.5">
                  <span class="bg-surface-100 mt-1 size-1.5 shrink-0 rounded-full" />
                  <div class="min-w-0">
                    <p class="text-surface-800/80 text-xs font-medium">{{ e.title }}</p>
                    <p class="text-surface-800/40 mt-0.5 text-xs">
                      {{ formatDateTime(e.createdAt) }}
                    </p>
                  </div>
                </div>
              </div>
              <p v-else class="text-surface-800/40 text-xs">暂无活动记录</p>
            </section>
          </div>

          <!-- 底部操作 -->
          <footer class="border-surface-100 flex items-center gap-2 border-t px-5 py-3">
            <button
              type="button"
              class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              @click="emit('edit', task.id)"
            >
              <Pencil class="size-3.5" />
              编辑
            </button>
            <button
              type="button"
              class="bg-surface-0 flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              @click="emit('delete', task.id)"
            >
              <Trash2 class="size-3.5" />
              删除
            </button>
            <span class="text-surface-800/40 ml-auto text-xs">Esc 关闭</span>
          </footer>
        </template>
      </aside>
    </div>
  </Transition>
</template>
