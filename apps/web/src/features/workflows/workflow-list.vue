<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  ArrowRight,
  CircleCheck,
  CircleX,
  FileText,
  Loader2,
  Play,
  ScrollText,
  Workflow,
  X,
} from '@lucide/vue';
import type { Component } from 'vue';

type WorkflowStatus = 'running' | 'success' | 'failed';

interface WorkflowItem {
  id: string;
  name: string;
  status: WorkflowStatus;
  /** 最近一次运行耗时 */
  duration: string;
  /** 最近一次运行时间描述 */
  startedAt: string;
  /** 运行中条目的进度（0-100） */
  progress: number;
  /** 日志行（格式：LEVEL 消息） */
  steps: string[];
}

const STATUS_META: Record<
  WorkflowStatus,
  { label: string; icon: Component; cls: string; spin?: boolean }
> = {
  running: {
    label: '运行中',
    icon: Loader2,
    cls: 'text-brand-600 bg-brand-500/10',
    spin: true,
  },
  success: { label: '已完成', icon: CircleCheck, cls: 'text-green-600 bg-green-500/10' },
  failed: { label: '失败', icon: CircleX, cls: 'text-red-600 bg-red-500/10' },
};

/** 模拟数据：4 成功 / 2 失败 / 2 运行中 → 成功率 4/6 ≈ 67% */
const items = ref<WorkflowItem[]>([
  {
    id: 'wf-daily-review',
    name: '每日代码审查流水线',
    status: 'running',
    duration: '2m 14s',
    startedAt: '10 分钟前',
    progress: 62,
    steps: [
      'INFO 流水线启动，读取仓库提交记录',
      'INFO 检测到 8 个新提交（main 分支）',
      'RUN  运行静态分析：eslint + typecheck',
      'RUN  代码审查 Agent 审阅 diff',
      'INFO 审查完成 4/8 个提交，剩余进行中',
    ],
  },
  {
    id: 'wf-sync',
    name: '数据同步与清洗',
    status: 'running',
    duration: '4m 02s',
    startedAt: '25 分钟前',
    progress: 34,
    steps: [
      'INFO 连接 MongoDB 副本集',
      'INFO 拉取增量数据 12,480 条',
      'RUN  字段标准化与去重',
      'INFO 处理中：第 2/4 批次',
    ],
  },
  {
    id: 'wf-dep-audit',
    name: '依赖安全审计',
    status: 'success',
    duration: '48s',
    startedAt: '1 小时前',
    progress: 100,
    steps: [
      'INFO 扫描 3 个 workspace 包的依赖树',
      'RUN  npm audit + pip-audit 交叉比对',
      'INFO 发现 2 个中危漏洞（PNPM 锁定文件）',
      'SUCCESS 审计完成，报告已归档',
    ],
  },
  {
    id: 'wf-blog-publish',
    name: '博客自动发布',
    status: 'success',
    duration: '12s',
    startedAt: '3 小时前',
    progress: 100,
    steps: ['INFO 检出待发布草稿 1 篇', 'RUN  生成 RSS 与 Sitemap', 'SUCCESS 已发布至生产环境'],
  },
  {
    id: 'wf-morning-digest',
    name: '晨间摘要生成',
    status: 'success',
    duration: '9s',
    startedAt: '今天 08:00',
    progress: 100,
    steps: ['INFO 聚合 GitHub 动态与待办', 'RUN  AI 生成晨间简报', 'SUCCESS 推送至通知渠道'],
  },
  {
    id: 'wf-weekly-report',
    name: '周报汇总',
    status: 'success',
    duration: '1m 05s',
    startedAt: '昨天 18:30',
    progress: 100,
    steps: ['INFO 收集本周 commit 与任务记录', 'RUN  生成周报 Markdown', 'SUCCESS 已存入成果库'],
  },
  {
    id: 'wf-finetune',
    name: '模型微调任务',
    status: 'failed',
    duration: '3m 22s',
    startedAt: '2 小时前',
    progress: 100,
    steps: [
      'INFO 加载训练数据集',
      'RUN  训练步骤 1/5',
      'ERROR 显存不足（OOM），任务中断',
      'INFO 已保存检查点，可断点续训',
    ],
  },
  {
    id: 'wf-transcode',
    name: '视频转码流水线',
    status: 'failed',
    duration: '5m 47s',
    startedAt: '昨天 22:00',
    progress: 100,
    steps: [
      'INFO 读取源文件 video-0412.mp4',
      'RUN  转码 H.264 1080p',
      'ERROR 输入文件校验失败（CRC 不匹配）',
    ],
  },
]);

const SORT_ORDER: Record<WorkflowStatus, number> = { running: 0, success: 1, failed: 2 };

/** 排序：运行中 > 已完成 > 失败 */
const sortedItems = computed(() =>
  [...items.value].sort((a, b) => SORT_ORDER[a.status] - SORT_ORDER[b.status]),
);

const runningCount = computed(() => items.value.filter((i) => i.status === 'running').length);

/** 成功率 = 成功数 / 已结束数（运行中不计入） */
const successRate = computed(() => {
  const done = items.value.filter((i) => i.status !== 'running');
  if (done.length === 0) return 0;
  return Math.round((done.filter((i) => i.status === 'success').length / done.length) * 100);
});

/** 环形进度：SVG stroke-dashoffset */
const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;
const ringOffset = computed(() => RING_C * (1 - successRate.value / 100));

/* ---------- 交互：立即运行 ---------- */
const timers = new Set<ReturnType<typeof setInterval>>();

function runWorkflow(id: string) {
  const item = items.value.find((i) => i.id === id);
  if (!item || item.status === 'running') return;
  item.status = 'running';
  item.progress = 0;
  item.duration = '0s';
  item.startedAt = '刚刚';
  const timer = setInterval(() => {
    item.progress += Math.random() * 16 + 6;
    if (item.progress >= 100) {
      item.progress = 100;
      clearInterval(timer);
      timers.delete(timer);
      item.status = 'success';
      item.duration = `${Math.floor(Math.random() * 30) + 8}s`;
      item.startedAt = '刚刚';
      item.steps.push('SUCCESS 本次运行完成');
    }
  }, 320);
  timers.add(timer);
}

onBeforeUnmount(() => {
  timers.forEach((t) => clearInterval(t));
  timers.clear();
});

/* ---------- 交互：查看日志 ---------- */
const logTarget = ref<WorkflowItem | null>(null);
const openLog = (item: WorkflowItem) => {
  logTarget.value = item;
};
const closeLog = () => {
  logTarget.value = null;
};

const emit = defineEmits<{ openCanvas: [] }>();

/** 日志行着色：按前缀级别 */
function lineCls(line: string): string {
  if (line.startsWith('ERROR')) return 'text-red-600';
  if (line.startsWith('SUCCESS')) return 'text-green-600';
  if (line.startsWith('RUN')) return 'text-brand-600';
  return 'text-surface-800/60';
}
</script>

<template>
  <div class="space-y-4">
    <!-- 顶部标题区：左标题 + 右环形成功率 -->
    <header
      class="border-surface-100/70 bg-surface-0/70 shadow-card flex items-center justify-between rounded-xl border px-5 py-4 backdrop-blur-xl"
    >
      <div class="flex items-center gap-3">
        <span
          class="bg-brand-500/10 text-brand-600 flex size-10 items-center justify-center rounded-lg"
        >
          <Workflow class="size-5" />
        </span>
        <div>
          <h1 class="text-surface-900 text-lg leading-tight font-semibold">工作流</h1>
          <p class="text-surface-800/50 mt-0.5 text-xs">
            运行中 {{ runningCount }} · 共 {{ items.length }} 条
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2.5">
        <div class="relative size-12">
          <svg class="size-12 -rotate-90" viewBox="0 0 48 48">
            <circle
              cx="24"
              cy="24"
              :r="RING_R"
              fill="none"
              stroke="var(--color-surface-100)"
              stroke-width="4"
            />
            <circle
              cx="24"
              cy="24"
              :r="RING_R"
              fill="none"
              stroke="var(--color-brand-500)"
              stroke-width="4"
              stroke-linecap="round"
              :stroke-dasharray="RING_C"
              :stroke-dashoffset="ringOffset"
              class="transition-[stroke-dashoffset] duration-500"
            />
          </svg>
          <span
            class="text-surface-900 absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums"
          >
            {{ successRate }}%
          </span>
        </div>
        <span class="text-surface-800/50 text-xs">成功率</span>
      </div>
    </header>

    <!-- 工作流列表 -->
    <section
      class="border-surface-100/70 bg-surface-0/70 shadow-card rounded-xl border backdrop-blur-xl"
    >
      <div class="border-surface-100/70 flex items-center justify-between border-b px-5 py-3">
        <h2 class="text-surface-900 text-sm font-semibold">全部工作流</h2>
        <button
          type="button"
          class="hover:bg-brand-500/10 hover:text-brand-600 text-surface-800/60 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition"
          @click="emit('openCanvas')"
        >
          编排画布
          <ArrowRight class="size-3.5" />
        </button>
      </div>

      <ul class="space-y-1 p-3">
        <li
          v-for="item in sortedItems"
          :key="item.id"
          class="group hover:border-surface-100 hover:bg-surface-50/70 flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-all duration-200 hover:-translate-y-px"
        >
          <!-- 左侧状态图标 -->
          <span
            class="flex size-8 shrink-0 items-center justify-center rounded-lg"
            :class="STATUS_META[item.status].cls"
          >
            <component
              :is="STATUS_META[item.status].icon"
              class="size-4"
              :class="{ 'animate-spin': STATUS_META[item.status].spin }"
            />
          </span>

          <!-- 中间：名称 + 状态标签 + 耗时与时间（运行中附加进度条） -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="text-surface-900 truncate text-sm font-medium">{{ item.name }}</p>
              <span
                class="rounded-full px-2 py-0.5 text-[10px] leading-none font-medium"
                :class="[
                  item.status === 'running'
                    ? 'bg-brand-500/10 text-brand-600'
                    : item.status === 'success'
                      ? 'bg-green-500/10 text-green-600'
                      : 'bg-red-500/10 text-red-600',
                ]"
              >
                {{ STATUS_META[item.status].label }}
              </span>
            </div>
            <p class="text-surface-800/50 mt-0.5 text-xs">
              耗时 {{ item.duration }} · {{ item.startedAt }}
            </p>
            <div v-if="item.status === 'running'" class="mt-1.5 flex items-center gap-2">
              <div class="bg-surface-100/80 h-0.5 flex-1 overflow-hidden rounded-full">
                <div
                  class="bg-brand-500 h-full rounded-full transition-[width] duration-300"
                  :style="{ width: `${Math.min(Math.floor(item.progress), 100)}%` }"
                />
              </div>
              <span class="text-surface-800/50 w-8 text-right text-[10px] tabular-nums">
                {{ Math.min(Math.floor(item.progress), 100) }}%
              </span>
            </div>
          </div>

          <!-- 右侧 hover 操作：立即运行 / 查看日志 -->
          <div
            class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          >
            <button
              type="button"
              title="立即运行"
              class="hover:bg-brand-500/10 hover:text-brand-600 text-surface-800/50 rounded-md p-1.5 transition"
              @click="runWorkflow(item.id)"
            >
              <Play class="size-3.5" />
            </button>
            <button
              type="button"
              title="查看日志"
              class="hover:bg-brand-500/10 hover:text-brand-600 text-surface-800/50 rounded-md p-1.5 transition"
              @click="openLog(item)"
            >
              <FileText class="size-3.5" />
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- 日志面板 -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-if="logTarget"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
          @click.self="closeLog"
        >
          <div
            class="border-surface-100/70 bg-surface-0/90 shadow-float w-full max-w-md rounded-xl border p-5 backdrop-blur-xl"
          >
            <div class="mb-3 flex items-center justify-between">
              <div class="flex min-w-0 items-center gap-2">
                <ScrollText class="text-brand-600 size-4 shrink-0" />
                <h3 class="text-surface-900 truncate text-sm font-semibold">
                  {{ logTarget.name }}
                </h3>
              </div>
              <button
                type="button"
                class="hover:bg-surface-50 text-surface-800/50 hover:text-surface-900 rounded-md p-1 transition"
                @click="closeLog"
              >
                <X class="size-4" />
              </button>
            </div>

            <div
              class="bg-surface-50 border-surface-100/70 max-h-64 space-y-1 overflow-y-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed"
            >
              <p v-for="(line, i) in logTarget.steps" :key="i" :class="lineCls(line)">
                {{ line }}
              </p>
            </div>

            <p class="text-surface-800/50 mt-2.5 text-[10px]">
              耗时 {{ logTarget.duration }} · {{ logTarget.startedAt }}
            </p>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
