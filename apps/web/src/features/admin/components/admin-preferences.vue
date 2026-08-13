<script setup lang="ts">
/**
 * Admin 个人偏好
 *
 * - 个人资料：显示名称 / 头像 URL（校验 + 安全预览 + 加载失败回退）/ 简介 / 时区 / 语言
 * - 外观与交互：主题（浅色/深色/跟随系统）、密度、减少动效、默认页面、时间格式
 * - 主题切换即时应用既有 theme store（不闪烁）；保存按钮显式持久化偏好
 */
import { computed, ref, watch } from 'vue';
import { CircleUserRound, Save } from '@lucide/vue';
import { useThemeStore } from '@/stores/theme';
import { isValidAvatarUrl } from '../storage';
import { useAdminStore } from '../store';
import { useAdminToasts } from '../toast';
import type { AdminThemeMode } from '../types';

const adminStore = useAdminStore();
const themeStore = useThemeStore();
const { push } = useAdminToasts();

const dirty = ref(false);

watch(
  () => adminStore.prefs,
  () => {
    dirty.value = true;
  },
  { deep: true },
);

/* ---------- 头像 ---------- */

const avatarError = ref(false);
const avatarValid = computed(() => isValidAvatarUrl(adminStore.prefs.profile.avatarUrl));

watch(avatarValid, () => {
  avatarError.value = false;
});

/* ---------- 主题 ---------- */

const THEME_OPTIONS: { value: AdminThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

function onThemeChange(mode: AdminThemeMode): void {
  adminStore.prefs.appearance.themeMode = mode;
  adminStore.prefs.appearance.themeModeInitialized = true;
  adminStore.applyThemeMode(mode);
}

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: '舒适' },
  { value: 'compact', label: '紧凑' },
] as const;

const PAGE_OPTIONS = [
  { value: 'dashboard', label: '首页' },
  { value: 'chat', label: 'Chat' },
  { value: 'workflows', label: '工作流' },
  { value: 'projects', label: '开发中' },
  { value: 'achievements', label: '已完成' },
] as const;

const TIMEZONE_OPTIONS = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
] as const;

function save(): void {
  const ok = adminStore.savePrefs();
  if (ok) {
    dirty.value = false;
    push('个人偏好已保存', 'success');
  } else {
    push('保存失败：本地存储不可用或已满，修改仅保留在本次会话', 'error');
  }
}
</script>

<template>
  <div class="space-y-4">
    <header>
      <h1 class="text-surface-900 text-lg font-semibold">个人偏好</h1>
      <p class="text-surface-800/70 mt-1 text-sm">
        资料与外观偏好仅保存在本机浏览器；不上传图片、不保存二进制。
      </p>
    </header>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- 个人资料 -->
      <section class="border-surface-100 bg-surface-0 rounded-xl border p-4" aria-label="个人资料">
        <h2 class="text-surface-900 mb-3 flex items-center gap-2 text-sm font-semibold">
          <CircleUserRound class="size-4" aria-hidden="true" />
          个人资料
        </h2>

        <div class="space-y-3">
          <div class="flex items-start gap-3">
            <!-- 头像预览：合法 URL 才渲染；加载失败回退占位 -->
            <div
              class="border-surface-100 bg-surface-50 flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border"
              aria-hidden="true"
            >
              <img
                v-if="avatarValid && adminStore.prefs.profile.avatarUrl && !avatarError"
                :src="adminStore.prefs.profile.avatarUrl"
                alt=""
                class="size-full object-cover"
                @error="avatarError = true"
              />
              <CircleUserRound v-else class="text-surface-800/40 size-7" />
            </div>
            <div class="min-w-0 flex-1">
              <label for="admin-avatar" class="text-surface-900 mb-1 block text-sm">头像 URL</label>
              <input
                id="admin-avatar"
                v-model="adminStore.prefs.profile.avatarUrl"
                type="url"
                class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 w-full rounded-lg border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
                placeholder="https://example.com/avatar.png"
                :aria-invalid="!avatarValid && adminStore.prefs.profile.avatarUrl.length > 0"
              />
              <p
                v-if="!avatarValid && adminStore.prefs.profile.avatarUrl.length > 0"
                class="mt-1 text-xs text-rose-600"
                role="alert"
              >
                头像地址必须是合法的 http(s) URL
              </p>
              <p v-else class="text-surface-800/50 mt-1 text-xs">仅保存 URL，不上传图片文件</p>
            </div>
          </div>

          <div>
            <label for="admin-name" class="text-surface-900 mb-1 block text-sm">显示名称</label>
            <input
              id="admin-name"
              v-model="adminStore.prefs.profile.displayName"
              type="text"
              maxlength="60"
              class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 w-full rounded-lg border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
              placeholder="未设置"
            />
          </div>

          <div>
            <label for="admin-bio" class="text-surface-900 mb-1 block text-sm">个人简介</label>
            <textarea
              id="admin-bio"
              v-model="adminStore.prefs.profile.bio"
              rows="2"
              maxlength="500"
              class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 w-full resize-none rounded-lg border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
              placeholder="一句话介绍自己"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="admin-tz" class="text-surface-900 mb-1 block text-sm">时区</label>
              <select
                id="admin-tz"
                v-model="adminStore.prefs.profile.timezone"
                class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 w-full rounded-lg border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                <option v-for="tz in TIMEZONE_OPTIONS" :key="tz" :value="tz">{{ tz }}</option>
              </select>
            </div>
            <div>
              <label for="admin-lang" class="text-surface-900 mb-1 block text-sm">界面语言</label>
              <input
                id="admin-lang"
                v-model="adminStore.prefs.profile.language"
                type="text"
                maxlength="20"
                class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 w-full rounded-lg border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- 外观与交互 -->
      <section
        class="border-surface-100 bg-surface-0 rounded-xl border p-4"
        aria-label="外观与交互"
      >
        <h2 class="text-surface-900 mb-3 text-sm font-semibold">外观与交互</h2>

        <div class="space-y-4">
          <fieldset>
            <legend class="text-surface-900 mb-1.5 text-sm">主题</legend>
            <div class="flex gap-2" role="radiogroup" aria-label="主题">
              <button
                v-for="opt in THEME_OPTIONS"
                :key="opt.value"
                type="button"
                role="radio"
                :aria-checked="adminStore.prefs.appearance.themeMode === opt.value"
                class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :class="
                  adminStore.prefs.appearance.themeMode === opt.value
                    ? 'bg-surface-100 text-surface-900 font-medium'
                    : ''
                "
                @click="onThemeChange(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
            <p class="text-surface-800/50 mt-1 text-xs">
              当前应用主题：{{ themeStore.palette.dark ? '深色' : '浅色' }}（跟随系统时随系统变化）
            </p>
          </fieldset>

          <fieldset>
            <legend class="text-surface-900 mb-1.5 text-sm">界面密度</legend>
            <div class="flex gap-2" role="radiogroup" aria-label="界面密度">
              <button
                v-for="opt in DENSITY_OPTIONS"
                :key="opt.value"
                type="button"
                role="radio"
                :aria-checked="adminStore.prefs.appearance.density === opt.value"
                class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                :class="
                  adminStore.prefs.appearance.density === opt.value
                    ? 'bg-surface-100 text-surface-900 font-medium'
                    : ''
                "
                @click="adminStore.prefs.appearance.density = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </fieldset>

          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-surface-900 text-sm">减少动效</p>
              <p class="text-surface-800/50 text-xs">关闭页面过渡与装饰动画</p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="adminStore.prefs.appearance.reduceMotion"
              class="focus-visible:ring-brand-500/40 relative h-6 w-11 rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
              :class="adminStore.prefs.appearance.reduceMotion ? 'bg-brand-600' : 'bg-surface-100'"
              :aria-label="
                adminStore.prefs.appearance.reduceMotion ? '关闭减少动效' : '开启减少动效'
              "
              @click="
                adminStore.prefs.appearance.reduceMotion = !adminStore.prefs.appearance.reduceMotion
              "
            >
              <span
                class="bg-surface-0 absolute top-0.5 size-5 rounded-full shadow transition-all"
                :class="adminStore.prefs.appearance.reduceMotion ? 'left-[22px]' : 'left-0.5'"
                aria-hidden="true"
              />
            </button>
          </div>

          <div>
            <label for="admin-default-page" class="text-surface-900 mb-1 block text-sm"
              >默认进入页面</label
            >
            <select
              id="admin-default-page"
              v-model="adminStore.prefs.appearance.defaultPage"
              class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 w-full rounded-lg border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <option v-for="opt in PAGE_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div class="flex flex-wrap gap-4">
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <input
                v-model="adminStore.prefs.appearance.use24Hour"
                type="checkbox"
                class="focus-visible:ring-brand-500/40 size-4 rounded focus-visible:ring-2 focus-visible:outline-none"
              />
              24 小时制
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <input
                v-model="adminStore.prefs.appearance.relativeTime"
                type="checkbox"
                class="focus-visible:ring-brand-500/40 size-4 rounded focus-visible:ring-2 focus-visible:outline-none"
              />
              相对时间显示
            </label>
          </div>
        </div>
      </section>
    </div>

    <!-- 保存栏 -->
    <footer class="flex items-center justify-end gap-3">
      <span v-if="dirty" class="text-surface-800/60 text-sm" role="status">有未保存的修改</span>
      <button
        type="button"
        class="bg-brand-600 text-surface-0 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        @click="save"
      >
        <Save class="size-4" aria-hidden="true" />
        保存偏好
      </button>
    </footer>
  </div>
</template>
