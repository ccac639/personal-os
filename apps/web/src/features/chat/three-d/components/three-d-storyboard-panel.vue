<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台分镜板（镜头与分镜预制作）
 *
 * 镜头（Shot）列表：从当前相机保存、一键应用、排序（上移/下移）、复制、
 * 删除、收藏、状态标记、关联区域、说明；以 CSS 卡片展示分镜顺序与构图摘要
 * （不生成图片缩略图）；支持导出分镜 Markdown / JSON。
 */
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Clapperboard,
  Copy,
  FileCode2,
  FileDown,
  Star,
  Trash2,
  X,
} from '@lucide/vue';
import { computed, ref } from 'vue';

import { SHOT_STATUS_OPTIONS } from '../constants';
import { useThreeDWorkspaceStore } from '../store';
import type { ThreeDShot } from '../types';

const store = useThreeDWorkspaceStore();

const shotName = ref('');
const shots = computed(() => store.activeProject?.shots ?? []);
const regions = computed(() => store.activeProject?.regions ?? []);

function regionName(id: string | null): string {
  if (!id) return '';
  return regions.value.find((r) => r.id === id)?.name ?? '';
}

function saveShot() {
  store.saveShotFromCamera(shotName.value);
  shotName.value = '';
}

function moveShot(id: string, dir: -1 | 1) {
  const list = shots.value;
  const idx = list.findIndex((s) => s.id === id);
  const target = idx + dir;
  if (idx < 0 || target < 0 || target >= list.length) return;
  const next = [...list];
  const [item] = next.splice(idx, 1);
  next.splice(target, 0, item!);
  store.reorderShotsAction(next.map((s) => s.id));
}

function composition(s: ThreeDShot): string {
  return `位置 ${s.position.map((n) => Number(n.toFixed(2))).join(', ')} → 目标 ${s.target
    .map((n) => Number(n.toFixed(2)))
    .join(', ')} · FOV ${s.fov}°`;
}

function patchShot(s: ThreeDShot, patch: Partial<Omit<ThreeDShot, 'id'>>) {
  store.updateShotAction(s.id, patch);
}
</script>

<template>
  <section
    class="border-surface-100 bg-surface-0/70 flex h-72 shrink-0 flex-col border-t"
    aria-label="分镜板"
  >
    <!-- 头部 -->
    <div class="border-surface-100 flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
      <Clapperboard class="text-surface-800/50 size-3.5" />
      <span class="text-surface-900 text-[11px] font-medium">分镜板</span>
      <span class="text-surface-800/35 text-[10px]">{{ shots.length }} 个镜头</span>

      <div class="ml-2 flex min-w-0 flex-1 items-center gap-1">
        <input
          v-model="shotName"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 h-6 w-40 min-w-0 rounded-md border px-2 text-[10px] outline-none"
          placeholder="从当前相机保存镜头"
          aria-label="镜头名称"
          @keydown.enter="saveShot"
        />
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[10px] font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="保存当前相机为镜头"
          @click="saveShot"
        >
          <Camera class="size-3" />
          保存镜头
        </button>
      </div>

      <button
        v-if="store.activeProject?.activeShotId"
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors"
        aria-label="退出镜头定位（恢复自由相机）"
        @click="store.exitShotMode()"
      >
        <X class="size-3" />
        退出镜头
      </button>
      <button
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors"
        aria-label="导出分镜 Markdown"
        @click="store.exportStoryboardMarkdown()"
      >
        <FileDown class="size-3" />
        MD
      </button>
      <button
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors"
        aria-label="导出分镜 JSON"
        @click="store.exportStoryboardJson()"
      >
        <FileCode2 class="size-3" />
        JSON
      </button>
    </div>

    <!-- 卡片 -->
    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <p v-if="shots.length === 0" class="text-surface-800/40 py-6 text-center text-[11px]">
        还没有镜头：调整相机后点击「保存镜头」，或在角色设计板中保存角色镜头。
      </p>
      <div v-else class="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
        <article
          v-for="(s, i) in shots"
          :key="s.id"
          class="border-surface-100 bg-surface-0/80 rounded-lg border p-2"
          :class="store.activeProject?.activeShotId === s.id ? 'border-brand-500' : ''"
        >
          <div class="mb-1 flex items-center gap-1">
            <span class="text-surface-800/35 shrink-0 text-[10px] tabular-nums">#{{ i + 1 }}</span>
            <input
              class="text-surface-900 hover:bg-surface-100 focus:bg-surface-100 min-w-0 flex-1 truncate rounded bg-transparent px-1 py-0.5 text-[11px] font-medium outline-none"
              :value="s.name"
              :aria-label="`镜头 ${i + 1} 名称`"
              @change="
                (e: Event) => patchShot(s, { name: (e.target as HTMLInputElement).value || s.name })
              "
            />
            <button
              class="text-surface-800/45 hover:bg-surface-100 flex size-5 shrink-0 items-center justify-center rounded"
              :aria-label="s.favorite ? `取消收藏 ${s.name}` : `收藏 ${s.name}`"
              :title="s.favorite ? '取消收藏' : '收藏'"
              @click="store.toggleShotFavoriteAction(s.id)"
            >
              <Star class="size-3" :class="s.favorite ? 'fill-amber-400 text-amber-400' : ''" />
            </button>
          </div>

          <div class="mb-1 flex items-center gap-1">
            <select
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 h-5 min-w-0 flex-1 rounded border px-1 text-[9px] outline-none"
              :value="s.status"
              :aria-label="`镜头 ${s.name} 状态`"
              @change="
                (e: Event) =>
                  patchShot(s, {
                    status: (e.target as HTMLSelectElement).value as ThreeDShot['status'],
                  })
              "
            >
              <option v-for="st in SHOT_STATUS_OPTIONS" :key="st.key" :value="st.key">
                {{ st.label }}
              </option>
            </select>
            <select
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 h-5 min-w-0 flex-1 rounded border px-1 text-[9px] outline-none"
              :value="s.regionId ?? ''"
              :aria-label="`镜头 ${s.name} 关联区域`"
              @change="
                (e: Event) =>
                  patchShot(s, { regionId: (e.target as HTMLSelectElement).value || null })
              "
            >
              <option value="">无区域</option>
              <option v-for="r in regions" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </div>

          <p class="text-surface-800/50 mb-1 truncate text-[9px]" :title="composition(s)">
            {{ composition(s) }}
          </p>
          <textarea
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-1.5 h-10 w-full resize-none rounded border px-1.5 py-1 text-[9px] outline-none"
            :value="s.notes"
            :aria-label="`镜头 ${s.name} 备注`"
            placeholder="构图 / 动作备注"
            @change="(e: Event) => patchShot(s, { notes: (e.target as HTMLTextAreaElement).value })"
          />

          <div class="flex items-center gap-0.5">
            <button
              class="hover:bg-brand-600 bg-brand-500 flex h-5 flex-1 items-center justify-center rounded text-[9px] font-medium text-white transition-colors"
              :aria-label="`应用镜头 ${s.name}`"
              @click="store.applyShot(s.id)"
            >
              应用
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/45 flex size-5 items-center justify-center rounded"
              :aria-label="`上移镜头 ${s.name}`"
              title="上移"
              :disabled="i === 0"
              @click="moveShot(s.id, -1)"
            >
              <ArrowUp class="size-3" />
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/45 flex size-5 items-center justify-center rounded"
              :aria-label="`下移镜头 ${s.name}`"
              title="下移"
              :disabled="i === shots.length - 1"
              @click="moveShot(s.id, 1)"
            >
              <ArrowDown class="size-3" />
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/45 flex size-5 items-center justify-center rounded"
              :aria-label="`复制镜头 ${s.name}`"
              title="复制"
              @click="store.duplicateShotAction(s.id)"
            >
              <Copy class="size-3" />
            </button>
            <button
              class="hover:bg-surface-100 flex size-5 items-center justify-center rounded text-red-500/70 hover:text-red-600"
              :aria-label="`删除镜头 ${s.name}`"
              title="删除"
              @click="store.removeShotAction(s.id)"
            >
              <Trash2 class="size-3" />
            </button>
          </div>
          <p v-if="regionName(s.regionId)" class="text-surface-800/40 mt-1 truncate text-[9px]">
            区域：{{ regionName(s.regionId) }}
          </p>
        </article>
      </div>
    </div>
  </section>
</template>
