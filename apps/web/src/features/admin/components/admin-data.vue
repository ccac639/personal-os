<script setup lang="ts">
/**
 * Admin 数据与备份
 *
 * - 存储注册表：只管理白名单 key（registry.ts 唯一定义来源）
 * - 备份：全量 / 单模块 JSON 导出（Blob 下载），剔除敏感字段
 * - 导入：严格解析 → 预览 → 按模块选择模式 → 事务式恢复；导入前自动建回滚快照
 * - 清理：单模块 / 仅缓存 / 全部，一律二次确认并显示受影响范围
 */
import { ref } from 'vue';
import { DatabaseBackup, Download, Eraser, FileJson, History, Upload } from '@lucide/vue';
import { downloadFullBackup, downloadJson, downloadModuleBackup } from '../backup';
import {
  clearAllManagedData,
  clearCacheOnly,
  clearModuleData,
  MODULE_REGISTRY,
  scanAllModules,
} from '../registry';
import {
  buildRestorePreview,
  parseBackupJson,
  applyRestore,
  buildRollbackSnapshot,
  getLastRollbackSnapshot,
  clearRollbackSnapshot,
} from '../restore';
import { useAdminStore } from '../store';
import { useAdminToasts } from '../toast';
import type { RestoreMode, RestorePreview, RestoreResult } from '../types';
import AdminDialog from './admin-dialog.vue';

const adminStore = useAdminStore();
const { push } = useAdminToasts();

const { snapshots } = scanAllModules();

/* ---------------- 备份 ---------------- */

function onFullBackup(): void {
  const ok = downloadFullBackup();
  if (ok) {
    adminStore.markBackup();
    push('已导出全量备份（JSON，不含任何敏感字段）', 'success');
  } else {
    push('备份导出失败：浏览器下载不可用', 'error');
  }
}

function onModuleBackup(moduleId: string): void {
  const ok = downloadModuleBackup(moduleId);
  if (ok) {
    adminStore.markBackup();
    push(`已导出「${moduleId}」模块备份`, 'success');
  } else {
    push('备份导出失败：该模块暂无数据或下载不可用', 'error');
  }
}

/* ---------------- 导入 ---------------- */

const fileInput = ref<HTMLInputElement | null>(null);
const preview = ref<RestorePreview | null>(null);
const importResult = ref<RestoreResult | null>(null);
const choices = ref<Record<string, RestoreMode>>({});
const importBusy = ref(false);
const parseError = ref('');
/** 最近一次成功解析的备份原始文本（执行恢复时重新解析，保留数据） */
const importText = ref('');

function onPickFile(e: Event): void {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === 'string' ? reader.result : '';
    parseImport(text);
  };
  reader.onerror = () => {
    parseError.value = '读取文件失败';
  };
  reader.readAsText(file);
  input.value = '';
}

function parseImport(text: string): void {
  parseError.value = '';
  importResult.value = null;
  const parsed = parseBackupJson(text);
  if (!parsed.valid) {
    parseError.value = parsed.error ?? '解析失败';
    preview.value = null;
    return;
  }
  importText.value = text;
  const p = buildRestorePreview(parsed);
  preview.value = p;
  choices.value = Object.fromEntries(
    p.modules.map((m) => [
      m.moduleId,
      m.conflict === 'newer'
        ? 'skip'
        : m.supportedModes.includes('overwrite')
          ? 'overwrite'
          : 'skip',
    ]),
  );
}

function modeOf(moduleId: string): RestoreMode {
  return choices.value[moduleId] ?? 'skip';
}

async function runImport(): Promise<void> {
  if (!preview.value || !preview.value.valid) return;
  const parsed = parseBackupJson(importText.value);
  if (!parsed.valid) return;

  importBusy.value = true;
  // 事务式恢复；导入前自动创建当前可识别数据的临时回滚备份
  buildRollbackSnapshot();
  refreshRollback();
  importResult.value = applyRestore(parsed, choices.value);
  importBusy.value = false;

  if (importResult.value.ok) {
    push(
      `导入完成：恢复 ${importResult.value.restored.length} 个模块，跳过 ${importResult.value.skipped.length} 个`,
      'success',
    );
  } else {
    push(`导入失败：${importResult.value.error ?? '未知错误'}`, 'error');
  }
  preview.value = null;
}

/* ---------------- 回滚备份 ---------------- */

const rollbackOpen = ref(false);
const rollback = ref(getLastRollbackSnapshot());

function refreshRollback(): void {
  rollback.value = getLastRollbackSnapshot();
}

function openRollback(): void {
  refreshRollback();
  rollbackOpen.value = true;
}

function downloadRollback(): void {
  if (!rollback.value) return;
  const ok = downloadJson(
    'personal-os-rollback-before-import.json',
    JSON.stringify(rollback.value, null, 2),
  );
  if (ok) push('已下载导入前回滚备份', 'success');
  else push('下载失败', 'error');
}

function discardRollback(): void {
  clearRollbackSnapshot();
  rollback.value = null;
  rollbackOpen.value = false;
  push('已丢弃回滚备份（仅内存，未写入本地）', 'info');
}

/* ---------------- 清理 ---------------- */

const clearConfirm = ref<{
  kind: 'module' | 'cache' | 'all';
  title: string;
  description: string;
  targets: string[];
} | null>(null);

function requestClearModule(moduleId: string): void {
  const snap = snapshots.find((s) => s.moduleId === moduleId);
  const entry = MODULE_REGISTRY.find((m) => m.id === moduleId);
  const detail = snap?.summary?.detail ?? `${entry?.keys.length ?? 0} 个存储 key`;
  clearConfirm.value = {
    kind: 'module',
    title: `清理「${entry?.label ?? moduleId}」数据`,
    description: `将删除该模块全部本地数据（${detail}），操作不可撤销。建议先导出备份。`,
    targets: [moduleId],
  };
}

function requestClearCache(): void {
  clearConfirm.value = {
    kind: 'cache',
    title: '清理缓存类数据',
    description: '仅删除各模块的缓存 / UI 状态类数据（筛选、视图、模板等），不影响业务数据。',
    targets: [],
  };
}

function requestClearAll(): void {
  const present = snapshots.filter((s) => s.present);
  const summary = present
    .map((s) => `${s.label}${s.summary ? `（${s.summary.detail}）` : ''}`)
    .join('、');
  clearConfirm.value = {
    kind: 'all',
    title: '清理全部受管数据',
    description: `将删除所有受管模块的本地数据：${summary || '（当前无数据）'}。操作不可撤销，建议先导出全量备份。`,
    targets: [],
  };
}

function runClear(): void {
  const c = clearConfirm.value;
  if (!c) return;
  let removedCount = 0;
  if (c.kind === 'module') {
    for (const id of c.targets) removedCount += clearModuleData(id).removed.length;
  } else if (c.kind === 'cache') {
    removedCount += clearCacheOnly().removed.length;
  } else {
    removedCount += clearAllManagedData().removed.length;
  }
  push(`清理完成：移除 ${removedCount} 个存储 key`, 'success');
  clearConfirm.value = null;
  window.location.reload();
}

const STATUS_LABEL: Record<string, string> = {
  ok: '正常',
  missing: '无数据',
  corrupt: '损坏',
  unreadable: '不可读',
  newer: '版本过新',
};
</script>

<template>
  <div class="space-y-4">
    <header>
      <h1 class="text-surface-900 text-lg font-semibold">数据与备份</h1>
      <p class="text-surface-800/70 mt-1 text-sm">
        只管理注册表白名单内的本地数据；未识别 key 永不进入清理或备份范围。
      </p>
    </header>

    <!-- 存储注册表 -->
    <section class="border-surface-100 bg-surface-0 rounded-xl border" aria-label="存储注册表">
      <header class="flex items-center justify-between gap-2 px-4 py-3">
        <h2 class="text-surface-900 text-sm font-semibold">存储注册表</h2>
        <button
          type="button"
          class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
          @click="requestClearCache"
        >
          <Eraser class="size-3.5" aria-hidden="true" />
          仅清理缓存
        </button>
      </header>
      <ul class="divide-surface-100 divide-y">
        <li v-for="entry in MODULE_REGISTRY" :key="entry.id" class="flex flex-col gap-2 px-4 py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-surface-900 text-sm font-medium">{{ entry.label }}</p>
              <p class="text-surface-800/50 text-xs">
                {{ entry.keys.length }} 个 key · 当前版本 v{{ entry.currentVersion }} ·
                {{
                  STATUS_LABEL[snapshots.find((s) => s.moduleId === entry.id)?.status ?? 'missing']
                }}
              </p>
            </div>
            <div class="flex gap-1.5">
              <button
                type="button"
                class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                @click="onModuleBackup(entry.id)"
              >
                <Download class="size-3.5" aria-hidden="true" />
                导出
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2 py-1 text-xs text-rose-700 transition-colors hover:bg-rose-500/10 focus-visible:ring-2 focus-visible:ring-rose-500/40 focus-visible:outline-none"
                @click="requestClearModule(entry.id)"
              >
                <Eraser class="size-3.5" aria-hidden="true" />
                清理
              </button>
            </div>
          </div>
          <details class="text-surface-800/60 text-xs">
            <summary class="hover:text-surface-900 cursor-pointer select-none">
              查看受管 key
            </summary>
            <ul class="mt-1 space-y-0.5 pl-1">
              <li v-for="k in entry.keys" :key="k.key" class="font-mono">
                {{
                  k.kind === 'cache' ? '（缓存）' : k.kind === 'legacy' ? '（遗留）' : '（数据）'
                }}
                {{ k.key }}
              </li>
            </ul>
          </details>
        </li>
      </ul>
    </section>

    <!-- 备份 -->
    <section class="border-surface-100 bg-surface-0 rounded-xl border p-4" aria-label="备份">
      <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <DatabaseBackup class="size-4" aria-hidden="true" />
        备份
      </h2>
      <p class="text-surface-800/60 mt-1 text-sm">
        导出全部已识别模块的 JSON 备份（含应用版本、导出时间、模块清单与各模块版本）； 不含 API
        Key、Token、附件二进制与浏览器敏感信息。
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="bg-brand-600 text-surface-0 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          @click="onFullBackup"
        >
          <Download class="size-4" aria-hidden="true" />
          创建全量备份
        </button>
        <span
          v-if="adminStore.lastBackupAt"
          class="text-surface-800/50 self-center text-xs"
          role="status"
        >
          最近备份：{{ new Date(adminStore.lastBackupAt).toLocaleString() }}
        </span>
      </div>
    </section>

    <!-- 导入与恢复 -->
    <section class="border-surface-100 bg-surface-0 rounded-xl border p-4" aria-label="导入与恢复">
      <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <Upload class="size-4" aria-hidden="true" />
        导入与恢复
      </h2>
      <p class="text-surface-800/60 mt-1 text-sm">
        导入前严格解析并预览模块清单与版本兼容性；可按模块选择跳过 / 覆盖 / 合并。
        导入确认前会自动创建当前数据的临时回滚备份，写入失败时尽力回滚。
      </p>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          @click="fileInput?.click()"
        >
          <FileJson class="size-4" aria-hidden="true" />
          选择备份文件
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          aria-label="选择备份文件"
          @change="onPickFile"
        />
        <button
          v-if="rollback"
          type="button"
          class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          @click="openRollback"
        >
          <History class="size-4" aria-hidden="true" />
          查看最近回滚备份
        </button>
      </div>

      <p v-if="parseError" class="mt-3 text-sm text-rose-600" role="alert">{{ parseError }}</p>

      <!-- 导入预览 -->
      <div
        v-if="preview && preview.valid"
        class="border-surface-100 mt-4 rounded-lg border"
        role="region"
        aria-label="导入预览"
      >
        <header class="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <p class="text-surface-900 text-sm font-medium">
            导入预览：{{ preview.modules.length }} 个模块
            <span v-if="preview.appVersion" class="text-surface-800/50 ml-1 text-xs"
              >备份应用 v{{ preview.appVersion }}</span
            >
          </p>
          <span class="text-surface-800/50 text-xs">导入前将自动创建回滚备份</span>
        </header>
        <ul class="divide-surface-100 divide-y">
          <li
            v-for="m in preview.modules"
            :key="m.moduleId"
            class="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <p class="text-surface-900 text-sm font-medium">
                {{ m.label }}
                <span
                  v-if="m.conflict === 'newer'"
                  class="ml-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-600"
                  >版本过新</span
                >
                <span
                  v-else-if="m.conflict === 'older'"
                  class="ml-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700"
                  >旧版本</span
                >
              </p>
              <p class="text-surface-800/60 text-xs">
                备份 v{{ m.backupVersion ?? '未识别' }} → 本地 v{{ m.localVersion ?? '未识别' }} ·
                {{ m.count }} 条记录{{ m.parseable ? '' : ' · 无法解析' }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <button
                v-for="mode in m.supportedModes"
                :key="mode"
                type="button"
                class="focus-visible:ring-brand-500/40 rounded-lg border px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :class="
                  modeOf(m.moduleId) === mode
                    ? 'bg-surface-100 text-surface-900 font-medium'
                    : 'border-surface-100 text-surface-800/60 hover:bg-surface-100/60'
                "
                :aria-pressed="modeOf(m.moduleId) === mode"
                :disabled="mode === 'merge' && !m.supportedModes.includes('merge')"
                @click="choices[m.moduleId] = mode"
              >
                {{ mode === 'skip' ? '跳过' : mode === 'overwrite' ? '覆盖' : '合并' }}
              </button>
            </div>
          </li>
        </ul>
        <footer class="flex items-center justify-end gap-2 border-t px-3 py-2.5">
          <button
            type="button"
            class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            :disabled="importBusy"
            @click="preview = null"
          >
            取消
          </button>
          <button
            type="button"
            class="bg-brand-600 text-surface-0 hover:bg-brand-700 focus-visible:ring-brand-500/40 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            :disabled="importBusy"
            @click="runImport"
          >
            {{ importBusy ? '导入中…' : '确认导入' }}
          </button>
        </footer>
      </div>

      <!-- 导入结果 -->
      <div v-if="importResult" class="mt-3 text-sm" role="status">
        <p v-if="importResult.ok" class="text-emerald-700">
          导入成功：恢复 {{ importResult.restored.join('、') || '（无）' }}，跳过
          {{ importResult.skipped.join('、') || '（无）' }}
        </p>
        <p v-else class="text-rose-600">导入失败：{{ importResult.error }}</p>
      </div>
    </section>

    <!-- 清理全部 -->
    <section class="border-surface-100 bg-surface-0 rounded-xl border p-4" aria-label="数据清理">
      <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <Eraser class="size-4" aria-hidden="true" />
        数据清理
      </h2>
      <p class="text-surface-800/60 mt-1 text-sm">
        清理只作用于注册表白名单内的 key；不允许通过模糊 key、通配符或遍历删除未知数据。
        所有清理操作都需要二次确认并显示受影响范围。
      </p>
      <div class="mt-3">
        <button
          type="button"
          class="rounded-lg border border-rose-500/30 px-3 py-1.5 text-sm text-rose-700 transition-colors hover:bg-rose-500/10 focus-visible:ring-2 focus-visible:ring-rose-500/40 focus-visible:outline-none"
          @click="requestClearAll"
        >
          清理全部受管数据
        </button>
      </div>
    </section>

    <!-- 清理二次确认 -->
    <AdminDialog
      :open="clearConfirm !== null"
      :title="clearConfirm?.title ?? ''"
      :description="clearConfirm?.description ?? ''"
      confirm-text="确认清理"
      danger
      @update:open="
        (v: boolean) => {
          if (!v) clearConfirm = null;
        }
      "
      @confirm="runClear"
    />

    <!-- 回滚备份查看 -->
    <AdminDialog
      :open="rollbackOpen"
      title="最近一次自动回滚备份"
      description="导入前自动创建的内存快照；仅本次会话有效，不写入本地存储。"
      :hide-cancel="true"
      confirm-text="关闭"
      @update:open="
        (v: boolean) => {
          if (!v) rollbackOpen = false;
        }
      "
      @confirm="rollbackOpen = false"
    >
      <div class="text-surface-900 space-y-2 text-sm">
        <p>
          创建时间：{{ rollback?.createdAt ? new Date(rollback.createdAt).toLocaleString() : '—' }}
        </p>
        <ul class="text-surface-800/70 space-y-1">
          <li v-for="m in rollback?.modules ?? []" :key="m.moduleId">
            {{ m.label }} · v{{ m.version ?? '未识别' }} · {{ m.keys.length }} 个 key
          </li>
        </ul>
        <div class="flex gap-2 pt-2">
          <button
            type="button"
            class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            @click="downloadRollback"
          >
            下载快照
          </button>
          <button
            type="button"
            class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            @click="discardRollback"
          >
            丢弃快照
          </button>
        </div>
      </div>
    </AdminDialog>
  </div>
</template>
