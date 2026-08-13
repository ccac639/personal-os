<script setup lang="ts">
/**
 * Admin 自动化与通知偏好
 *
 * - 仅管理前端偏好，不注册真实系统任务 / 定时器
 * - 模拟通知使用应用内面板，不调用浏览器 Notification 权限
 * - 明确文案：真实定时与推送需未来本地服务接入
 */
import { ref } from 'vue';
import { Bell, BellRing, Save } from '@lucide/vue';
import {
  NOTIFICATION_DISCLAIMER,
  NOTIFICATION_KIND_LABELS,
  simulateAllNotifications,
} from '../notifications';
import { useAdminStore } from '../store';
import { useAdminToasts } from '../toast';
import type { SimulatedNotification } from '../types';

const adminStore = useAdminStore();
const { push } = useAdminToasts();

const simulated = ref<SimulatedNotification[]>([]);

function runSimulate(): void {
  simulated.value = simulateAllNotifications(adminStore.prefs.automation);
  if (simulated.value.length === 0) {
    push('当前没有已开启的通知类型，模拟结果为空', 'warning');
  }
}

function save(): void {
  const ok = adminStore.savePrefs();
  push(ok ? '自动化与通知偏好已保存' : '保存失败：本地存储不可用或已满', ok ? 'success' : 'error');
}

function timeInput(id: string, value: string): void {
  const prefs = adminStore.prefs.automation;
  if (id === 'daily') prefs.dailyPlanTime = value;
  else if (id === 'deadline') prefs.deadlineTime = value;
  else prefs.weeklyReviewTime = value;
}

const WORKFLOW_MODES = [
  { value: 'manual', label: '手动确认', description: '工作流运行前需手动确认' },
  { value: 'simulate', label: '本地模拟', description: '工作流以本地模拟方式运行' },
] as const;

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;
</script>

<template>
  <div class="space-y-4">
    <header>
      <h1 class="text-surface-900 text-lg font-semibold">自动化与通知</h1>
      <p class="text-surface-800/70 mt-1 text-sm">
        当前仅管理前端偏好；不注册真实系统任务、定时器或浏览器推送。
      </p>
    </header>

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- 工作流运行模式 -->
      <section
        class="border-surface-100 bg-surface-0 rounded-xl border p-4"
        aria-label="工作流运行模式"
      >
        <h2 class="text-surface-900 mb-3 text-sm font-semibold">默认工作流运行模式</h2>
        <div class="space-y-2" role="radiogroup" aria-label="默认工作流运行模式">
          <label
            v-for="mode in WORKFLOW_MODES"
            :key="mode.value"
            class="border-surface-100 hover:bg-surface-50 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
            :class="
              adminStore.prefs.automation.workflowRunMode === mode.value
                ? 'bg-surface-50 border-brand-500/40'
                : ''
            "
          >
            <input
              v-model="adminStore.prefs.automation.workflowRunMode"
              type="radio"
              name="workflow-mode"
              :value="mode.value"
              class="focus-visible:ring-brand-500/40 mt-0.5 size-4 focus-visible:ring-2 focus-visible:outline-none"
            />
            <span>
              <span class="text-surface-900 block text-sm font-medium">{{ mode.label }}</span>
              <span class="text-surface-800/60 block text-xs">{{ mode.description }}</span>
            </span>
          </label>
        </div>
      </section>

      <!-- 通知开关 -->
      <section
        class="border-surface-100 bg-surface-0 rounded-xl border p-4"
        aria-label="应用内通知偏好"
      >
        <h2 class="text-surface-900 mb-3 text-sm font-semibold">应用内通知</h2>
        <ul class="space-y-2.5">
          <li class="flex items-center justify-between gap-3">
            <div>
              <p class="text-surface-900 text-sm">工作流运行完成</p>
              <p class="text-surface-800/50 text-xs">运行结束时显示应用内提示</p>
            </div>
            <input
              v-model="adminStore.prefs.automation.notifyWorkflowComplete"
              type="checkbox"
              class="focus-visible:ring-brand-500/40 size-4 rounded focus-visible:ring-2 focus-visible:outline-none"
              aria-label="工作流运行完成通知"
            />
          </li>
          <li class="flex items-center justify-between gap-3">
            <div>
              <p class="text-surface-900 text-sm">工作流运行失败</p>
              <p class="text-surface-800/50 text-xs">运行失败时显示应用内提示</p>
            </div>
            <input
              v-model="adminStore.prefs.automation.notifyWorkflowFailed"
              type="checkbox"
              class="focus-visible:ring-brand-500/40 size-4 rounded focus-visible:ring-2 focus-visible:outline-none"
              aria-label="工作流运行失败通知"
            />
          </li>
          <li class="flex items-center justify-between gap-3">
            <div>
              <p class="text-surface-900 text-sm">项目健康预警</p>
              <p class="text-surface-800/50 text-xs">健康分低于阈值时提示</p>
            </div>
            <input
              v-model="adminStore.prefs.automation.notifyHealthWarning"
              type="checkbox"
              class="focus-visible:ring-brand-500/40 size-4 rounded focus-visible:ring-2 focus-visible:outline-none"
              aria-label="项目健康预警通知"
            />
          </li>
        </ul>
      </section>
    </div>

    <!-- 提醒计划 -->
    <section class="border-surface-100 bg-surface-0 rounded-xl border p-4" aria-label="提醒计划">
      <h2 class="text-surface-900 mb-3 text-sm font-semibold">提醒计划</h2>
      <ul class="space-y-3">
        <li class="flex flex-wrap items-center justify-between gap-2">
          <label class="flex items-center gap-2 text-sm">
            <input
              v-model="adminStore.prefs.automation.dailyPlanReminder"
              type="checkbox"
              class="focus-visible:ring-brand-500/40 size-4 rounded focus-visible:ring-2 focus-visible:outline-none"
            />
            今日计划提醒
          </label>
          <input
            type="time"
            :value="adminStore.prefs.automation.dailyPlanTime"
            class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 rounded-lg border px-2.5 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            :disabled="!adminStore.prefs.automation.dailyPlanReminder"
            aria-label="今日计划提醒时间"
            @change="timeInput('daily', ($event.target as HTMLInputElement).value)"
          />
        </li>
        <li class="flex flex-wrap items-center justify-between gap-2">
          <label class="flex items-center gap-2 text-sm">
            <input
              v-model="adminStore.prefs.automation.deadlineReminder"
              type="checkbox"
              class="focus-visible:ring-brand-500/40 size-4 rounded focus-visible:ring-2 focus-visible:outline-none"
            />
            截止日期提醒
          </label>
          <input
            type="time"
            :value="adminStore.prefs.automation.deadlineTime"
            class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 rounded-lg border px-2.5 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            :disabled="!adminStore.prefs.automation.deadlineReminder"
            aria-label="截止日期提醒时间"
            @change="timeInput('deadline', ($event.target as HTMLInputElement).value)"
          />
        </li>
        <li class="flex flex-wrap items-center justify-between gap-2">
          <label class="flex items-center gap-2 text-sm">
            <input
              v-model="adminStore.prefs.automation.weeklyReviewReminder"
              type="checkbox"
              class="focus-visible:ring-brand-500/40 size-4 rounded focus-visible:ring-2 focus-visible:outline-none"
            />
            周复盘提醒
          </label>
          <span class="flex items-center gap-2">
            <select
              v-model.number="adminStore.prefs.automation.weeklyReviewDay"
              class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 rounded-lg border px-2.5 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
              :disabled="!adminStore.prefs.automation.weeklyReviewReminder"
              aria-label="周复盘提醒日"
            >
              <option v-for="(d, i) in WEEKDAYS" :key="i" :value="i">{{ d }}</option>
            </select>
            <input
              type="time"
              :value="adminStore.prefs.automation.weeklyReviewTime"
              class="border-surface-100 bg-surface-0 text-surface-900 focus-visible:ring-brand-500/40 rounded-lg border px-2.5 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
              :disabled="!adminStore.prefs.automation.weeklyReviewReminder"
              aria-label="周复盘提醒时间"
              @change="timeInput('weekly', ($event.target as HTMLInputElement).value)"
            />
          </span>
        </li>
      </ul>
    </section>

    <!-- 模拟通知 -->
    <section class="border-surface-100 bg-surface-0 rounded-xl border p-4" aria-label="模拟通知">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
            <BellRing class="size-4" aria-hidden="true" />
            模拟通知
          </h2>
          <p class="text-surface-800/60 mt-1 text-sm">
            按当前偏好生成应用内模拟通知，不请求浏览器权限。
          </p>
        </div>
        <button
          type="button"
          class="border-surface-100 text-surface-800/80 hover:bg-surface-100 focus-visible:ring-brand-500/40 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          @click="runSimulate"
        >
          <Bell class="size-4" aria-hidden="true" />
          模拟通知
        </button>
      </div>

      <ul v-if="simulated.length > 0" class="mt-3 space-y-2" aria-label="模拟通知列表">
        <li
          v-for="n in simulated"
          :key="n.id"
          class="border-surface-100 bg-surface-50 rounded-lg border p-3"
        >
          <p class="text-surface-900 flex items-center justify-between gap-2 text-sm font-medium">
            <span>{{ n.title }}</span>
            <span class="text-surface-800/50 text-xs">{{ n.time }}</span>
          </p>
          <p class="text-surface-800/70 mt-0.5 text-sm">{{ n.body }}</p>
          <p class="text-surface-800/50 mt-1 text-xs">
            类型：{{ NOTIFICATION_KIND_LABELS[n.kind] }}
          </p>
        </li>
      </ul>
      <p v-else class="text-surface-800/50 mt-3 text-sm">点击「模拟通知」按当前偏好生成预览。</p>

      <p class="text-surface-800/50 mt-3 border-t pt-3 text-xs leading-relaxed">
        {{ NOTIFICATION_DISCLAIMER }}
      </p>
    </section>

    <footer class="flex justify-end">
      <button
        type="button"
        class="bg-brand-600 text-surface-0 hover:bg-brand-700 focus-visible:ring-brand-500/40 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        @click="save"
      >
        <Save class="size-4" aria-hidden="true" />
        保存偏好
      </button>
    </footer>
  </div>
</template>
