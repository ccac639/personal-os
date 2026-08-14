<script setup lang="ts">
/** 设置视图：Base URL / 管理凭据 / 连接测试 / 超时 / 自动刷新 / 危险操作 */
import { computed, ref, watch } from 'vue';
import { AlertTriangle, Plug, Trash2 } from '@lucide/vue';

import {
  useSub2ApiClearSettings,
  useSub2ApiSaveSettings,
  useSub2ApiSettings,
  useSub2ApiTestConnection,
} from '../hooks';
import { confirm } from '@/app/confirm';
import ErrorBanner from './error-banner.vue';

const settingsQuery = useSub2ApiSettings();
const settings = computed(() => settingsQuery.data.value);

/* ---------- 表单（从后端快照初始化） ---------- */
const baseUrl = ref('');
const apiToken = ref('');
const timeoutMs = ref(15_000);
const autoRefresh = ref(false);
const refreshIntervalSec = ref(60);
const formError = ref<string | null>(null);
const formSuccess = ref<string | null>(null);
const initialized = ref(false);

const saveMutation = useSub2ApiSaveSettings();
const clearMutation = useSub2ApiClearSettings();
const testMutation = useSub2ApiTestConnection();

function initForm(): void {
  const s = settings.value;
  if (!s) return;
  baseUrl.value = s.baseUrlMasked && s.baseUrlMasked !== '未配置' ? s.baseUrlMasked : '';
  // 已配置时提示凭据已保存，不回显；用户可留空保持原值
  timeoutMs.value = s.timeoutMs;
  autoRefresh.value = s.autoRefresh;
  refreshIntervalSec.value = s.refreshIntervalSec;
  initialized.value = true;
}

// settings 查询完成后初始化一次（后续刷新不覆盖用户输入）
watch(
  () => settings.value,
  (s) => {
    if (s && !initialized.value) initForm();
  },
  { immediate: true },
);

/* ---------- 保存 ---------- */
async function submit(): Promise<void> {
  if (saveMutation.isPending.value) return; // 防重复提交
  formError.value = null;
  formSuccess.value = null;
  try {
    await saveMutation.mutateAsync({
      baseUrl: baseUrl.value.trim() || undefined,
      // 空串 = 不修改（后端约定）
      apiToken: apiToken.value || undefined,
      timeoutMs: timeoutMs.value,
      autoRefresh: autoRefresh.value,
      refreshIntervalSec: refreshIntervalSec.value,
    });
    apiToken.value = '';
    formSuccess.value = '设置已保存';
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '保存失败';
  }
}

/* ---------- 连接测试（防重复提交） ---------- */
const testResult = ref<{ ok: boolean; message: string } | null>(null);

async function runTest(): Promise<void> {
  formError.value = null;
  testResult.value = null;
  try {
    const result = await testMutation.mutateAsync();
    testResult.value = {
      ok: result.ok,
      message: `连接成功 · 版本 ${result.version} · ${result.latencyMs} ms`,
    };
  } catch (err) {
    testResult.value = {
      ok: false,
      message: err instanceof Error ? err.message : '连接测试失败',
    };
  }
}

/* ---------- 危险操作：清除配置 ---------- */
async function clearAll(): Promise<void> {
  const ok = await confirm({
    title: '清除 Sub2API 连接配置',
    message:
      '将删除 Base URL 与管理端凭据（仅保存在本机 Redis），所有子页面将显示「未配置」。确定继续吗？',
    confirmText: '清除',
    tone: 'danger',
  });
  if (!ok) return;
  try {
    await clearMutation.mutateAsync();
    formSuccess.value = '配置已清除';
    formError.value = null;
    baseUrl.value = '';
    apiToken.value = '';
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '清除失败';
  }
}
</script>

<template>
  <section class="sub2api-panel">
    <ErrorBanner
      v-if="settingsQuery.isError"
      :error="settingsQuery.error"
      @retry="settingsQuery.refetch"
    />

    <!-- 连接状态 -->
    <div class="sub2api-setting-block">
      <h3 class="sub2api-section-title">连接状态</h3>
      <div class="flex items-center gap-3">
        <span
          class="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium"
          :class="
            settings?.configured
              ? 'bg-emerald-500/10 text-emerald-700'
              : 'bg-amber-500/10 text-amber-700'
          "
        >
          <span
            class="size-1.5 rounded-full"
            :class="settings?.configured ? 'bg-emerald-500' : 'bg-amber-500'"
            aria-hidden="true"
          />
          {{ settings?.configured ? '已配置' : '未配置' }}
        </span>
        <span v-if="settings?.upstreamVersion" class="text-surface-800/60 text-[11px]">
          上游版本：{{ settings.upstreamVersion }}
        </span>
        <span v-if="!settings?.configured" class="text-surface-800/50 text-[11px]">
          请先填写 Base URL 与管理端凭据
        </span>
      </div>
    </div>

    <form class="sub2api-setting-block" @submit.prevent="submit">
      <h3 class="sub2api-section-title">连接设置</h3>
      <label class="sub2api-field">
        <span>Base URL</span>
        <input
          v-model="baseUrl"
          type="url"
          class="sub2api-input w-full"
          placeholder="https://sub2api.example.com"
          required
        />
        <small class="sub2api-hint"
          >仅支持 http/https，不允许携带路径穿越、用户信息、query 或 hash</small
        >
      </label>
      <label class="sub2api-field">
        <span>管理端凭据（Bearer Token）</span>
        <input
          v-model="apiToken"
          type="password"
          class="sub2api-input w-full"
          autocomplete="off"
          :placeholder="settings?.configured ? '已保存（留空保持不变）' : 'sk-…'"
        />
        <small class="sub2api-hint">凭据仅保存在 Personal OS 后端（Redis），不会回显到浏览器</small>
      </label>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label class="sub2api-field">
          <span>请求超时（ms）</span>
          <input
            v-model.number="timeoutMs"
            type="number"
            min="1000"
            max="60000"
            step="1000"
            class="sub2api-input w-full"
          />
        </label>
        <label class="sub2api-field">
          <span>自动刷新</span>
          <select v-model="autoRefresh" class="sub2api-input w-full">
            <option :value="false">关闭</option>
            <option :value="true">开启</option>
          </select>
        </label>
        <label class="sub2api-field">
          <span>刷新间隔（秒）</span>
          <input
            v-model.number="refreshIntervalSec"
            type="number"
            min="10"
            max="3600"
            class="sub2api-input w-full"
          />
        </label>
      </div>

      <p v-if="formError" class="sub2api-error-text">{{ formError }}</p>
      <p v-if="formSuccess" class="sub2api-success-text">{{ formSuccess }}</p>

      <div class="flex items-center gap-2">
        <button
          type="submit"
          class="sub2api-btn sub2api-btn--primary"
          :disabled="saveMutation.isPending.value"
        >
          {{ saveMutation.isPending.value ? '保存中…' : '保存设置' }}
        </button>
        <button
          type="button"
          class="sub2api-btn"
          :disabled="testMutation.isPending.value || !settings?.configured"
          @click="runTest"
        >
          <Plug class="size-3.5" aria-hidden="true" />
          {{ testMutation.isPending.value ? '测试中…' : '测试连接' }}
        </button>
      </div>
      <p
        v-if="testResult"
        class="mt-2 text-[11px] leading-5"
        :class="testResult.ok ? 'text-emerald-700' : 'text-red-700'"
      >
        {{ testResult.message }}
      </p>
    </form>

    <!-- 危险操作 -->
    <div class="sub2api-setting-block">
      <h3 class="sub2api-section-title sub2api-section-title--danger">
        <AlertTriangle class="size-4" aria-hidden="true" />
        危险操作
      </h3>
      <div class="flex items-center justify-between gap-3">
        <p class="text-surface-800/60 text-[11px] leading-5">
          清除 Base URL 与管理端凭据。此操作仅影响本机配置，不影响 Sub2API 服务端数据。
        </p>
        <button
          type="button"
          class="sub2api-btn sub2api-btn--danger shrink-0"
          :disabled="clearMutation.isPending.value || !settings?.configured"
          @click="clearAll"
        >
          <Trash2 class="size-3.5" aria-hidden="true" />
          {{ clearMutation.isPending.value ? '清除中…' : '清除配置' }}
        </button>
      </div>
    </div>
  </section>
</template>
