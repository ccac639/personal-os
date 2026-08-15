<script setup lang="ts">
import {
  AlertTriangle,
  Archive,
  Download,
  Ellipsis,
  Eye,
  FileJson,
  Pencil,
  Rocket,
  Save,
  Trash2,
  Upload,
} from '@lucide/vue';
import { computed, ref } from 'vue';

import { useProjectStore } from './store';
import { useTaskStore } from '@/features/tasks/store';
import { useReleaseStore } from './release-store';
import { releaseSummaryForRetro } from './archive';
import {
  buildHealthStats,
  buildRetroMarkdown,
  buildRetroTemplate,
  buildRiskRules,
  buildSnapshot,
} from './health';
import type { HealthStats, RiskRule } from './health';
import { parseSnapshotJson } from './persistence';
import type { ProjectSnapshot } from './types';
import type { ProjectDetail, Retrospective } from './types';
import ConfirmDialog from './confirm-dialog.vue';
import SnapshotViewer from './snapshot-viewer.vue';

const props = defineProps<{ project: ProjectDetail }>();

const store = useProjectStore();
const taskStore = useTaskStore();
const releaseStore = useReleaseStore();

/** 发布记录摘要（供复盘引用；不修改 Achievements 模块） */
const releaseSummary = computed(() => releaseSummaryForRetro(releaseStore, props.project.id));

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

/** 健康风险规则（进度落后 / 临近截止 / 长期无活动 / 阻塞 / 专注偏差） */
const rules = computed<RiskRule[]>(() =>
  buildRiskRules({
    project: props.project,
    tasks: taskStore.tasksByProject(props.project.id),
    milestones: store.milestonesOf(props.project.id),
    activities: store.projectActivities(props.project.id),
    focusSessions: taskStore.focusSessions.filter((s) =>
      taskStore.tasksByProject(props.project.id).some((t) => t.id === s.taskId),
    ),
    today,
    latestActivityAt: store.latestActivity(props.project.id)?.createdAt ?? null,
  }),
);

const retro = computed<Retrospective | null>(() => store.retrospectiveOf(props.project.id));

/** 更多菜单（导出 / 导入等低频操作收纳） */
const moreOpen = ref(false);

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

/** 导出复盘 Markdown（下载 .md，纯前端） */
function exportMarkdown() {
  const md = buildRetroMarkdown({
    project: props.project,
    health: health.value,
    rules: rules.value,
    retro: retro.value ? { ...retro.value } : null,
    tasks: taskStore.tasksByProject(props.project.id),
  });
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `retro-${props.project.name}-${today}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 快照导入：文件 → 解析 → 预览 → 确认入库 */
const importingSnapshot = ref(false);
const importPreview = ref<
  { ok: true; snapshot: ProjectSnapshot } | { ok: false; reason: string } | null
>(null);

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  moreOpen.value = false;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? '');
    importPreview.value = parseSnapshotJson(text);
  };
  reader.readAsText(file);
  input.value = '';
}

function confirmImportSnapshot() {
  if (importPreview.value?.ok) {
    store.addSnapshot(importPreview.value.snapshot);
    importingSnapshot.value = false;
    importPreview.value = null;
  }
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

    <!-- 健康风险规则 -->
    <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
      <h2 class="text-surface-900 mb-3 flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle class="size-4 text-amber-500" />
        健康风险
      </h2>
      <div v-if="rules.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="r in rules"
          :key="r.key"
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
          :class="
            r.level === 'danger' ? 'bg-red-500/10 text-red-600' : 'bg-amber-500/10 text-amber-600'
          "
        >
          <AlertTriangle class="size-3" />
          {{ r.label }}：{{ r.detail }}
        </span>
      </div>
      <p v-else class="text-surface-800/40 text-xs">暂无异常，项目按计划推进。</p>
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
        <div class="flex items-center gap-2">
          <button
            v-if="!editing"
            type="button"
            class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
            @click="startEdit"
          >
            <Pencil class="size-3.5" />
            {{ retro ? '编辑' : '生成摘要' }}
          </button>
          <div class="relative">
            <button
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors"
              aria-label="复盘更多操作"
              title="更多操作"
              @click="moreOpen = !moreOpen"
            >
              <Ellipsis class="size-4" />
            </button>
            <div
              v-if="moreOpen"
              class="border-surface-100 bg-surface-0 shadow-float absolute top-10 right-0 z-20 w-44 overflow-hidden rounded-xl border py-1"
              role="menu"
              aria-label="复盘更多操作"
            >
              <button
                v-if="retro"
                type="button"
                role="menuitem"
                class="text-surface-800/80 hover:bg-surface-50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
                @click="
                  exportMarkdown();
                  moreOpen = false;
                "
              >
                <Download class="size-3.5" />
                导出复盘 Markdown
              </button>
              <label
                class="text-surface-800/80 hover:bg-surface-50 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs transition-colors"
                role="menuitem"
              >
                <Upload class="size-3.5" />
                导入快照
                <input
                  type="file"
                  accept=".json,application/json"
                  class="hidden"
                  @change="onImportFile"
                />
              </label>
            </div>
          </div>
        </div>
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
          <AppButton @click="saveDraft">
            <Save class="size-3.5" />
            保存复盘
          </AppButton>
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
        尚未撰写复盘笔记，点击「生成摘要」基于健康数据预填。
      </p>
    </section>

    <!-- 发布记录（复盘引用；不修改 Achievements 模块） -->
    <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <Rocket class="text-brand-600 size-4" />
          发布记录
        </h2>
      </div>
      <ul class="space-y-1.5">
        <li
          v-for="r in releaseSummary.records"
          :key="r.id"
          class="border-surface-100 bg-surface-50 flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
        >
          <div class="min-w-0">
            <p class="text-surface-800/80 truncate text-sm font-medium">
              {{ r.version }} · {{ r.title }}
            </p>
            <p class="text-surface-800/50 text-xs">
              {{ r.releaseDate }} · {{ r.taskIds.length }} 个任务 ·
              {{ r.items.filter((i) => i.done).length }}/{{ r.items.length }} 项通过
            </p>
          </div>
        </li>
        <li
          v-if="releaseSummary.checklists.length > 0"
          class="rounded-lg border border-amber-200 bg-amber-500/5 px-3 py-2 text-xs text-amber-700"
        >
          还有 {{ releaseSummary.checklists.length }} 个未完成发布检查单
        </li>
        <li
          v-if="releaseSummary.records.length === 0 && releaseSummary.checklists.length === 0"
          class="text-surface-800/30 py-2 text-center text-xs"
        >
          暂无发布记录
        </li>
      </ul>
    </section>

    <!-- 归档快照 -->
    <section class="border-surface-100 bg-surface-0 shadow-card rounded-card border p-5">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <Archive class="text-brand-600 size-4" />
          归档快照
        </h2>
        <div class="flex items-center gap-2">
          <AppButton @click="snapshoting = true">
            <Archive class="size-3.5" />
            生成快照
          </AppButton>
        </div>
      </div>
      <p class="text-surface-800/50 mb-4 text-xs">
        快照包含项目元数据、任务、里程碑、活动记录与复盘笔记，仅保存在本地，可导出 / 导入 JSON。
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

    <!-- 快照导入预览 -->
    <div
      v-if="importPreview !== null"
      class="fixed inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="导入快照预览"
    >
      <div class="bg-surface-900/30 absolute inset-0" @click="importPreview = null" />
      <div
        class="border-surface-100 bg-surface-0 shadow-float relative w-full max-w-md rounded-xl border p-5"
      >
        <template v-if="importPreview.ok">
          <h3 class="text-surface-900 text-base font-semibold">导入快照预览</h3>
          <p class="text-surface-800/60 mt-1 text-sm">
            将导入以下历史快照（仅作为归档记录，不覆盖当前数据）：
          </p>
          <dl class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-surface-800/50">快照时间</dt>
              <dd class="text-surface-900">
                {{ importPreview.snapshot.createdAt.slice(0, 16).replace('T', ' ') }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-surface-800/50">项目</dt>
              <dd class="text-surface-900 max-w-[60%] truncate">
                {{ importPreview.snapshot.data.project.name }}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-surface-800/50">内容</dt>
              <dd class="text-surface-900">
                {{ importPreview.snapshot.data.tasks.length }} 任务 ·
                {{ importPreview.snapshot.data.milestones.length }} 里程碑 ·
                {{ importPreview.snapshot.data.activities.length }} 活动
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-surface-800/50">所属项目</dt>
              <dd class="text-surface-900">
                {{
                  importPreview.snapshot.data.project.id === props.project.id
                    ? '当前项目'
                    : '其他项目（原样归档）'
                }}
              </dd>
            </div>
          </dl>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
              @click="importPreview = null"
            >
              取消
            </button>
            <AppButton @click="confirmImportSnapshot"> 确认导入 </AppButton>
          </div>
        </template>
        <template v-else>
          <h3 class="text-surface-900 text-base font-semibold">导入失败</h3>
          <p class="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {{ importPreview?.ok === false ? importPreview.reason : '未知错误' }}
          </p>
          <div class="mt-5 flex justify-end">
            <button
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
              @click="importPreview = null"
            >
              关闭
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
