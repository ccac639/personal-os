<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台角色设计板
 *
 * 集中展示与编辑角色档案、配色、外观、姿态库（内置 6 种 + 个人预设）、
 * 角色镜头（全身 / 半身 / 肖像 / 背面 / 三视图）与生成简报；
 * 支持导出角色简报 Markdown / JSON。仅结构化编辑，不自动生成内容。
 */
import { Camera, ClipboardCopy, Copy, FileCode2, FileDown, Plus, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';

import {
  AGE_GROUP_OPTIONS,
  BODY_PROPORTIONS,
  BODY_TYPE_OPTIONS,
  COLOR_SWATCHES,
  POSE_OPTIONS,
} from '../constants';
import { useThreeDWorkspaceStore } from '../store';
import type { CameraPresetId, PoseKey } from '../types';

const store = useThreeDWorkspaceStore();

const character = computed(() => store.activeProject?.character);
const project = computed(() => store.activeProject);

const poseName = ref('');
const shotName = ref('');

const CHARACTER_SHOTS: Array<{ key: CameraPresetId; label: string }> = [
  { key: 'fullbody', label: '全身' },
  { key: 'halfbody', label: '半身' },
  { key: 'face', label: '肖像' },
  { key: 'back', label: '背面' },
  { key: 'threeview', label: '三视图' },
];

function setPose(p: PoseKey) {
  store.setPoseAction(p);
}

function savePose() {
  const pose = project.value?.character?.pose ?? 'stand';
  store.savePersonalPoseAction(poseName.value, pose);
  poseName.value = '';
}

function applyCharacterShot(preset: CameraPresetId) {
  store.setCameraPreset(preset);
}

const paletteInput = computed({
  get: () => (character.value?.palette ?? []).join('，'),
  set: (raw: string) => {
    const parts = raw
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^#[0-9a-fA-F]{6}$/.test(s));
    store.updateCharacterFields({ palette: parts });
  },
});

async function copyBrief() {
  if (!project.value) return;
  try {
    await navigator.clipboard.writeText(store.briefText);
  } catch {
    // 忽略剪贴板失败
  }
}
</script>

<template>
  <section class="flex h-full w-72 shrink-0 flex-col" aria-label="角色设计板">
    <div class="border-surface-100 flex h-10 shrink-0 items-center gap-1.5 border-b px-2.5">
      <span class="text-surface-900 text-xs font-medium">角色设计板</span>
      <span class="text-surface-800/35 ml-auto truncate text-[10px]">
        {{ character?.codename || project?.name || '未命名角色' }}
      </span>
    </div>

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <!-- 档案 -->
      <section aria-label="角色档案">
        <h3 class="text-surface-800/50 mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          档案
        </h3>
        <div class="grid grid-cols-2 gap-1.5">
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">代号</span>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
              :value="character?.codename"
              aria-label="角色代号"
              @change="
                (e: Event) =>
                  store.updateCharacterFields({ codename: (e.target as HTMLInputElement).value })
              "
            />
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">姓名</span>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
              :value="project?.name"
              aria-label="角色姓名"
              @change="(e: Event) => store.renameProject((e.target as HTMLInputElement).value)"
            />
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">定位</span>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
              :value="character?.role"
              aria-label="角色定位"
              @change="
                (e: Event) =>
                  store.updateCharacterFields({ role: (e.target as HTMLInputElement).value })
              "
            />
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">年龄段</span>
            <select
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
              :value="character?.ageGroup"
              aria-label="年龄段"
              @change="
                (e: Event) =>
                  store.updateCharacterFields({ ageGroup: (e.target as HTMLSelectElement).value })
              "
            >
              <option v-for="a in AGE_GROUP_OPTIONS" :key="a.key" :value="a.key">
                {{ a.label }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">体型</span>
            <select
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
              :value="character?.bodyType"
              aria-label="体型"
              @change="
                (e: Event) =>
                  store.updateCharacterFields({ bodyType: (e.target as HTMLSelectElement).value })
              "
            >
              <option v-for="b in BODY_TYPE_OPTIONS" :key="b.key" :value="b.key">
                {{ b.label }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">风格</span>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
              :value="character?.style"
              aria-label="风格"
              @change="
                (e: Event) =>
                  store.updateCharacterFields({ style: (e.target as HTMLInputElement).value })
              "
            />
          </label>
        </div>
        <label class="text-surface-800/60 mt-1.5 mb-1 block text-[10px]">个性关键词</label>
        <input
          class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-1.5 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
          :value="character?.personalityKeywords"
          aria-label="个性关键词"
          @change="
            (e: Event) =>
              store.updateCharacterFields({
                personalityKeywords: (e.target as HTMLInputElement).value,
              })
          "
        />
        <div class="grid grid-cols-1 gap-1.5">
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">外观关键词</span>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
              :value="character?.appearanceKeywords"
              aria-label="外观关键词"
              @change="
                (e: Event) =>
                  store.updateCharacterFields({
                    appearanceKeywords: (e.target as HTMLInputElement).value,
                  })
              "
            />
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">服装关键词</span>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
              :value="character?.clothingKeywords"
              aria-label="服装关键词"
              @change="
                (e: Event) =>
                  store.updateCharacterFields({
                    clothingKeywords: (e.target as HTMLInputElement).value,
                  })
              "
            />
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">装备关键词</span>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
              :value="character?.equipmentKeywords"
              aria-label="装备关键词"
              @change="
                (e: Event) =>
                  store.updateCharacterFields({
                    equipmentKeywords: (e.target as HTMLInputElement).value,
                  })
              "
            />
          </label>
        </div>
      </section>

      <!-- 配色 -->
      <section aria-label="角色配色">
        <h3 class="text-surface-800/50 mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          配色
        </h3>
        <div class="mb-1.5 flex items-center gap-2">
          <label class="flex items-center gap-1 text-[10px]">
            主色
            <input
              type="color"
              class="border-surface-200 size-6 cursor-pointer rounded border bg-transparent p-0.5"
              :value="character?.primaryColor"
              aria-label="角色主色"
              @change="
                (e: Event) =>
                  store.updateCharacterFields({
                    primaryColor: (e.target as HTMLInputElement).value,
                  })
              "
            />
          </label>
          <label class="flex items-center gap-1 text-[10px]">
            辅色
            <input
              type="color"
              class="border-surface-200 size-6 cursor-pointer rounded border bg-transparent p-0.5"
              :value="character?.secondaryColor"
              aria-label="角色辅色"
              @change="
                (e: Event) =>
                  store.updateCharacterFields({
                    secondaryColor: (e.target as HTMLInputElement).value,
                  })
              "
            />
          </label>
        </div>
        <div class="mb-1 flex flex-wrap gap-1">
          <button
            v-for="c in COLOR_SWATCHES.slice(0, 10)"
            :key="c"
            class="size-4 rounded-sm border border-black/10"
            :style="{ background: c }"
            :aria-label="`设置主色 ${c}`"
            :title="c"
            @click="store.updateCharacterFields({ primaryColor: c })"
          />
        </div>
        <label class="text-surface-800/60 mb-1 block text-[10px]">配色（#hex，逗号分隔）</label>
        <input
          class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
          :value="paletteInput"
          aria-label="角色配色"
          @change="(e: Event) => (paletteInput = (e.target as HTMLInputElement).value)"
        />
      </section>

      <!-- 外观 -->
      <section aria-label="角色外观">
        <h3 class="text-surface-800/50 mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          外观
        </h3>
        <div class="grid grid-cols-2 gap-1.5">
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">体型比例</span>
            <select
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
              :value="character?.bodyProportions"
              aria-label="体型比例"
              @change="
                (e: Event) =>
                  store.updateCharacterFields({
                    bodyProportions: (e.target as HTMLSelectElement).value,
                  })
              "
            >
              <option v-for="b in BODY_PROPORTIONS" :key="b.key" :value="b.key">
                {{ b.label }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">头部比例</span>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
              type="number"
              min="0.5"
              max="2"
              step="0.05"
              :value="character?.headRatio"
              aria-label="头部比例"
              @change="
                (e: Event) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  if (v >= 0.5 && v <= 2) store.updateCharacterFields({ headRatio: v });
                }
              "
            />
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">肩宽</span>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
              type="number"
              min="0.5"
              max="2"
              step="0.05"
              :value="character?.shoulderWidth"
              aria-label="肩宽"
              @change="
                (e: Event) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  if (v >= 0.5 && v <= 2) store.updateCharacterFields({ shoulderWidth: v });
                }
              "
            />
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">腿长</span>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
              type="number"
              min="0.5"
              max="2"
              step="0.05"
              :value="character?.legLength"
              aria-label="腿长"
              @change="
                (e: Event) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  if (v >= 0.5 && v <= 2) store.updateCharacterFields({ legLength: v });
                }
              "
            />
          </label>
        </div>
      </section>

      <!-- 姿态库 -->
      <section aria-label="姿态库">
        <h3 class="text-surface-800/50 mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          姿态库
        </h3>
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="p in POSE_OPTIONS"
            :key="p.key"
            class="hover:bg-surface-100 rounded-md border px-1.5 py-1.5 text-center transition-colors"
            :class="
              character?.pose === p.key
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-surface-100 text-surface-800/60 hover:text-surface-900'
            "
            :aria-pressed="character?.pose === p.key"
            @click="setPose(p.key)"
          >
            <span class="block text-[10px] font-medium">{{ p.label }}</span>
            <span class="text-surface-800/40 block text-[8px]">{{ p.hint }}</span>
          </button>
        </div>
        <p class="text-surface-800/40 mt-1 text-[9px]">
          姿态通过占位模型部位确定性旋转 / 位移体现（非真实骨骼）。
        </p>

        <!-- 个人姿态预设 -->
        <div class="mt-2 flex items-center gap-1.5">
          <input
            v-model="poseName"
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 min-w-0 flex-1 rounded-md border px-2 py-1 text-[10px] outline-none"
            placeholder="保存当前姿态为个人预设"
            aria-label="个人姿态预设名称"
            @keydown.enter="savePose"
          />
          <button
            class="hover:bg-brand-600 bg-brand-500 flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium text-white transition-colors"
            aria-label="保存当前姿态为个人预设"
            @click="savePose"
          >
            <Plus class="size-3" />
            保存
          </button>
        </div>
        <div v-if="character?.personalPoses.length" class="mt-1.5 space-y-1">
          <div
            v-for="pp in character.personalPoses"
            :key="pp.id"
            class="border-surface-100 bg-surface-0/70 flex items-center gap-1 rounded-md border px-1.5 py-1"
          >
            <button
              class="focus-visible:ring-brand-500/40 min-w-0 flex-1 rounded text-left focus-visible:ring-2 focus-visible:outline-none"
              :aria-label="`应用个人姿态 ${pp.name}`"
              @click="store.applyPersonalPoseAction(pp.id)"
            >
              <span class="text-surface-900 block truncate text-[10px] font-medium">{{
                pp.name
              }}</span>
              <span class="text-surface-800/40 block text-[9px]">
                {{ POSE_OPTIONS.find((o) => o.key === pp.pose)?.label ?? pp.pose }}
              </span>
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/45 flex size-5 items-center justify-center rounded"
              :aria-label="`复制个人姿态 ${pp.name}`"
              title="复制"
              @click="store.copyPersonalPoseAction(pp.id)"
            >
              <Copy class="size-3" />
            </button>
            <button
              class="hover:bg-surface-100 flex size-5 items-center justify-center rounded text-red-500/70 hover:text-red-600"
              :aria-label="`删除个人姿态 ${pp.name}`"
              title="删除"
              @click="store.deletePersonalPoseAction(pp.id)"
            >
              <Trash2 class="size-3" />
            </button>
          </div>
        </div>
        <p v-else class="text-surface-800/35 mt-1 text-[9px]">还没有个人姿态预设</p>
      </section>

      <!-- 角色镜头 -->
      <section aria-label="角色镜头">
        <h3 class="text-surface-800/50 mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          角色镜头
        </h3>
        <div class="grid grid-cols-5 gap-1">
          <button
            v-for="s in CHARACTER_SHOTS"
            :key="s.key"
            class="hover:bg-surface-100 rounded-md border px-1 py-1.5 text-[9px] transition-colors"
            :class="
              project?.cameraPreset === s.key
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-surface-100 text-surface-800/60 hover:text-surface-900'
            "
            :aria-pressed="project?.cameraPreset === s.key"
            @click="applyCharacterShot(s.key)"
          >
            {{ s.label }}
          </button>
        </div>
        <div class="mt-2 flex items-center gap-1.5">
          <input
            v-model="shotName"
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 min-w-0 flex-1 rounded-md border px-2 py-1 text-[10px] outline-none"
            placeholder="保存当前相机为镜头"
            aria-label="镜头名称"
            @keydown.enter="
              store.saveShotFromCamera(shotName || '');
              shotName = '';
            "
          />
          <button
            class="hover:bg-brand-600 bg-brand-500 flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium text-white transition-colors"
            aria-label="保存当前相机为镜头"
            @click="
              store.saveShotFromCamera(shotName || '');
              shotName = '';
            "
          >
            <Camera class="size-3" />
            保存镜头
          </button>
        </div>
        <p v-if="project?.shots.length" class="text-surface-800/40 mt-1 text-[9px]">
          已保存 {{ project.shots.length }} 个镜头（见分镜板）
        </p>
      </section>

      <!-- 简报 -->
      <section aria-label="角色简报">
        <h3 class="text-surface-800/50 mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          生成简报
        </h3>
        <p class="text-surface-800/50 mb-2 line-clamp-4 text-[10px] leading-relaxed">
          {{ store.briefText || '（暂无简报内容）' }}
        </p>
        <div class="flex flex-wrap gap-1">
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors"
            aria-label="复制简报文本"
            @click="copyBrief"
          >
            <ClipboardCopy class="size-3" />
            复制
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors"
            aria-label="导出角色简报 Markdown"
            @click="store.exportCharacterBriefMarkdown()"
          >
            <FileDown class="size-3" />
            导出 MD
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors"
            aria-label="导出角色简报 JSON"
            @click="store.exportCharacterBriefJson()"
          >
            <FileCode2 class="size-3" />
            导出 JSON
          </button>
        </div>
        <p class="text-surface-800/35 mt-1.5 text-[9px]">
          支持从 Chat 文本草稿预填档案（仅结构化文本，不自动生成内容）。
        </p>
      </section>
    </div>
  </section>
</template>
