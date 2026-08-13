<script setup lang="ts">
/**
 * Admin 概览：系统状态摘要 + 快捷入口
 *
 * - 主题 / 密度 / 动效 / 默认页面来自 theme store 与 admin 偏好
 * - 存储用量、模块状态来自注册表扫描（宽容处理缺失 / 损坏 / 不可读）
 * - 快捷入口：创建备份、导入数据、运行诊断、清理缓存
 */
import { computed } from 'vue';
import {
  ArrowRight,
  DatabaseBackup,
  Download,
  Eraser,
  Gauge,
  HardDrive,
  Stethoscope,
} from '@lucide/vue';
import { useThemeStore } from '@/stores/theme';
import { downloadFullBackup } from '../backup';
import { scanAllModules } from '../registry';
import { useAdminStore } from '../store';
import { useAdminToasts } from '../toast';
import type { AdminSection } from '../types';

const emit = defineEmits<{
  navigate: [section: AdminSection];
}>();

const themeStore = useThemeStore();
const adminStore = useAdminStore();
const { push } = useAdminToasts();

const { snapshots, totalBytes } = scanAllModules();

const themeLabel = computed(() => (themeStore.palette.dark ? '深色' : '浅色'));
const densityLabel = computed(() =>
  adminStore.prefs.appearance.density === 'compact' ? '紧凑' : '舒适',
);
const motionLabel = computed(() => (adminStore.prefs.appearance.reduceMotion ? '已减少' : '启用'));
const defaultPageLabel = computed(() => {
  const map: Record<string, string> = {
    dashboard: '首页',
    chat: 'Chat',
    workflows: '工作流',
    projects: '开发中',
    achievements: '已完成',
  };
  return map[adminStore.prefs.appearance.defaultPage] ?? '首页';
});

/** 概览重点展示的业务模块（Chat / 工作流 / 开发中 / 已完成） */
const featureModules = computed(() =>
  snapshots.filter((s) => ['chat', 'workflows', 'projects', 'achievements'].includes(s.moduleId)),
);

const managedModuleCount = computed(() => snapshots.filter((s) => s.present).length);

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '从未备份';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const STATUS_LABEL: Record<string, string> = {
  ok: '正常',
  missing: '无数据',
  corrupt: '损坏',
  unreadable: '不可读',
  newer: '版本过新',
};

const QUICK_ACTIONS: {
  id: AdminSection;
  label: string;
  description: string;
  icon: unknown;
  /** backup: 直接触发全量备份下载；navigate: 跳转到对应 section */
  behavior: 'backup' | 'navigate';
}[] = [
  {
    id: 'data',
    label: '创建备份',
    description: '导出全部受管模块',
    icon: DatabaseBackup,
    behavior: 'backup',
  },
  {
    id: 'data',
    label: '导入数据',
    description: '恢复或合并备份',
    icon: Download,
    behavior: 'navigate',
  },
  {
    id: 'diagnostics',
    label: '运行诊断',
    description: '生成本地诊断报告',
    icon: Stethoscope,
    behavior: 'navigate',
  },
  {
    id: 'data',
    label: '清理缓存',
    description: '仅清理缓存类数据',
    icon: Eraser,
    behavior: 'navigate',
  },
];

function onQuickAction(action: (typeof QUICK_ACTIONS)[number]): void {
  if (action.behavior === 'backup') {
    const ok = downloadFullBackup();
    if (ok) {
      adminStore.markBackup();
      push('已导出全量备份（JSON，不含敏感字段）', 'success');
    } else {
      push('备份导出失败：浏览器下载不可用', 'error');
    }
    return;
  }
  emit('navigate', action.id);
}
</script>

<template>
  <div class="space-y-4">
    <header>
      <h1 class="text-surface-900 text-lg font-semibold">管理概览</h1>
      <p class="text-surface-800/70 mt-1 text-sm">
        个人本地控制台：设置、数据维护、诊断与备份。仅本机所有者使用。
      </p>
    </header>

    <!-- 快捷入口 -->
    <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <button
        v-for="(action, i) in QUICK_ACTIONS"
        :key="i"
        type="button"
        class="border-surface-100 bg-surface-0 hover:bg-surface-50 group focus-visible:ring-brand-500/40 flex items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
        @click="onQuickAction(action)"
      >
        <span
          class="bg-surface-100 text-surface-800/80 flex size-9 shrink-0 items-center justify-center rounded-lg"
        >
          <component :is="action.icon" class="size-4.5" aria-hidden="true" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="text-surface-900 block text-sm font-medium">{{ action.label }}</span>
          <span class="text-surface-800/60 block truncate text-xs">{{ action.description }}</span>
        </span>
        <ArrowRight
          class="text-surface-800/40 group-hover:text-surface-800/80 size-3.5 shrink-0"
          aria-hidden="true"
        />
      </button>
    </div>

    <!-- 外观与偏好摘要 -->
    <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <div class="border-surface-100 bg-surface-0 rounded-xl border p-3">
        <p class="text-surface-800/60 text-xs">当前主题</p>
        <p class="text-surface-900 mt-1 text-sm font-medium">{{ themeLabel }}</p>
        <p class="text-surface-800/50 mt-0.5 text-xs">{{ themeStore.background }}</p>
      </div>
      <div class="border-surface-100 bg-surface-0 rounded-xl border p-3">
        <p class="text-surface-800/60 text-xs">界面密度</p>
        <p class="text-surface-900 mt-1 text-sm font-medium">{{ densityLabel }}</p>
        <p class="text-surface-800/50 mt-0.5 text-xs">动效：{{ motionLabel }}</p>
      </div>
      <div class="border-surface-100 bg-surface-0 rounded-xl border p-3">
        <p class="text-surface-800/60 text-xs">默认页面</p>
        <p class="text-surface-900 mt-1 text-sm font-medium">{{ defaultPageLabel }}</p>
        <p class="text-surface-800/50 mt-0.5 text-xs">
          24 小时制：{{ adminStore.prefs.appearance.use24Hour ? '开' : '关' }}
        </p>
      </div>
      <div class="border-surface-100 bg-surface-0 rounded-xl border p-3">
        <p class="text-surface-800/60 text-xs">本地存储</p>
        <p class="text-surface-900 mt-1 text-sm font-medium">{{ fmtBytes(totalBytes) }}</p>
        <p class="text-surface-800/50 mt-0.5 text-xs">{{ managedModuleCount }} 个模块有数据</p>
      </div>
    </div>

    <!-- 模块数据状态 -->
    <section class="border-surface-100 bg-surface-0 rounded-xl border" aria-label="模块数据状态">
      <header class="flex items-center justify-between px-4 py-3">
        <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
          <HardDrive class="size-4" aria-hidden="true" />
          模块数据状态
        </h2>
        <span class="text-surface-800/50 text-xs"
          >最后备份：{{ fmtTime(adminStore.lastBackupAt) }}</span
        >
      </header>
      <ul class="divide-surface-100 divide-y">
        <li
          v-for="m in featureModules"
          :key="m.moduleId"
          class="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <p class="text-surface-900 text-sm font-medium">{{ m.label }}</p>
            <p class="text-surface-800/60 truncate text-xs">
              {{ STATUS_LABEL[m.status] ?? m.status }}
              <span v-if="m.version !== null"> · v{{ m.version }}</span>
              <span v-if="m.summary"> · {{ m.summary.detail }}</span>
            </p>
          </div>
          <p
            class="shrink-0 text-xs"
            :class="
              m.status === 'corrupt' || m.status === 'unreadable'
                ? 'text-rose-600'
                : 'text-surface-800/50'
            "
          >
            {{ fmtBytes(m.sizeBytes) }}
          </p>
        </li>
      </ul>
    </section>

    <!-- 诊断入口提示 -->
    <section
      class="border-surface-100 bg-surface-0 rounded-xl border p-4"
      aria-label="本地状态提醒"
    >
      <p class="text-surface-800/70 flex items-start gap-2 text-sm leading-relaxed">
        <Gauge class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          这是本地 mock 前端：未连接真实模型、后端与定时任务。数据全部存储在本机浏览器
          localStorage；如需迁移或清理，请前往「数据与备份」。
        </span>
      </p>
    </section>
  </div>
</template>
