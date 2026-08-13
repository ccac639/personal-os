<script setup lang="ts">
/**
 * 管理系统（Admin）—— 个人本地控制台入口
 *
 * - 单页 + 二级导航：?s=overview|preferences|ai-providers|data|automation|diagnostics|danger
 * - 进入时：偏好损坏回退提示；若用户曾在管理系统中选择过主题，则应用主题模式
 *   （跟随系统时监听系统主题变化）
 */
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAdminStore } from '@/features/admin/store';
import { useAdminToasts } from '@/features/admin/toast';
import AdminShell from '@/features/admin/components/admin-shell.vue';
import AdminOverview from '@/features/admin/components/admin-overview.vue';
import AdminPreferences from '@/features/admin/components/admin-preferences.vue';
import AdminAiProviders from '@/features/admin/components/admin-ai-providers.vue';
import AdminData from '@/features/admin/components/admin-data.vue';
import AdminAutomation from '@/features/admin/components/admin-automation.vue';
import AdminDiagnostics from '@/features/admin/components/admin-diagnostics.vue';
import AdminDanger from '@/features/admin/components/admin-danger.vue';
import AdminToasts from '@/features/admin/components/admin-toasts.vue';
import type { AdminSection } from '@/features/admin/types';

const route = useRoute();
const router = useRouter();
const adminStore = useAdminStore();
const { push } = useAdminToasts();

const VALID_SECTIONS: AdminSection[] = [
  'overview',
  'preferences',
  'ai-providers',
  'data',
  'automation',
  'diagnostics',
  'danger',
];

const section = computed<AdminSection>(() => {
  const raw = typeof route.query.s === 'string' ? route.query.s : '';
  return (VALID_SECTIONS as string[]).includes(raw) ? (raw as AdminSection) : 'overview';
});

function setSection(next: AdminSection): void {
  if (next === section.value) return;
  void router.replace({ path: '/admin', query: { s: next } });
}

let stopSystemThemeWatch: () => void = () => undefined;

onMounted(() => {
  if (adminStore.prefsRecovered) {
    push('本地偏好数据已重置为默认值', 'warning');
  }
  // 仅当用户曾在管理系统中显式选择过主题时才应用，避免覆盖既有主题
  if (adminStore.prefs.appearance.themeModeInitialized) {
    adminStore.applyThemeMode(adminStore.prefs.appearance.themeMode);
  }
  stopSystemThemeWatch = adminStore.startSystemThemeWatch();
});

onBeforeUnmount(() => {
  stopSystemThemeWatch();
});

const SECTION_COMPONENTS: Record<AdminSection, unknown> = {
  overview: AdminOverview,
  preferences: AdminPreferences,
  'ai-providers': AdminAiProviders,
  data: AdminData,
  automation: AdminAutomation,
  diagnostics: AdminDiagnostics,
  danger: AdminDanger,
};
</script>

<template>
  <div class="bg-page min-h-full">
    <AdminShell :active="section" @update:active="setSection">
      <component :is="SECTION_COMPONENTS[section]" @navigate="setSection" />
    </AdminShell>
    <AdminToasts />
  </div>
</template>
