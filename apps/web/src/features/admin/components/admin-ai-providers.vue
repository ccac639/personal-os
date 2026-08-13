<script setup lang="ts">
/**
 * Admin AI 配置中心
 *
 * - Provider / 模型目录为本地模拟；连接检查为 deterministic mock，不发起真实网络
 * - API Key 只存在于会话内存态：可输入（掩码）、可清空，刷新即消失
 * - 绝不写入 localStorage / 备份 / 诊断报告 / 日志
 */
import { computed, ref } from 'vue';
import { Eye, EyeOff, KeyRound, PlugZap, Save, Trash2 } from '@lucide/vue';
import { PROVIDER_CAPABILITY_LABELS } from '../providers';
import { useAdminStore } from '../store';
import { useAdminToasts } from '../toast';
import type { ConnectionCheckResult } from '../types';

const adminStore = useAdminStore();
const { push } = useAdminToasts();

/** 每个 Provider 的掩码显示态 */
const showKey = ref<Record<string, boolean>>({});

/** 每个 Provider 的连接检查结果（仅内存） */
const checkResults = ref<Record<string, ConnectionCheckResult>>({});
const checking = ref<Record<string, boolean>>({});

function toggleMask(id: string): void {
  showKey.value = { ...showKey.value, [id]: !showKey.value[id] };
}

function clearKey(id: string): void {
  adminStore.clearApiKey(id);
  const next = { ...showKey.value };
  delete next[id];
  showKey.value = next;
}

function isConfigured(id: string): boolean {
  const p = adminStore.providers.find((x) => x.id === id);
  return Boolean(p?.apiKey?.trim());
}

async function runCheck(id: string): Promise<void> {
  checking.value = { ...checking.value, [id]: true };
  const result = await adminStore.checkConnection(id);
  checkResults.value = { ...checkResults.value, [id]: result };
  checking.value = { ...checking.value, [id]: false };
}

function saveConfigs(): void {
  adminStore.persistProviderConfigs();
  push('Provider 配置已保存（API Key 仅本次会话内存，不落盘）', 'success');
}

const modelsByProvider = computed(() => {
  const map: Record<
    string,
    { id: string; name: string; modes: string[]; context: string; isDefault: boolean }[]
  > = {};
  for (const m of adminStore.models) {
    (map[m.providerId] ??= []).push(m);
  }
  return map;
});

function capabilityLabel(modes: string[]): string {
  if (modes.length === 0) return '—';
  return modes
    .map((m) => PROVIDER_CAPABILITY_LABELS[m as keyof typeof PROVIDER_CAPABILITY_LABELS] ?? m)
    .join(' / ');
}
</script>

<template>
  <div class="space-y-4">
    <header>
      <h1 class="text-surface-900 text-lg font-semibold">AI 配置中心</h1>
      <p class="text-surface-800/70 mt-1 text-sm">
        仅前端配置与未来服务适配边界：不进行真实网络连接。API Key 只在本次会话内存中，
        关闭或刷新后消失，绝不写入本地存储、备份、诊断报告或日志。
      </p>
    </header>

    <!-- Provider 列表 -->
    <section class="border-surface-100 bg-surface-0 rounded-xl border" aria-label="Provider 管理">
      <header class="flex items-center justify-between px-4 py-3">
        <h2 class="text-surface-900 text-sm font-semibold">Provider</h2>
        <span class="text-surface-800/50 text-xs"
          >已启用 {{ adminStore.enabledProviderCount }} / {{ adminStore.providers.length }}</span
        >
      </header>

      <ul class="divide-surface-100 divide-y">
        <li v-for="p in adminStore.providers" :key="p.id" class="space-y-2 px-4 py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                :aria-checked="p.enabled"
                :aria-label="`${p.enabled ? '禁用' : '启用'} ${p.name}`"
                class="focus-visible:ring-brand-500/40 relative h-5 w-9 rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :class="p.enabled ? 'bg-brand-600' : 'bg-surface-100'"
                @click="adminStore.updateProvider(p.id, { enabled: !p.enabled })"
              >
                <span
                  class="bg-surface-0 absolute top-0.5 size-4 rounded-full shadow transition-all"
                  :class="p.enabled ? 'left-[18px]' : 'left-0.5'"
                  aria-hidden="true"
                />
              </button>
              <p class="text-surface-900 text-sm font-medium">{{ p.name }}</p>
              <span
                class="rounded px-1.5 py-0.5 text-xs"
                :class="
                  p.enabled
                    ? 'bg-emerald-500/15 text-emerald-700'
                    : 'bg-surface-100 text-surface-800/60'
                "
              >
                {{ p.enabled ? '启用' : '禁用' }}
              </span>
            </div>
            <p class="text-surface-800/50 text-xs">
              优先级 {{ p.priority }} · 超时 {{ p.timeoutSeconds }}s
            </p>
          </div>

          <div class="grid gap-2 md:grid-cols-2">
            <label class="block">
              <span class="text-surface-800/70 mb-0.5 block text-xs">默认模型</span>
              <select
                :value="p.defaultModel"
                class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 w-full rounded-lg border px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
                @change="
                  adminStore.updateProvider(p.id, {
                    defaultModel: ($event.target as HTMLSelectElement).value,
                  })
                "
              >
                <option v-for="m in modelsByProvider[p.id] ?? []" :key="m.id" :value="m.id">
                  {{ m.name }}{{ m.isDefault ? '（默认）' : '' }}
                </option>
              </select>
            </label>
            <div>
              <span class="text-surface-800/70 mb-0.5 block text-xs">模型能力</span>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="cap in ['chat', 'writing', 'code', 'vision'] as const"
                  :key="cap"
                  type="button"
                  class="focus-visible:ring-brand-500/40 rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  :class="
                    p.capabilities.includes(cap)
                      ? 'bg-brand-600/10 border-brand-500/40 text-brand-700'
                      : 'border-surface-100 text-surface-800/50 hover:bg-surface-100'
                  "
                  :aria-pressed="p.capabilities.includes(cap)"
                  :aria-label="`${p.name} ${PROVIDER_CAPABILITY_LABELS[cap]}能力`"
                  @click="
                    adminStore.updateProvider(p.id, {
                      capabilities: p.capabilities.includes(cap)
                        ? p.capabilities.filter((c) => c !== cap)
                        : [...p.capabilities, cap],
                    })
                  "
                >
                  {{ PROVIDER_CAPABILITY_LABELS[cap] }}
                </button>
              </div>
            </div>
          </div>

          <!-- API Key（内存态） -->
          <div class="flex items-end gap-2">
            <label class="min-w-0 flex-1">
              <span class="text-surface-800/70 mb-0.5 flex items-center gap-1 text-xs">
                <KeyRound class="size-3" aria-hidden="true" />
                API Key（仅本次会话）
              </span>
              <input
                :type="showKey[p.id] ? 'text' : 'password'"
                :value="p.apiKey"
                autocomplete="off"
                spellcheck="false"
                class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 w-full rounded-lg border px-2.5 py-1.5 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
                :placeholder="p.hasKey ? '已配置（会话中）' : '未配置'"
                :aria-label="`${p.name} API Key`"
                @input="adminStore.setApiKey(p.id, ($event.target as HTMLInputElement).value)"
              />
            </label>
            <button
              type="button"
              class="border-surface-100 text-surface-800/70 hover:bg-surface-100 focus-visible:ring-brand-500/40 flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:outline-none"
              :aria-label="showKey[p.id] ? '隐藏 API Key' : '显示 API Key'"
              :title="showKey[p.id] ? '隐藏' : '显示'"
              @click="toggleMask(p.id)"
            >
              <EyeOff v-if="showKey[p.id]" class="size-4" aria-hidden="true" />
              <Eye v-else class="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="border-surface-100 text-surface-800/70 hover:bg-surface-100 focus-visible:ring-brand-500/40 flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-label="清空 API Key"
              title="清空"
              @click="clearKey(p.id)"
            >
              <Trash2 class="size-4" aria-hidden="true" />
            </button>
          </div>
          <p class="text-surface-800/50 text-xs">
            状态：{{
              isConfigured(p.id)
                ? '本次会话已填写，刷新后消失'
                : p.hasKey
                  ? '上次会话配置过（未填写）'
                  : '未配置'
            }}
          </p>

          <!-- 连接检查 -->
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
              :disabled="checking[p.id]"
              @click="runCheck(p.id)"
            >
              <PlugZap class="size-3.5" aria-hidden="true" />
              {{ checking[p.id] ? '检查中…' : '连接检查' }}
            </button>
            <p
              v-if="checkResults[p.id]"
              class="text-xs"
              :class="checkResults[p.id]!.ok ? 'text-emerald-700' : 'text-rose-600'"
              role="status"
            >
              {{ checkResults[p.id]!.ok ? '✓ ' : '✗ ' }}{{ checkResults[p.id]!.message }}
            </p>
          </div>
        </li>
      </ul>

      <footer class="flex items-center justify-between gap-2 border-t px-4 py-3">
        <p class="text-surface-800/50 text-xs">保存配置只记录「是否已配置」，Key 内容不落盘</p>
        <button
          type="button"
          class="bg-brand-600 text-surface-0 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          @click="saveConfigs"
        >
          <Save class="size-4" aria-hidden="true" />
          保存配置
        </button>
      </footer>
    </section>

    <!-- 模型目录 -->
    <section class="border-surface-100 bg-surface-0 rounded-xl border" aria-label="模型目录">
      <header class="px-4 py-3">
        <h2 class="text-surface-900 text-sm font-semibold">模型目录</h2>
        <p class="text-surface-800/50 mt-0.5 text-xs">
          本地模拟目录：名称、支持模式、上下文说明与默认标记
        </p>
      </header>
      <ul class="divide-surface-100 divide-y">
        <li
          v-for="m in adminStore.models"
          :key="m.id"
          class="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <p class="text-surface-900 text-sm font-medium">
              {{ m.name }}
              <span
                v-if="m.isDefault"
                class="bg-brand-600/10 text-brand-700 ml-1 rounded px-1.5 py-0.5 text-xs"
                >默认</span
              >
            </p>
            <p class="text-surface-800/60 text-xs">{{ m.id }} · {{ m.context }}</p>
          </div>
          <p class="text-surface-800/60 shrink-0 text-xs">{{ capabilityLabel(m.modes) }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>
