<script setup lang="ts">
/**
 * Admin 危险操作区
 *
 * 所有操作：明确描述影响 → 二次确认（支持 Escape 取消）→ 操作中禁用重复点击
 * → 显示结果；不可撤销操作必须先提供备份。
 */
import { ref } from 'vue';
import { AlertTriangle, DatabaseBackup, ShieldAlert } from '@lucide/vue';
import { downloadFullBackup } from '../backup';
import { clearAllManagedData } from '../registry';
import { clearAdminPreferences } from '../storage';
import { useAdminStore } from '../store';
import { useAdminToasts } from '../toast';
import AdminDialog from './admin-dialog.vue';

const adminStore = useAdminStore();
const { push } = useAdminToasts();

interface DangerAction {
  id: 'reset-prefs' | 'clear-admin' | 'clear-all' | 'backup-then-clear';
  title: string;
  description: string;
}

const confirm = ref<DangerAction | null>(null);
const busy = ref(false);

const ACTIONS: Omit<DangerAction, 'description'>[] = [
  { id: 'reset-prefs', title: '恢复所有默认偏好' },
  { id: 'clear-admin', title: '清理 Admin 自身设置' },
  { id: 'clear-all', title: '清理所有受管模块本地数据' },
  { id: 'backup-then-clear', title: '生成并下载最终备份后清理' },
];

const DESCRIPTIONS: Record<DangerAction['id'], string> = {
  'reset-prefs':
    '将恢复管理系统全部个人偏好（资料、外观、自动化设置）到默认值。此操作可逆性有限，请确认。',
  'clear-admin':
    '将删除管理系统自身的全部本地设置（偏好与 Provider 配置标记）。此操作不可撤销，请先确认。',
  'clear-all':
    '将删除所有受管模块（Chat、工作流、开发中、任务、已完成、管理系统）的本地数据。此操作不可撤销，强烈建议先导出备份。',
  'backup-then-clear':
    '先自动下载一份全量备份，随后删除全部受管模块的本地数据。下载成功后才执行清理；下载失败则中止。',
};

function request(action: DangerAction['id']): void {
  confirm.value = {
    id: action,
    title: ACTIONS.find((a) => a.id === action)?.title ?? '',
    description: DESCRIPTIONS[action],
  };
}

async function run(): Promise<void> {
  const action = confirm.value;
  if (!action || busy.value) return;
  busy.value = true;

  try {
    switch (action.id) {
      case 'reset-prefs':
        adminStore.resetPrefs();
        push('已恢复所有默认偏好', 'success');
        break;
      case 'clear-admin': {
        const ok = clearAdminPreferences();
        push(ok ? '已清理 Admin 自身设置' : '清理失败：本地存储不可用', ok ? 'success' : 'error');
        if (ok) window.location.reload();
        break;
      }
      case 'clear-all': {
        const result = clearAllManagedData();
        push(
          `已清理全部受管数据（移除 ${result.removed.length} 个 key${result.failed.length ? `，${result.failed.length} 个失败` : ''}）`,
          result.failed.length === 0 ? 'success' : 'warning',
        );
        if (result.failed.length === 0) window.location.reload();
        break;
      }
      case 'backup-then-clear': {
        const backedUp = downloadFullBackup();
        if (!backedUp) {
          push('备份下载失败，已中止清理', 'error');
          break;
        }
        adminStore.markBackup();
        const result = clearAllManagedData();
        push(
          `已下载最终备份并清理（移除 ${result.removed.length} 个 key）`,
          result.failed.length === 0 ? 'success' : 'warning',
        );
        if (result.failed.length === 0) window.location.reload();
        break;
      }
    }
    confirm.value = null;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <header>
      <h1 class="text-surface-900 flex items-center gap-2 text-lg font-semibold">
        <ShieldAlert class="size-5 text-rose-600" aria-hidden="true" />
        危险操作
      </h1>
      <p class="text-surface-800/70 mt-1 text-sm">
        以下操作影响本地数据且大多不可撤销。每项操作都需要二次确认（支持 Escape 取消），
        不可撤销操作必须先提供备份。请谨慎操作。
      </p>
    </header>

    <section class="border-surface-100 bg-surface-0 rounded-xl border" aria-label="危险操作列表">
      <ul class="divide-surface-100 divide-y">
        <li
          v-for="action in ACTIONS"
          :key="action.id"
          class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <p class="text-surface-900 flex items-center gap-2 text-sm font-medium">
              <AlertTriangle
                v-if="action.id !== 'backup-then-clear'"
                class="size-4 shrink-0 text-rose-600"
                aria-hidden="true"
              />
              <DatabaseBackup v-else class="size-4 shrink-0 text-amber-600" aria-hidden="true" />
              {{ action.title }}
            </p>
            <p class="text-surface-800/60 mt-0.5 text-sm">{{ DESCRIPTIONS[action.id] }}</p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-lg border border-rose-500/30 px-3 py-1.5 text-sm text-rose-700 transition-colors hover:bg-rose-500/10 focus-visible:ring-2 focus-visible:ring-rose-500/40 focus-visible:outline-none"
            :class="
              action.id === 'backup-then-clear'
                ? 'border-amber-500/40 text-amber-700 hover:bg-amber-500/10'
                : ''
            "
            @click="request(action.id)"
          >
            {{ action.id === 'backup-then-clear' ? '备份后清理' : '执行' }}
          </button>
        </li>
      </ul>
    </section>

    <AdminDialog
      :open="confirm !== null"
      :title="confirm?.title ?? ''"
      :description="confirm?.description ?? ''"
      confirm-text="我已知晓，确认执行"
      danger
      :busy="busy"
      @update:open="
        (v: boolean) => {
          if (!v && !busy) confirm = null;
        }
      "
      @confirm="run"
    >
      <p class="text-sm text-rose-600" role="alert">
        此操作不可撤销。执行前请确认已导出所需备份；「清理」类操作会清空对应本地数据。
      </p>
    </AdminDialog>
  </div>
</template>
