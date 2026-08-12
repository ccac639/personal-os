<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, Plus, X } from '@lucide/vue';

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

const STORAGE_KEY = 'personal-os-dashboard-todos';

const DEFAULT_TODOS: Todo[] = [
  { id: '1', text: '接入真实 Dashboard API 数据', done: false },
  { id: '2', text: '完成工作流画布节点编排', done: false },
  { id: '3', text: '补充组件单元测试', done: true },
  { id: '4', text: '迁移到 pnpm workspace 新包', done: true },
];

function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TODOS;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Todo[];
  } catch {
    /* 数据损坏时回退默认 */
  }
  return DEFAULT_TODOS;
}

const todos = ref<Todo[]>(loadTodos());
const newText = ref('');

watch(
  todos,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* 忽略写入失败 */
    }
  },
  { deep: true },
);

const doneCount = computed(() => todos.value.filter((t) => t.done).length);
const progress = computed(() =>
  todos.value.length === 0 ? 0 : Math.round((doneCount.value / todos.value.length) * 100),
);

function toggle(id: string) {
  const todo = todos.value.find((t) => t.id === id);
  if (todo) todo.done = !todo.done;
}

function remove(id: string) {
  todos.value = todos.value.filter((t) => t.id !== id);
}

function addTodo() {
  const text = newText.value.trim();
  if (!text) return;
  todos.value = [{ id: `${Date.now()}`, text, done: false }, ...todos.value];
  newText.value = '';
}
</script>

<template>
  <section class="border-surface-100 bg-surface-0 flex flex-col rounded-lg border p-5">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 text-base font-semibold">待办事项</h2>
      <span class="text-surface-800/50 text-xs tabular-nums"
        >{{ doneCount }}/{{ todos.length }}</span
      >
    </div>

    <!-- 完成进度条 -->
    <div class="bg-surface-100 mb-3 h-1.5 overflow-hidden rounded-full">
      <div
        class="bg-brand-600 h-full rounded-full transition-all duration-500"
        :style="{ width: `${progress}%` }"
      />
    </div>

    <!-- 待办列表（滚动） -->
    <ul class="flex-1 space-y-1.5 overflow-y-auto">
      <li
        v-for="todo in todos"
        :key="todo.id"
        class="group hover:bg-surface-50 flex items-center gap-2 rounded-md px-1.5 py-1 transition"
      >
        <button
          type="button"
          class="border-surface-800/30 flex size-4 shrink-0 items-center justify-center rounded border transition"
          :class="todo.done ? 'bg-brand-600 border-brand-600 text-white' : 'hover:border-brand-600'"
          :aria-label="todo.done ? '标记为未完成' : '标记为完成'"
          @click="toggle(todo.id)"
        >
          <Check v-if="todo.done" class="size-3" />
        </button>
        <span
          class="text-surface-800/80 min-w-0 flex-1 truncate text-sm transition"
          :class="todo.done ? 'text-surface-800/40 line-through' : ''"
        >
          {{ todo.text }}
        </span>
        <button
          type="button"
          class="text-surface-800/30 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
          aria-label="删除待办"
          @click="remove(todo.id)"
        >
          <X class="size-3.5" />
        </button>
      </li>
      <li v-if="todos.length === 0" class="text-surface-800/40 py-6 text-center text-sm">
        全部完成 🎉
      </li>
    </ul>

    <!-- 添加待办 -->
    <form
      class="border-surface-100 mt-3 flex items-center gap-1.5 border-t pt-3"
      @submit.prevent="addTodo"
    >
      <input
        v-model="newText"
        type="text"
        placeholder="添加待办…"
        class="text-surface-900 bg-surface-50 border-surface-100 focus:border-brand-600 placeholder:text-surface-800/40 h-8 min-w-0 flex-1 rounded-md border px-2.5 text-sm transition outline-none"
      />
      <button
        type="submit"
        class="bg-brand-600 hover:bg-brand-700 flex size-8 shrink-0 items-center justify-center rounded-md text-white transition"
        aria-label="添加待办"
      >
        <Plus class="size-4" />
      </button>
    </form>
  </section>
</template>
