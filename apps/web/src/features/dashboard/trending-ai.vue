<script setup lang="ts">
import { TrendingUp, Star, ExternalLink } from '@lucide/vue';

/**
 * GitHub 每周 Star 增长 Top 10 AI 项目
 * 数据来源：AI 于 2026-08-12 搜索抓取 github.com/trending?since=weekly
 * （真实快照，按"本周新增 Star"排序）
 */
interface TrendingRepo {
  repo: string;
  desc: string;
  lang: string;
  total: number;
  week: number;
}

const SNAPSHOT_DATE = '2026-08-12';

const topRepos: TrendingRepo[] = [
  {
    repo: 'TencentCloud/TencentDB-Agent-Memory',
    desc: 'TencentDB Agent Memory — AI Agent 团队级记忆中心：对话/文档/代码转四个可复用记忆资产',
    lang: 'TypeScript',
    total: 19900,
    week: 7017,
  },
  {
    repo: 'cloudflare/computer',
    desc: 'Give your agent a computer 👾 给 Agent 一台电脑（Cloudflare 出品）',
    lang: 'TypeScript',
    total: 7600,
    week: 6775,
  },
  {
    repo: 'zhaoxuya520/reverse-skill',
    desc: '逆向/渗透/安全研究技能路由包，AI 自动路由 + 自举工具链，支持 Claude Code / Cursor / Cline',
    lang: 'PowerShell',
    total: 23968,
    week: 6730,
  },
  {
    repo: 'firecrawl/pdf-inspector',
    desc: '快速 Rust PDF 检查/分类/文本提取库，智能识别扫描件 vs 文本 PDF',
    lang: 'Rust',
    total: 14717,
    week: 5367,
  },
  {
    repo: 'virgiliojr94/book-to-skill',
    desc: '把任意技术书 PDF 转成 Claude Code Skill，边工作边学习查阅',
    lang: 'Python',
    total: 20518,
    week: 4155,
  },
  {
    repo: 'esengine/DeepSeek-Reasonix',
    desc: 'DeepSeek 原生终端 AI 编码 Agent，围绕 prefix-cache 稳定性设计',
    lang: 'Go',
    total: 33974,
    week: 3517,
  },
  {
    repo: 'Comfy-Org/ComfyUI',
    desc: '最强大模块化 Diffusion 模型 GUI / API / 后端，图节点接口',
    lang: 'Python',
    total: 126831,
    week: 3252,
  },
  {
    repo: 'lyogavin/airllm',
    desc: 'AirLLM：单张 4GB GPU 跑 70B 模型推理',
    lang: 'Jupyter',
    total: 30776,
    week: 2798,
  },
  {
    repo: 'semantica-agi/semantica',
    desc: 'Graph-Native 基础设施，为 Context 与可问责 AI 系统而生',
    lang: 'Python',
    total: 4914,
    week: 2712,
  },
  {
    repo: 'huangruiteng/loopx',
    desc: '轻量 loop 工程状态内核，长跑 AI Agent 团队跨 Codex/Claude Code 通用',
    lang: 'Python',
    total: 4174,
    week: 2687,
  },
];

const rankColors = [
  'bg-amber-500 text-white', // 1
  'bg-slate-400 text-white', // 2
  'bg-orange-400 text-white', // 3
  'bg-surface-800/50 text-surface-900', // 4+
];

function rankClass(index: number) {
  return rankColors[index] ?? rankColors[3];
}

function formatStars(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
</script>

<template>
  <section class="border-surface-100 bg-surface-0 flex flex-col rounded-lg border p-5">
    <!-- 头部 -->
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 flex items-center gap-1.5 text-sm font-semibold">
        <TrendingUp class="text-brand-600 size-4" />
        GitHub 本周趋势
      </h2>
      <span
        class="bg-brand-500/10 text-brand-600 rounded-full px-2 py-0.5 text-[10px] font-medium"
        title="数据由 AI 于 2026-08-12 搜索抓取 github.com/trending?since=weekly"
      >
        AI 搜索 · {{ SNAPSHOT_DATE }}
      </span>
    </div>

    <!-- Top 10 列表 -->
    <ol class="flex-1 space-y-1">
      <li v-for="(repo, index) in topRepos" :key="repo.repo">
        <a
          :href="`https://github.com/${repo.repo}`"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:bg-surface-50 group flex items-center gap-2 rounded-md px-1.5 py-[5px] transition"
          :title="`${repo.desc}\n总 Star: ${repo.total.toLocaleString()}`"
        >
          <!-- 排名 -->
          <span
            class="flex size-4.5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
            :class="rankClass(index)"
          >
            {{ index + 1 }}
          </span>

          <!-- 仓库信息 -->
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1">
              <span
                v-if="repo.lang"
                class="size-2 shrink-0 rounded-full"
                :style="{ backgroundColor: 'var(--color-brand-500)' }"
              />
              <span class="text-surface-900 truncate text-xs font-medium">{{ repo.repo }}</span>
              <ExternalLink
                class="text-surface-800/30 group-hover:text-surface-800/70 size-3 shrink-0 opacity-0 transition group-hover:opacity-100"
              />
            </span>
            <span class="text-surface-800/50 block truncate text-[10px]">{{ repo.desc }}</span>
          </span>

          <!-- 本周 star -->
          <span class="shrink-0 text-right">
            <span
              class="flex items-center justify-end gap-0.5 text-xs font-semibold text-green-600 tabular-nums"
            >
              <Star class="size-3 fill-current" />
              +{{ formatStars(repo.week) }}
            </span>
            <span class="text-surface-800/40 block text-[10px] tabular-nums">
              {{ formatStars(repo.total) }} ★
            </span>
          </span>
        </a>
      </li>
    </ol>

    <!-- 底部 -->
    <a
      href="https://github.com/trending?since=weekly"
      target="_blank"
      rel="noopener noreferrer"
      class="text-brand-600 hover:text-brand-700 border-surface-100 mt-3 flex items-center justify-center gap-1 border-t pt-2.5 text-xs font-medium transition"
    >
      在 GitHub 查看完整趋势
      <ExternalLink class="size-3" />
    </a>
  </section>
</template>
