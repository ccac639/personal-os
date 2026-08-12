/**
 * 任务功能域 —— Pinia store
 *
 * 职责：任务 CRUD、看板跨列移动与列内重排、排序策略、逾期统计、
 * localStorage 本地持久化（纯前端 mock，不调用后端）。
 *
 * 任务事件（创建 / 移动 / 删除）会同步写入所属项目的活动记录，
 * 供项目详情「活动记录」视图展示。
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { TaskStatus } from '@personal-os/types';

import { useProjectStore } from '@/features/projects/store';
import { SEED_TASKS } from './mock';
import { TASK_PRIORITY_META, TASK_STATUS_META } from './types';
import type { TaskForm, TaskItem, TaskSortKey, TaskStats, TaskSummary } from './types';

const STORAGE_KEY = 'personal-os.tasks.v1';

interface PersistedState {
  tasks: TaskItem[];
  sortBy: TaskSortKey;
  sortDir: 'asc' | 'desc';
}

function uid(): string {
  return `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (Array.isArray(parsed.tasks)) {
        return {
          tasks: parsed.tasks,
          sortBy: parsed.sortBy ?? 'order',
          sortDir: parsed.sortDir ?? 'asc',
        };
      }
    }
  } catch {
    /* 数据损坏时回退到种子 */
  }
  // 克隆种子，避免跨 store 实例共享可变引用
  return {
    tasks: SEED_TASKS.map((t) => ({ ...t, tags: [...t.tags] })),
    sortBy: 'order',
    sortDir: 'asc',
  };
}

export const useTaskStore = defineStore('tasks', () => {
  const initial = loadState();
  const tasks = ref<TaskItem[]>(initial.tasks);
  /** 看板列内排序策略（order = 手动） */
  const sortBy = ref<TaskSortKey>(initial.sortBy);
  const sortDir = ref<'asc' | 'desc'>(initial.sortDir);

  watch(
    [tasks, sortBy, sortDir],
    () => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ tasks: tasks.value, sortBy: sortBy.value, sortDir: sortDir.value }),
        );
      } catch {
        /* 存储失败（配额 / 隐私模式）不阻塞操作 */
      }
    },
    { deep: true, flush: 'sync' },
  );

  const projectStore = useProjectStore();

  function taskById(id: string): TaskItem | null {
    return tasks.value.find((t) => t.id === id) ?? null;
  }

  function tasksByProject(projectId: string): TaskItem[] {
    return tasks.value.filter((t) => t.projectId === projectId);
  }

  /** 比较函数：按当前排序策略比较两条任务（order 恒为升序兜底） */
  function compare(a: TaskItem, b: TaskItem): number {
    if (sortBy.value === 'order') return a.order - b.order;
    if (sortBy.value === 'priority') {
      const r = TASK_PRIORITY_META[b.priority].rank - TASK_PRIORITY_META[a.priority].rank;
      return r !== 0 ? r : a.order - b.order;
    }
    if (sortBy.value === 'dueDate') {
      if (!a.dueDate && !b.dueDate) return a.order - b.order;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      return a.order - b.order;
    }
    const ka = String(a[sortBy.value] ?? '');
    const kb = String(b[sortBy.value] ?? '');
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.order - b.order;
  }

  /** 某项目某状态列的任务（已按排序策略排列） */
  function tasksInColumn(projectId: string, status: TaskStatus): TaskItem[] {
    const list = tasks.value.filter((t) => t.projectId === projectId && t.status === status);
    return [...list].sort((a, b) => {
      const r = compare(a, b);
      return sortBy.value === 'order' || sortDir.value === 'asc' ? r : -r;
    });
  }

  function nextOrder(projectId: string, status: TaskStatus): number {
    const col = tasks.value.filter((t) => t.projectId === projectId && t.status === status);
    return col.length ? Math.max(...col.map((t) => t.order)) + 1 : 0;
  }

  function createTask(input: TaskForm): TaskItem {
    const now = new Date().toISOString();
    const task: TaskItem = {
      id: uid(),
      projectId: input.projectId,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate || undefined,
      tags: input.tags,
      order: nextOrder(input.projectId ?? '', input.status),
      createdAt: now,
      updatedAt: now,
    };
    tasks.value.push(task);
    if (task.projectId) {
      projectStore.addActivity(task.projectId, 'task', '创建任务', task.title);
    }
    return task;
  }

  function updateTask(id: string, input: TaskForm): void {
    const t = taskById(id);
    if (!t) return;
    const statusChanged = t.status !== input.status;
    t.title = input.title.trim();
    t.description = input.description?.trim() || undefined;
    t.priority = input.priority;
    t.status = input.status;
    t.dueDate = input.dueDate || undefined;
    t.tags = input.tags;
    // 状态变更时移到目标列末尾
    if (statusChanged) t.order = nextOrder(t.projectId ?? '', t.status);
    t.updatedAt = new Date().toISOString();
  }

  function deleteTask(id: string): void {
    const t = taskById(id);
    if (!t) return;
    tasks.value = tasks.value.filter((x) => x.id !== id);
    if (t.projectId) {
      projectStore.addActivity(t.projectId, 'task', '删除任务', t.title);
    }
  }

  /** 删除项目时级联清理其全部任务（不逐条记活动） */
  function removeByProject(projectId: string): void {
    tasks.value = tasks.value.filter((t) => t.projectId !== projectId);
  }

  /** 看板跨列移动：追加到目标列末尾，并写入项目活动记录 */
  function moveTask(id: string, status: TaskStatus): void {
    const t = taskById(id);
    if (!t || t.status === status) return;
    t.status = status;
    t.order = nextOrder(t.projectId ?? '', status);
    t.updatedAt = new Date().toISOString();
    if (t.projectId) {
      projectStore.addActivity(
        t.projectId,
        'task',
        `任务移至「${TASK_STATUS_META[status].label}」`,
        t.title,
      );
    }
  }

  /** 列内重排：按传入顺序重写 order（配合拖拽） */
  function reorderColumn(projectId: string, status: TaskStatus, orderedIds: string[]): void {
    orderedIds.forEach((id, index) => {
      const t = taskById(id);
      if (t && t.projectId === projectId && t.status === status) t.order = index;
    });
  }

  /** 切换排序：同一键再点一次翻转方向；order 不参与翻转 */
  function setSort(key: TaskSortKey): void {
    if (sortBy.value === key && key !== 'order') {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortBy.value = key;
    sortDir.value = 'asc';
  }

  function projectStats(projectId: string): TaskStats {
    const list = tasksByProject(projectId);
    const count = (s: TaskStatus) => list.filter((t) => t.status === s).length;
    const done = count('done');
    const nonCancelled = list.length - count('cancelled');
    const overdue = list.filter(
      (t) => t.status !== 'done' && t.dueDate && t.dueDate < todayStr(),
    ).length;
    return {
      total: list.length,
      todo: count('todo'),
      inProgress: count('in-progress'),
      done,
      cancelled: count('cancelled'),
      progress: nonCancelled === 0 ? 0 : Math.round((done / nonCancelled) * 100),
      overdue,
    };
  }

  /** 全局任务摘要（首页等只读模块消费） */
  const summary = computed<TaskSummary>(() => {
    const count = (s: TaskStatus) => tasks.value.filter((t) => t.status === s).length;
    const done = count('done');
    const nonCancelled = tasks.value.length - count('cancelled');
    return {
      total: tasks.value.length,
      todo: count('todo'),
      inProgress: count('in-progress'),
      done,
      overdue: tasks.value.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < todayStr())
        .length,
      completion: nonCancelled === 0 ? 0 : Math.round((done / nonCancelled) * 100),
    };
  });

  return {
    tasks,
    sortBy,
    sortDir,
    taskById,
    tasksByProject,
    tasksInColumn,
    createTask,
    updateTask,
    deleteTask,
    removeByProject,
    moveTask,
    reorderColumn,
    setSort,
    projectStats,
    summary,
  };
});
