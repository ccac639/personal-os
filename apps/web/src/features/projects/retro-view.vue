<script setup lang="ts">
import { AlertTriangle, Archive, Download, Eye, FileJson, Pencil, Save, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';

import { useProjectStore } from './store';
import { useTaskStore } from '@/features/tasks/store';
import { buildHealthStats, buildRetroTemplate, buildSnapshot } from './health';
import type { HealthStats } from './health';
import type { ProjectDetail, Retrospective } from './types';
import ConfirmDialog from './confirm-dialog.vue';
import SnapshotViewer from './snapshot-viewer.vue';

const props = defineProps<{ project: ProjectDetail }>();

const store = useProjectStore();
const taskStore = useTaskStore();

const today = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const health = computed<HealthStats>(() =>
  buildHealthStats({
    tasks: taskStore.tasksByProject(props.project.id),
    milestones: store.milestonesOf(props.project.id),
    activities: store.projectActivities(props.project.id),
    focusSessions: taskStore.focusSessions.filter((s) =>
      taskStore.tasksByProject(props.project.id).some((t) => t.id === s.taskId),
    ),
    today,
  }),
);

const retro = computed<Retrospective | null>(() => store.retrospectiveOf(props.project.id));

/** 笔记编辑状态（未保存时使用副本） */
const editing = ref(false);
const draft = ref<Omit<Retrospective, 'projectId' | 'updatedAt'>>({
  done: '',
  blockers: '',
  next: '',
  lessons: '',
});

function startEdit() {
  const r = retro.value;
  draft.value = {
    done: r?.done ?? '',
    blockers: r?.blockers ?? '',
    next: r?.next ?? '',
    lessons: r?.lessons ?? '',
  };
  if (!retro.value) {
    const tpl = buildRetroTemplate(health.value);
    draft.value = { ...tpl };
  }
  editing.value = true;
}

function saveDraft() {
  store.saveRetrospective(props.project.id, draft.value);
  editing.value = false;
}

/** 生成归档快照 */
const snapshoting = ref(false);
function createSnapshot() {
  const snapshot = buildSnapshot({
    project: props.project,
    tasks: taskStore.tasksByProject(props.project.id),
    milestones: store.milestonesOf(props.project.id),
    activities: store.projectActivities(props.project.id),
    retrospective: retro.value,
    now: new Date().toISOString(),
  });
  store.addSnapshot(snapshot);
  snapshoting.value = false;
}

const snapshots = computed(() => store.snapshotsOf(props.project.id));
const viewingSnapshotId = ref<string | null>(null);
const deletingSnapshotId = ref<string | null>(null);

/** 导出 JSON：Blob 下载（纯前端） */
function exportSnapshot(id: string) {
  const s = store.snapshotById(id);
  if (!s) return;
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `snapshot-${props.project.name}-${s.createdAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function confirmDeleteSnapshot() {
  if (deletingSnapshotId.value) store.deleteSnapshot(deletingSnapshotId.value);
  deletingSnapshotId.value = null;
}

const maxTrend = computed(() =>
  Math.max(
    1,
    ...health.value.doneTrend.map((d) => d.count),
    ...health.value.pendingTrend.map((d) => d.count),
  ),
);

function formatHours(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`;
}
</script>

<template>
  <div class="space-y-5">
    <!-- 健康统计 -->
    <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-4">
        <p class="text-surface-800/50 text-xs">完成率</p>
        <p class="text-surface-900 mt-1 text-2xl font-semibold">{{ health.completionRate }}%</p>
      </div>
      <div class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-4">
        <p class="text-surface-800/50 text-xs">逾期任务</p>
        <p
          class="mt-1 text-2xl font-semibold"
          :class="health.overdueCount ? 'text-red-600' : 'text-surface-900'"
        >
          {{ health.overdueCount }}
        </p>
      </div>
      <div class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-4">
        <p class="text-surface-800/50 text-xs">累计专注</p>
        <p class="text-surface-900 mt-1 text-2xl font-semibold">
          {{ formatHours(health.focusMinutes) }}
        </p>
      </div>
      <div class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-4">
        <p class="text-surface-800/50 text-xs">最近 7 / 30 天活动</p>
        <p class="text-surface-900 mt-1 text-2xl font-semibold">
          {{ health.activity7d
          }}<span class="text-surface-800/50 text-sm"> / {{ health.activity30d }}</span>
        </p>
      </div>
    </section>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <!-- 趋势（原生 CSS 柱状） -->
      <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
        <h2 class="text-surface-900 mb-4 text-sm font-semibold">最近 7 天任务趋势</h2>
        <div class="flex h-32 items-end gap-2">
          <div
            v-for="(d, i) in health.doneTrend"
            :key="d.date"
            class="flex flex-1 flex-col items-center gap-1"
          >
            <div class="flex h-24 w-full items-end justify-center gap-0.5">
              <div
                class="w-2.5 rounded-t bg-green-500/70"
                :style="{ height: `${(d.count / maxTrend) * 100}%` }"
                :title="`${d.date} 完成 ${d.count}`"
              />
              <div
                class="bg-surface-800/20 w-2.5 rounded-t"
                :style="{ height: `${(health.pendingTrend[i]?.count ?? 0 / maxTrend) * 100}%` }"
                :title="`${d.date} 未完成 ${health.pendingTrend[i]?.count ?? 0}`"
              />
            </div>
            <span class="text-surface-800/40 text-[10px]">{{ d.date.slice(5) }}</span>
          </div>
        </div>
        <div class="text-surface-800/50 mt-3 flex items-center gap-4 text-xs">
          <span class="flex items-center gap-1"
            ><span class="inline-block size-2.5 rounded-sm bg-green-500/70" />完成</span
          >
          <span class="flex items-center gap-1"
            ><span class="bg-surface-800/20 inline-block size-2.5 rounded-sm" />未完成</span
          >
        </div>
      </section>

      <!-- 里程碑摘要 -->
      <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
        <h2 class="text-surface-900 mb-4 text-sm font-semibold">里程碑状态与风险</h2>
        <div v-if="health.milestones.total" class="space-y-2">
          <div
            v-for="m in health.milestoneDetails"
            :key="m.id"
            class="border-surface-100 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
              :class="
                m.risk === 'done'
                  ? 'bg-green-500/10 text-green-600'
                  : m.risk === 'overdue'
                    ? 'bg-red-500/10 text-red-600'
                    : m.risk === 'at-risk'
                      ? 'bg-amber-500/10 text-amber-600'
                      : 'bg-sky-500/10 text-sky-600'
              "
            >
              <AlertTriangle
                v-if="m.risk === 'at-risk' || m.risk === 'overdue'"
                class="mr-1 size-3"
              />
              {{
                m.risk === 'done'
                  ? '已完成'
                  : m.risk === 'overdue'
                    ? '已逾期'
                    : m.risk === 'at-risk'
                      ? '有风险'
                      : '正常'
              }}
            </span>
            <span class="min-w-0 flex-1 truncate">{{ m.title }}</span>
            <span class="text-surface-800/40 text-xs">进度 {{ m.progress }}%</span>
          </div>
        </div>
        <p v-else class="text-surface-800/40 py-6 text-center text-sm">暂无里程碑</p>
      </section>
    </div>

    <!-- 复盘笔记 -->
    <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <Pencil class="text-brand-600 size-4" />
          复盘笔记
        </h2>
        <button
          v-if="!editing"
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
          @click="startEdit"
        >
          <Pencil class="size-3.5" />
          {{ retro ? '编辑' : '生成模板' }}
        </button>
      </div>

      <div v-if="editing" class="space-y-3">
        <div
          v-for="field in [
            ['done', '本期完成'],
            ['blockers', '阻塞问题'],
            ['next', '下期计划'],
            ['lessons', '经验记录'],
          ] as const"
          :key="field[0]"
        >
          <label class="text-surface-800/60 mb-1 block text-xs font-medium">{{ field[1] }}</label>
          <textarea
            v-model="draft[field[0]]"
            rows="2"
            class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-full resize-y rounded-lg border px-3 py-2 text-sm leading-6 transition outline-none focus:ring-4"
            :placeholder="`${field[1]}…`"
          />
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
            @click="editing = false"
          >
            取消
          </button>
          <button
            type="button"
            class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
            @click="saveDraft"
          >
            <Save class="size-3.5" />
            保存复盘
          </button>
        </div>
      </div>

      <div v-else-if="retro" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div
          v-for="field in [
            ['done', '本期完成'],
            ['blockers', '阻塞问题'],
            ['next', '下期计划'],
            ['lessons', '经验记录'],
          ] as const"
          :key="field[0]"
        >
          <h3 class="text-surface-800/50 mb-1 text-xs font-medium">{{ field[1] }}</h3>
          <p class="text-surface-800/80 text-sm leading-6 whitespace-pre-wrap">
            {{ retro[field[0]] || '—' }}
          </p>
        </div>
      </div>
      <p v-else class="text-surface-800/40 py-6 text-center text-sm">
        尚未撰写复盘笔记，点击「生成模板」基于当前健康数据预填。
      </p>
    </section>

    <!-- 归档快照 -->
    <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <Archive class="text-brand-600 size-4" />
          归档快照
        </h2>
        <button
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          @click="snapshoting = true"
        >
          <Archive class="size-3.5" />
          生成快照
        </button>
      </div>
      <p class="text-surface-800/50 mb-4 text-xs">
        快照包含项目元数据、任务、里程碑、活动记录与复盘笔记，仅保存在本地，可导出 JSON。
      </p>
      <div v-if="snapshots.length" class="space-y-2">
        <div
          v-for="s in snapshots"
          :key="s.id"
          class="border-surface-100 hover:border-brand-500/40 flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors"
        >
          <FileJson class="text-surface-800/40 size-4 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-surface-900 text-sm font-medium">
              {{ s.createdAt.slice(0, 16).replace('T', ' ') }}
            </p>
            <p class="text-surface-800/40 mt-0.5 text-xs">
              {{ s.data.tasks.length }} 个任务 · {{ s.data.milestones.length }} 个里程碑 ·
              {{ s.data.activities.length }} 条活动
            </p>
          </div>
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-7 items-center justify-center rounded-md transition-colors"
            aria-label="查看快照"
            title="查看"
            @click="viewingSnapshotId = s.id"
          >
            <Eye class="size-3.5" />
          </button>
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-7 items-center justify-center rounded-md transition-colors"
            aria-label="导出快照 JSON"
            title="导出 JSON"
            @click="exportSnapshot(s.id)"
          >
            <Download class="size-3.5" />
          </button>
          <button
            type="button"
            class="text-surface-800/50 flex size-7 items-center justify-center rounded-md transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label="删除快照"
            title="删除"
            @click="deletingSnapshotId = s.id"
          >
            <Trash2 class="size-3.5" />
          </button>
        </div>
      </div>
      <p v-else class="text-surface-800/40 py-6 text-center text-sm">
        暂无快照。归档项目前建议先生成一份。
      </p>
    </section>

    <!-- 快照查看 -->
    <SnapshotViewer :snapshot-id="viewingSnapshotId" @close="viewingSnapshotId = null" />

    <!-- 生成确认 -->
    <ConfirmDialog
      :open="snapshoting"
      title="生成归档快照"
      message="将当前项目元数据、任务、里程碑、活动记录与复盘笔记保存为本地快照。"
      confirm-text="生成"
      @confirm="createSnapshot"
      @cancel="snapshoting = false"
    />

    <!-- 删除快照确认 -->
    <ConfirmDialog
      :open="deletingSnapshotId !== null"
      title="删除快照"
      message="确定删除该快照吗？此操作不可恢复。"
      confirm-text="删除"
      danger
      @confirm="confirmDeleteSnapshot"
      @cancel="deletingSnapshotId = null"
    />
  </div>
</template>
