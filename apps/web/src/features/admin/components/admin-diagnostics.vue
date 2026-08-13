<script setup lang="ts">
/**
 * Admin 系统诊断
 *
 * - 只读操作：生成报告不修改任何用户数据
 * - 可复制纯文本 / 导出 JSON
 * - Provider 只报告「已配置 / 未配置」，绝不暴露 API Key 内容或长度
 */
import { computed, ref } from 'vue';
import { ClipboardCopy, FileJson, RefreshCw, Stethoscope } from '@lucide/vue';
import { useRoute } from 'vue-router';
import { useThemeStore } from '@/stores/theme';
import {
  buildDiagnosticsReport,
  copyDiagnosticsText,
  diagnosticsToJson,
  diagnosticsToText,
} from '../diagnostics';
import { useAdminStore } from '../store';
import { useAdminToasts } from '../toast';
import type { DiagnosticsReport } from '../types';

const route = useRoute();
const themeStore = useThemeStore();
const adminStore = useAdminStore();
const { push } = useAdminToasts();

const report = ref<DiagnosticsReport | null>(null);
const generated = ref(false);

function generate(): void {
  report.value = buildDiagnosticsReport({
    route: route.path,
    theme: themeStore.palette.dark ? '深色' : '浅色',
    density: adminStore.prefs.appearance.density === 'compact' ? '紧凑' : '舒适',
    reduceMotion: adminStore.prefs.appearance.reduceMotion,
    providers: adminStore.providers.map((p) => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      hasKey: Boolean(p.apiKey?.trim()),
    })),
  });
  generated.value = true;
}

async function copyText(): Promise<void> {
  if (!report.value) return;
  const ok = await copyDiagnosticsText(diagnosticsToText(report.value));
  push(ok ? '诊断报告已复制到剪贴板' : '复制失败：剪贴板不可用', ok ? 'success' : 'error');
}

function exportJson(): void {
  if (!report.value) return;
  try {
    const blob = new Blob([diagnosticsToJson(report.value)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `personal-os-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    push('诊断报告已导出（JSON）', 'success');
  } catch {
    push('导出失败：浏览器下载不可用', 'error');
  }
}

const STATUS_LABEL: Record<string, string> = {
  ok: '正常',
  missing: '无数据',
  corrupt: '损坏',
  unreadable: '不可读',
  newer: '版本过新',
};

const reportText = computed(() => (report.value ? diagnosticsToText(report.value) : ''));
</script>

<template>
  <div class="space-y-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-surface-900 text-lg font-semibold">系统诊断</h1>
        <p class="text-surface-800/70 mt-1 text-sm">
          可复制、可导出的本地诊断报告；诊断操作不修改任何用户数据。
        </p>
      </div>
      <button
        type="button"
        class="bg-brand-600 text-surface-0 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        @click="generate"
      >
        <RefreshCw class="size-4" aria-hidden="true" />
        {{ generated ? '重新生成' : '生成诊断报告' }}
      </button>
    </header>

    <p v-if="!report" class="text-surface-800/60 text-sm">
      点击「生成诊断报告」查看本地状态摘要。报告不含任何 API Key / Token 内容。
    </p>

    <template v-if="report">
      <!-- 报告摘要卡片 -->
      <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div class="border-surface-100 bg-surface-0 rounded-xl border p-3">
          <p class="text-surface-800/60 text-xs">应用</p>
          <p class="text-surface-900 mt-1 text-sm font-medium">
            {{ report.app.name }} v{{ report.app.version }}
          </p>
          <p class="text-surface-800/50 mt-0.5 truncate text-xs">路由 {{ report.app.route }}</p>
        </div>
        <div class="border-surface-100 bg-surface-0 rounded-xl border p-3">
          <p class="text-surface-800/60 text-xs">本地存储用量</p>
          <p class="text-surface-900 mt-1 text-sm font-medium">
            {{ (report.storage.totalBytes / 1024).toFixed(1) }} KB
          </p>
          <p class="text-surface-800/50 mt-0.5 text-xs">
            {{ report.storage.nearQuota ? '接近配额' : '配额正常' }}
          </p>
        </div>
        <div class="border-surface-100 bg-surface-0 rounded-xl border p-3">
          <p class="text-surface-800/60 text-xs">模块状态</p>
          <p class="text-surface-900 mt-1 text-sm font-medium">
            {{ report.modules.filter((m) => m.status === 'ok').length }} /
            {{ report.modules.length }} 正常
          </p>
          <p class="text-surface-800/50 mt-0.5 text-xs">
            损坏或过新：{{
              report.modules.filter(
                (m) => m.status === 'corrupt' || m.status === 'newer' || m.status === 'unreadable',
              ).length
            }}
          </p>
        </div>
        <div class="border-surface-100 bg-surface-0 rounded-xl border p-3">
          <p class="text-surface-800/60 text-xs">Provider</p>
          <p class="text-surface-900 mt-1 text-sm font-medium">
            {{ report.providers.filter((p) => p.configured).length }} /
            {{ report.providers.length }} 已配置
          </p>
          <p class="text-surface-800/50 mt-0.5 text-xs">仅报告是否已配置</p>
        </div>
      </div>

      <!-- 模块明细 -->
      <section class="border-surface-100 bg-surface-0 rounded-xl border" aria-label="模块明细">
        <header class="px-4 py-3">
          <h2 class="text-surface-900 text-sm font-semibold">模块明细</h2>
        </header>
        <ul class="divide-surface-100 divide-y">
          <li
            v-for="m in report.modules"
            :key="m.moduleId"
            class="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="min-w-0">
              <p class="text-surface-900 text-sm font-medium">{{ m.label }}</p>
              <p class="text-surface-800/60 text-xs">
                {{ STATUS_LABEL[m.status] ?? m.status }}
                <span v-if="m.version !== null"> · v{{ m.version }}</span>
                <span v-if="m.summary"> · {{ m.summary.detail }}</span>
                <span v-if="m.keysFound.length === 0"> · 无本地数据</span>
              </p>
            </div>
            <p class="text-surface-800/50 shrink-0 text-xs">
              {{ (m.sizeBytes / 1024).toFixed(1) }} KB
            </p>
          </li>
        </ul>
      </section>

      <!-- 完整报告文本 -->
      <section class="border-surface-100 bg-surface-0 rounded-xl border" aria-label="完整报告">
        <header class="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
            <Stethoscope class="size-4" aria-hidden="true" />
            完整报告
          </h2>
          <div class="flex gap-2">
            <button
              type="button"
              class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
              @click="copyText"
            >
              <ClipboardCopy class="size-3.5" aria-hidden="true" />
              复制纯文本
            </button>
            <button
              type="button"
              class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
              @click="exportJson"
            >
              <FileJson class="size-3.5" aria-hidden="true" />
              导出 JSON
            </button>
          </div>
        </header>
        <pre
          class="text-surface-800/80 max-h-96 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap"
          >{{ reportText }}</pre>
      </section>

      <p
        class="text-surface-800/60 border-surface-100 border-l-2 pl-3 text-sm leading-relaxed"
        role="note"
      >
        {{ report.notice }}
      </p>
    </template>
  </div>
</template>
