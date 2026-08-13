<script setup lang="ts">
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  Circle,
  Link2,
  Link2Off,
  ListTodo,
  Pencil,
  Plus,
  Tag,
  Timer,
  Trash2,
  X,
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { formatDateTime, relativeTime } from '@/features/projects/utils';
import { useKnowledgeStore } from '@/features/projects/knowledge-store';
import { blockingDependencies, canAddDependency } from './dependencies';
import { subtaskStats } from './subtasks';
import { taskEstimate, formatHoursShort } from './estimates';
import { useTaskStore } from './store';
import { TASK_PRIORITY_META, TASK_STATUS_META } from './types';
import type { TaskEvent, TaskItem } from './types';

const props = defineProps<{
  /** 打开时传入任务 id；null 且 open 时显示空态 */
  taskId: string | null;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  edit: [taskId: string];
  delete: [taskId: string];
  /** 跳转到依赖任务（抽屉内切换） */
  jump: [taskId: string];
}>();

const store = useTaskStore();
const knowledgeStore = useKnowledgeStore();
/** 记入知识反馈 */
const knowledgeNote = ref('');

function createKnowledgeFromTask() {
  const t = task.value;
  if (!t) return;
  if (!t.projectId) {
    knowledgeNote.value = '收件箱任务请先分配到项目后再记录知识';
    return;
  }
  knowledgeStore.createEntry({
    projectId: t.projectId,
    type: 'issue',
    title: `关于「${t.title}」`,
    body: '',
    tags: [],
    taskIds: [t.id],
  });
  knowledgeNote.value = '已记入项目知识（问题）并自动关联本任务';
  setTimeout(() => (knowledgeNote.value = ''), 2500);
}
const newSubtask = ref('');
const depError = ref('');
const selectedDepId = ref('');

const task = computed(() => (props.taskId ? store.taskById(props.taskId) : null));
const stats = computed(() => subtaskStats(task.value ?? { subtasks: [] }));
const events = computed<TaskEvent[]>(() => (props.taskId ? store.taskEvents(props.taskId) : []));

const blocking = computed<TaskItem[]>(() =>
  task.value ? blockingDependencies(task.value, new Map(store.tasks.map((t) => [t.id, t]))) : [],
);
/** 依赖本任务的任务（反向） */
const dependents = computed<TaskItem[]>(() => {
  const t = task.value;
  if (!t) return [];
  return store.tasks.filter((x) => x.dependsOn.includes(t.id));
});
/** 可选前置：同项目其他任务，且不违反依赖规则 */
const depCandidates = computed<TaskItem[]>(() => {
  const t = task.value;
  if (!t) return [];
  const byId = new Map(store.tasks.map((x) => [x.id, x]));
  return store.tasks.filter(
    (x) => x.projectId === t.projectId && canAddDependency(t, x.id, byId).ok,
  );
});

const isFocus = computed(() =>
  props.taskId ? store.focus.some((f) => f.taskId === props.taskId) : false,
);
const focusMinutes = computed(() => (props.taskId ? store.taskFocusMinutes(props.taskId) : 0));
const lastFocus = computed(() => (props.taskId ? store.lastFocusAt(props.taskId) : null));
/** 估时 / 实际投入 / 偏差（估时 = 表单填写；实际 = 手动 + 专注） */
const estimate = computed(() =>
  task.value ? taskEstimate(task.value, store.focusSessions) : null,
);
/** 内联编辑实际投入 */
const editingActual = ref(false);
const actualDraft = ref<number | null>(null);

function startEditActual() {
  if (!task.value) return;
  actualDraft.value = task.value.actualMinutes ?? 0;
  editingActual.value = true;
}

function saveActual() {
  if (props.taskId && actualDraft.value !== null) {
    store.setActualMinutes(props.taskId, actualDraft.value);
  }
  editingActual.value = false;
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    newSubtask.value = '';
    depError.value = '';
    selectedDepId.value = '';
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

function addDependency() {
  if (!props.taskId || !selectedDepId.value) return;
  const r = store.addDependency(props.taskId, selectedDepId.value);
  depError.value = r.ok ? '' : (r.reason ?? '');
  if (r.ok) selectedDepId.value = '';
}

function addToFocus() {
  if (props.taskId) {
    const ok = store.addToFocus(props.taskId, 25);
    depError.value = ok ? '' : '今日聚焦已满（上限 5 个）';
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
              <div v-if="knowledgeNote" class="mt-1 text-xs text-green-600">
                {{ knowledgeNote }}
              </div>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1">
              <button
                type="button"
                class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
                aria-label="关闭详情"
                title="关闭（Esc）"
                @click="emit('close')"
              >
                <X class="size-4" />
              </button>
              <button
                type="button"
                class="border-surface-100 bg-surface-0 text-surface-800/60 hover:border-brand-500/40 hover:text-brand-600 rounded-lg border px-2 py-1 text-xs font-medium transition-colors"
                title="把本任务记入项目知识并自动关联"
                @click="createKnowledgeFromTask"
              >
                <BookOpen class="mr-1 inline size-3" />
                记入知识
              </button>
            </div>
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

            <!-- 完成定义（DoD） -->
            <section v-if="task.dod">
              <h3 class="text-surface-800/50 mb-1.5 text-xs font-medium">完成定义（DoD）</h3>
              <p
                class="border-brand-500/30 bg-brand-500/5 text-surface-800/80 rounded-lg border px-3 py-2 text-sm leading-6"
              >
                {{ task.dod }}
              </p>
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
                <span
                  v-if="isFocus"
                  class="text-brand-600 bg-brand-500/10 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                >
                  <Timer class="size-3" />
                  今日聚焦
                </span>
                <span
                  v-if="focusMinutes > 0"
                  class="text-surface-800/50 flex items-center gap-1 text-xs"
                >
                  <Timer class="size-3" />
                  累计专注 {{ focusMinutes }} 分钟
                </span>
                <span
                  v-if="estimate?.estimatedMinutes != null"
                  class="flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-xs text-sky-600"
                >
                  估时 {{ formatHoursShort(estimate.estimatedMinutes) }}
                </span>
                <span v-if="estimate" class="text-surface-800/50 flex items-center gap-1 text-xs">
                  已投入 {{ formatHoursShort(estimate.actualMinutes) }}
                  <span v-if="estimate.varianceMinutes !== null && !editingActual">
                    <span
                      :class="estimate.varianceMinutes >= 0 ? 'text-green-600' : 'text-amber-600'"
                    >
                      （{{ estimate.varianceMinutes >= 0 ? '余' : '超' }}
                      {{ formatHoursShort(Math.abs(estimate.varianceMinutes)) }}）
                    </span>
                    <button
                      type="button"
                      class="text-surface-800/40 hover:text-brand-600 ml-0.5 rounded p-0.5 transition-colors"
                      :title="'手动修正实际投入（覆盖自动累计）'"
                      aria-label="修正实际投入"
                      @click="startEditActual"
                    >
                      <Pencil class="size-3" />
                    </button>
                  </span>
                  <span v-else-if="editingActual" class="ml-1 flex items-center gap-1">
                    <input
                      v-model.number="actualDraft"
                      type="number"
                      min="0"
                      step="5"
                      class="border-surface-100 focus:border-brand-500 w-20 rounded-lg border px-1.5 py-0.5 text-xs transition outline-none"
                      aria-label="实际投入分钟"
                    />
                    <button
                      type="button"
                      class="text-brand-600 rounded px-1 text-xs font-medium hover:underline"
                      @click="saveActual"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      class="text-surface-800/40 hover:text-surface-900 rounded px-1 text-xs"
                      @click="editingActual = false"
                    >
                      取消
                    </button>
                  </span>
                </span>
              </div>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <button
                  v-if="!isFocus"
                  type="button"
                  class="border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors"
                  @click="addToFocus"
                >
                  <Plus class="size-3" />
                  加入今日聚焦
                </button>
                <span v-if="lastFocus" class="text-surface-800/40 text-xs">
                  最近专注：{{ relativeTime(lastFocus) }}
                </span>
              </div>
            </section>

            <!-- 前置依赖 -->
            <section>
              <div class="mb-1.5 flex items-center justify-between">
                <h3 class="text-surface-800/50 flex items-center gap-1 text-xs font-medium">
                  <Link2 class="size-3.5" />
                  前置依赖
                </h3>
                <span
                  v-if="blocking.length"
                  class="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-600"
                >
                  <Link2Off class="size-3" />
                  受阻（{{ blocking.length }}）
                </span>
              </div>

              <!-- 阻塞原因 -->
              <div v-if="blocking.length" class="mb-2 space-y-1">
                <p class="text-xs text-amber-700">以下前置任务未完成，但你仍可继续执行本任务：</p>
                <div
                  v-for="b in blocking"
                  :key="b.id"
                  class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5"
                >
                  <span class="min-w-0 flex-1 truncate text-xs text-amber-700">{{ b.title }}</span>
                  <button
                    type="button"
                    class="flex items-center gap-0.5 rounded p-0.5 text-xs text-amber-700/70 transition-colors hover:text-amber-900"
                    :aria-label="`跳转到任务：${b.title}`"
                    title="跳转"
                    @click="emit('jump', b.id)"
                  >
                    查看
                    <ArrowRight class="size-3" />
                  </button>
                </div>
              </div>

              <!-- 依赖列表 -->
              <div v-if="task.dependsOn.length" class="space-y-1">
                <div
                  v-for="depId in task.dependsOn"
                  :key="depId"
                  class="border-surface-100 hover:border-brand-500/40 flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
                >
                  <Check
                    v-if="store.taskById(depId)?.status === 'done'"
                    class="size-3.5 text-green-600"
                  />
                  <Circle v-else class="text-surface-800/30 size-3.5" />
                  <span
                    class="min-w-0 flex-1 truncate text-xs"
                    :class="
                      store.taskById(depId)?.status === 'done'
                        ? 'text-surface-800/40 line-through'
                        : 'text-surface-800/80'
                    "
                  >
                    {{ store.taskById(depId)?.title ?? '任务不存在' }}
                  </span>
                  <button
                    type="button"
                    class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-6 items-center justify-center rounded-md transition-colors"
                    :aria-label="`跳转到任务：${store.taskById(depId)?.title ?? ''}`"
                    title="跳转"
                    @click="emit('jump', depId)"
                  >
                    <ArrowRight class="size-3" />
                  </button>
                  <button
                    type="button"
                    class="text-surface-800/40 rounded p-0.5 transition-colors hover:text-red-600"
                    :aria-label="`移除依赖：${store.taskById(depId)?.title ?? ''}`"
                    title="移除依赖"
                    @click="store.removeDependency(task.id, depId)"
                  >
                    <X class="size-3" />
                  </button>
                </div>
              </div>
              <p v-else-if="!blocking.length" class="text-surface-800/40 text-xs">暂无前置依赖</p>

              <!-- 反向依赖 -->
              <div v-if="dependents.length" class="mt-2">
                <p class="text-surface-800/40 mb-1 text-xs">
                  被 {{ dependents.length }} 个任务依赖
                </p>
                <div
                  v-for="d in dependents.slice(0, 5)"
                  :key="d.id"
                  class="flex items-center gap-2 rounded px-1 py-0.5 text-xs"
                >
                  <Link2 class="text-surface-800/30 size-3" />
                  <span class="text-surface-800/70 min-w-0 flex-1 truncate">{{ d.title }}</span>
                  <button
                    type="button"
                    class="text-surface-800/50 hover:text-brand-600 rounded p-0.5 transition-colors"
                    aria-label="跳转到依赖此任务的任务"
                    title="跳转"
                    @click="emit('jump', d.id)"
                  >
                    <ArrowRight class="size-3" />
                  </button>
                </div>
              </div>

              <!-- 添加依赖 -->
              <div v-if="depCandidates.length" class="mt-2 flex items-center gap-2">
                <select
                  v-model="selectedDepId"
                  class="border-surface-100 bg-surface-0 focus:border-brand-500 min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
                  aria-label="选择前置任务"
                >
                  <option value="" disabled>选择前置任务…</option>
                  <option v-for="c in depCandidates" :key="c.id" :value="c.id">
                    {{ c.title }}
                  </option>
                </select>
                <button
                  type="button"
                  class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors"
                  aria-label="添加前置依赖"
                  title="添加依赖"
                  @click="addDependency"
                >
                  <Plus class="size-3" />
                  添加
                </button>
              </div>
              <p v-if="depError" class="mt-1 text-xs text-red-600">{{ depError }}</p>

              <!-- 阻塞原因（受阻时填写，编辑走「编辑」按钮） -->
              <div
                v-if="task.blockedReason"
                class="mt-2 rounded-lg border border-amber-200 bg-amber-500/5 px-2.5 py-2"
              >
                <p class="text-xs font-medium text-amber-700">阻塞原因</p>
                <p class="mt-0.5 text-xs leading-5 whitespace-pre-wrap text-amber-800/80">
                  {{ task.blockedReason }}
                </p>
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
