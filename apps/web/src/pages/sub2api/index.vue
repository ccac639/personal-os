<script setup lang="ts">
/**
 * Sub2API 控制台（/sub2api）
 *
 * - 单页 + tab 导航（?tab=overview|channels|routes|keys|logs|settings），
 *   刷新 / 直达均保持当前 tab；
 * - 所有数据经 Personal OS API 代理（Web → Personal OS API → Sub2API），
 *   前端不持有 Sub2API 管理凭据；
 * - 风格：安静紧凑的运维控制台，无 Hero / 渐变 / 卡片嵌套。
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useSub2ApiAllGroups } from '@/features/sub2api/hooks';
import OverviewView from '@/features/sub2api/components/overview-view.vue';
import ChannelsView from '@/features/sub2api/components/channels-view.vue';
import RoutesView from '@/features/sub2api/components/routes-view.vue';
import KeysView from '@/features/sub2api/components/keys-view.vue';
import UsageLogsView from '@/features/sub2api/components/usage-logs-view.vue';
import SettingsView from '@/features/sub2api/components/settings-view.vue';

const route = useRoute();
const router = useRouter();

type Tab = 'overview' | 'channels' | 'routes' | 'keys' | 'logs' | 'settings';

const VALID_TABS: Tab[] = ['overview', 'channels', 'routes', 'keys', 'logs', 'settings'];

const TAB_LABELS: Record<Tab, string> = {
  overview: '概览',
  channels: '渠道',
  routes: '模型与路由',
  keys: 'API 凭据',
  logs: '请求日志',
  settings: '设置',
};

const tab = computed<Tab>(() => {
  const raw = typeof route.query.tab === 'string' ? route.query.tab : '';
  return (VALID_TABS as string[]).includes(raw) ? (raw as Tab) : 'overview';
});

function setTab(next: Tab): void {
  if (next === tab.value) return;
  void router.replace({ path: '/sub2api', query: next === 'overview' ? {} : { tab: next } });
}

// 页面级共享查询：分组全量（凭据创建表单下拉）
const allGroupsQuery = useSub2ApiAllGroups();

const groupOptions = computed(() =>
  (allGroupsQuery.data.value ?? []).map((g) => ({ id: g.id, name: g.name })),
);
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6">
    <header class="mb-4">
      <h1 class="text-lg font-semibold tracking-tight">Sub2API 控制台</h1>
      <p class="text-surface-800/50 mt-0.5 text-[12px]">
        连接与管理 Sub2API 服务 · 数据经 Personal OS API 代理
      </p>
    </header>

    <!-- tab 导航 -->
    <nav class="sub2api-tabs" aria-label="Sub2API 功能">
      <button
        v-for="t in VALID_TABS"
        :key="t"
        type="button"
        class="sub2api-tab"
        :class="{ 'sub2api-tab--active': tab === t }"
        :aria-current="tab === t ? 'page' : undefined"
        @click="setTab(t)"
      >
        {{ TAB_LABELS[t] }}
      </button>
    </nav>

    <main class="mt-4">
      <OverviewView v-if="tab === 'overview'" />
      <ChannelsView v-else-if="tab === 'channels'" />
      <RoutesView v-else-if="tab === 'routes'" />
      <KeysView v-else-if="tab === 'keys'" :groups="groupOptions" />
      <UsageLogsView v-else-if="tab === 'logs'" />
      <SettingsView v-else-if="tab === 'settings'" />
    </main>
  </div>
</template>
