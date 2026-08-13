<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台检查器（右侧）
 *
 * 三组编辑：场景设置（背景/地面/网格/环境光/主光/雾）、
 * 模式设定（角色 / 世界 / 道具）、资产属性（变换数值输入 / 颜色 / 材质 / 备注）。
 * 所有变更进入撤销栈；编辑状态均有文字标签，不只靠颜色表达。
 */
import { computed } from 'vue';

import {
  BODY_PROPORTIONS,
  COLOR_SWATCHES,
  MATERIAL_PRESETS,
  POSE_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  WEATHER_OPTIONS,
} from '../constants';
import { useThreeDWorkspaceStore } from '../store';
import type { ThreeDAsset, ThreeDProject } from '../types';

const store = useThreeDWorkspaceStore();

const project = computed(() => store.activeProject);
const asset = computed(() => store.activeAsset);

/* ---------- 场景设置 ---------- */

const scene = computed(() => project.value?.sceneSettings);

function patchScene(patch: Partial<ThreeDProject['sceneSettings']>) {
  store.updateScene(patch);
}

const ambient = computed(() => scene.value?.ambientLight);
const main = computed(() => scene.value?.mainLight);
const fog = computed(() => scene.value?.fog);

/* ---------- 模式设定 ---------- */

const character = computed(() => project.value?.character);
const world = computed(() => project.value?.world);
const prop = computed(() => project.value?.prop);

/* ---------- 资产属性 ---------- */

const transform = computed(() => asset.value?.transform);

/** 变换字段元数据（模板 v-for 使用，避免 ref 解包歧义） */
const TRANSFORM_FIELDS = [
  { label: '位置 X', key: 'position', axis: 0 },
  { label: '位置 Y', key: 'position', axis: 1 },
  { label: '位置 Z', key: 'position', axis: 2 },
  { label: '旋转 X°', key: 'rotation', axis: 0 },
  { label: '旋转 Y°', key: 'rotation', axis: 1 },
  { label: '旋转 Z°', key: 'rotation', axis: 2 },
  { label: '缩放 X', key: 'scale', axis: 0 },
  { label: '缩放 Y', key: 'scale', axis: 1 },
  { label: '缩放 Z', key: 'scale', axis: 2 },
] as const;

type TransformKey = (typeof TRANSFORM_FIELDS)[number]['key'];

function axisValue(key: TransformKey, axis: 0 | 1 | 2): number {
  const t = transform.value;
  const v = t ? t[key][axis] : 0;
  return v ?? 0;
}

function setAxisField(key: TransformKey, axis: 0 | 1 | 2, raw: string) {
  const a = asset.value;
  if (!a) return;
  const v = Number(raw);
  if (!Number.isFinite(v)) return;
  const t = transform.value;
  if (!t) return;
  const next: ThreeDAsset['transform'] = {
    position: [...t.position],
    rotation: [...t.rotation],
    scale: [...t.scale],
  };
  next[key][axis] = v;
  store.setAssetTransform(a.id, next);
}

function renameAsset(raw: string) {
  const a = asset.value;
  if (!a) return;
  store.patchAsset(a.id, { name: raw.trim() || a.name }, '重命名资产');
}

function setColorPicker(raw: string) {
  const a = asset.value;
  if (!a) return;
  store.setAssetColor(a.id, raw);
}

function setColorSwatch(c: string) {
  const a = asset.value;
  if (!a) return;
  store.setAssetColor(a.id, c);
}

function setMaterialSelect(raw: string) {
  const a = asset.value;
  if (!a) return;
  store.setMaterialPreset(a.id, raw as ThreeDAsset['materialPreset']);
}

function setAssetNotes(raw: string) {
  const a = asset.value;
  if (!a) return;
  store.patchAsset(a.id, { notes: raw.slice(0, 500) }, '备注更新');
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

function setPalette(raw: string) {
  paletteInput.value = raw;
}

const equipmentInput = computed({
  get: () => (character.value?.equipment ?? []).join('，'),
  set: (raw: string) => {
    const parts = raw
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    store.updateCharacterFields({ equipment: parts });
  },
});

function setEquipment(raw: string) {
  equipmentInput.value = raw;
}

const tagsInput = computed({
  get: () => (asset.value?.tags ?? []).join('，'),
  set: (raw: string) => {
    const parts = raw
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (asset.value) store.patchAsset(asset.value.id, { tags: parts.slice(0, 12) }, '标签更新');
  },
});

function setTagsRaw(raw: string) {
  tagsInput.value = raw;
}

/* ---------- 场景设置（避免模板内 spread 可选字段） ---------- */

function toggleAmbient() {
  const a = ambient.value;
  if (!a) return;
  store.updateScene({ ambientLight: { ...a, enabled: !a.enabled } });
}

function setAmbientColor(raw: string) {
  const a = ambient.value;
  if (!a) return;
  store.updateScene({ ambientLight: { ...a, color: raw } });
}

function setAmbientIntensity(raw: string) {
  const a = ambient.value;
  if (!a) return;
  store.updateScene({ ambientLight: { ...a, intensity: Number(raw) } });
}

function toggleMainLight() {
  const m = main.value;
  if (!m) return;
  store.updateScene({ mainLight: { ...m, enabled: !m.enabled } });
}

function setMainColor(raw: string) {
  const m = main.value;
  if (!m) return;
  store.updateScene({ mainLight: { ...m, color: raw } });
}

function setMainIntensity(raw: string) {
  const m = main.value;
  if (!m) return;
  store.updateScene({ mainLight: { ...m, intensity: Number(raw) } });
}

function toggleFog() {
  const f = fog.value;
  if (!f) return;
  store.updateScene({ fog: { ...f, enabled: !f.enabled } });
}

function setFogNear(raw: string) {
  const f = fog.value;
  if (!f) return;
  store.updateScene({ fog: { ...f, near: Math.max(0, Number(raw)) } });
}

function setFogFar(raw: string) {
  const f = fog.value;
  if (!f) return;
  store.updateScene({ fog: { ...f, far: Math.max(0, Number(raw)) } });
}
</script>

<template>
  <aside
    class="border-surface-100 bg-surface-0/60 flex h-full w-64 shrink-0 flex-col border-l"
    aria-label="检查器"
  >
    <div class="border-surface-100 flex h-10 shrink-0 items-center gap-1.5 border-b px-2.5">
      <span class="text-surface-900 text-xs font-medium">检查器</span>
      <span class="text-surface-800/35 ml-auto truncate text-[10px]">
        {{ asset ? asset.name : '场景' }}
      </span>
    </div>

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <!-- ============ 资产属性 ============ -->
      <section v-if="asset" aria-label="资产属性">
        <h3 class="text-surface-800/50 mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          资产属性
        </h3>

        <label class="text-surface-800/60 mb-1 block text-[10px]">名称</label>
        <input
          class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-xs outline-none"
          :value="asset.name"
          aria-label="资产名称"
          @change="(e: Event) => renameAsset((e.target as HTMLInputElement).value)"
        />

        <div class="mb-2 flex items-center gap-2">
          <label class="text-surface-800/70 flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              class="accent-brand-500"
              :checked="asset.visible"
              aria-label="可见"
              @change="store.toggleAssetVisible(asset.id)"
            />
            可见
          </label>
          <label class="text-surface-800/70 flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              class="accent-brand-500"
              :checked="asset.locked"
              aria-label="锁定"
              @change="store.toggleAssetLocked(asset.id)"
            />
            锁定
          </label>
        </div>

        <!-- 变换数值输入 -->
        <p class="text-surface-800/50 mb-1 text-[10px] font-semibold">变换</p>
        <div class="grid grid-cols-3 gap-1.5">
          <template v-for="cfg in TRANSFORM_FIELDS" :key="cfg.label">
            <label class="text-surface-800/45 block text-[9px]">{{ cfg.label }}</label>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-1.5 py-1 text-[11px] tabular-nums outline-none"
              type="number"
              step="0.1"
              :value="axisValue(cfg.key, cfg.axis)"
              :aria-label="`资产 ${cfg.label}`"
              @input="
                (e: Event) => setAxisField(cfg.key, cfg.axis, (e.target as HTMLInputElement).value)
              "
            />
          </template>
        </div>

        <!-- 颜色 -->
        <p class="text-surface-800/50 mt-2 mb-1 text-[10px] font-semibold">颜色</p>
        <div class="flex items-center gap-1.5">
          <input
            type="color"
            class="border-surface-200 size-7 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
            :value="asset.color"
            :aria-label="`颜色 ${asset.color}`"
            title="选择颜色"
            @change="(e: Event) => setColorPicker((e.target as HTMLInputElement).value)"
          />
          <code class="text-surface-800/50 text-[10px]">{{ asset.color }}</code>
        </div>
        <div class="mt-1.5 flex flex-wrap gap-1">
          <button
            v-for="c in COLOR_SWATCHES"
            :key="c"
            class="focus-visible:ring-brand-500/40 size-4 rounded-sm border border-black/10 transition-transform focus-visible:ring-2 focus-visible:outline-none"
            :class="asset.color === c ? 'ring-brand-500 scale-110 ring-1' : ''"
            :style="{ background: c }"
            :aria-label="`设置颜色 ${c}`"
            :title="c"
            @click="setColorSwatch(c)"
          />
        </div>

        <!-- 材质 -->
        <label
          class="text-surface-800/50 mt-2 mb-1 block text-[10px] font-semibold"
          for="mat-preset"
          >材质预设</label
        >
        <select
          id="mat-preset"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
          :value="asset.materialPreset"
          :aria-label="`材质预设（当前 ${asset.materialPreset}）`"
          @change="(e: Event) => setMaterialSelect((e.target as HTMLSelectElement).value)"
        >
          <option v-for="m in MATERIAL_PRESETS" :key="m.key" :value="m.key">{{ m.label }}</option>
        </select>

        <!-- 标签 / 备注 -->
        <label class="text-surface-800/50 mt-2 mb-1 block text-[10px] font-semibold"
          >标签（逗号分隔）</label
        >
        <input
          class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
          :value="tagsInput"
          aria-label="资产标签"
          @change="(e: Event) => setTagsRaw((e.target as HTMLInputElement).value)"
        />
        <label class="text-surface-800/50 mt-2 mb-1 block text-[10px] font-semibold">备注</label>
        <textarea
          class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 h-16 w-full resize-none rounded-lg border px-2 py-1 text-[11px] outline-none"
          :value="asset.notes"
          aria-label="资产备注"
          @change="(e: Event) => setAssetNotes((e.target as HTMLTextAreaElement).value)"
        />
      </section>

      <!-- ============ 模式设定 ============ -->
      <section v-if="project" aria-label="模式设定">
        <h3 class="text-surface-800/50 mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          {{
            project.type === 'character'
              ? '角色模式'
              : project.type === 'world'
                ? '世界模式'
                : '道具模式'
          }}
        </h3>

        <template v-if="project.type === 'character' && character">
          <label class="text-surface-800/60 mb-1 block text-[10px]">角色名称</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="project.name"
            aria-label="角色名称"
            @change="(e: Event) => store.renameProject((e.target as HTMLInputElement).value)"
          />
          <label class="text-surface-800/60 mb-1 block text-[10px]">角色定位</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="character.role"
            aria-label="角色定位"
            @change="
              (e: Event) =>
                store.updateCharacterFields({ role: (e.target as HTMLInputElement).value })
            "
          />
          <div class="mb-2 grid grid-cols-2 gap-1.5">
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[10px]">体型比例</span>
              <select
                class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
                :value="character.bodyProportions"
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
              <span class="text-surface-800/60 mb-1 block text-[10px]">姿态</span>
              <select
                class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
                :value="character.pose"
                aria-label="姿态"
                @change="
                  (e: Event) =>
                    store.updateCharacterFields({ pose: (e.target as HTMLSelectElement).value })
                "
              >
                <option v-for="p in POSE_OPTIONS" :key="p.key" :value="p.key">{{ p.label }}</option>
              </select>
            </label>
          </div>
          <label class="text-surface-800/60 mb-1 block text-[10px]">配色（#hex，逗号分隔）</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="paletteInput"
            aria-label="角色配色"
            @change="(e: Event) => setPalette((e.target as HTMLInputElement).value)"
          />
          <label class="text-surface-800/60 mb-1 block text-[10px]">装备占位</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="equipmentInput"
            aria-label="装备占位"
            @change="(e: Event) => setEquipment((e.target as HTMLInputElement).value)"
          />
          <label class="text-surface-800/60 mb-1 block text-[10px]">外观关键词</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="character.appearanceKeywords"
            aria-label="外观关键词"
            @change="
              (e: Event) =>
                store.updateCharacterFields({
                  appearanceKeywords: (e.target as HTMLInputElement).value,
                })
            "
          />
          <label class="text-surface-800/60 mb-1 block text-[10px]">服装 / 材质关键词</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="character.clothingKeywords"
            aria-label="服装材质关键词"
            @change="
              (e: Event) =>
                store.updateCharacterFields({
                  clothingKeywords: (e.target as HTMLInputElement).value,
                })
            "
          />
        </template>

        <template v-else-if="project.type === 'world' && world">
          <label class="text-surface-800/60 mb-1 block text-[10px]">世界名称</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="project.name"
            aria-label="世界名称"
            @change="(e: Event) => store.renameProject((e.target as HTMLInputElement).value)"
          />
          <label class="text-surface-800/60 mb-1 block text-[10px]">时代 / 风格</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="world.eraStyle"
            aria-label="时代风格"
            @change="
              (e: Event) =>
                store.updateWorldFields({ eraStyle: (e.target as HTMLInputElement).value })
            "
          />
          <label class="text-surface-800/60 mb-1 block text-[10px]">区域说明</label>
          <textarea
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 h-16 w-full resize-none rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="world.regionNotes"
            aria-label="区域说明"
            @change="
              (e: Event) =>
                store.updateWorldFields({ regionNotes: (e.target as HTMLTextAreaElement).value })
            "
          />
          <label class="text-surface-800/60 mb-1 block text-[10px]">氛围</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="world.atmosphere"
            aria-label="氛围"
            @change="
              (e: Event) =>
                store.updateWorldFields({ atmosphere: (e.target as HTMLInputElement).value })
            "
          />
          <div class="mb-2 grid grid-cols-2 gap-1.5">
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[10px]">时间</span>
              <select
                class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
                :value="world.timeOfDay"
                aria-label="时间"
                @change="
                  (e: Event) =>
                    store.updateWorldFields({ timeOfDay: (e.target as HTMLSelectElement).value })
                "
              >
                <option v-for="t in TIME_OF_DAY_OPTIONS" :key="t.key" :value="t.key">
                  {{ t.label }}
                </option>
              </select>
            </label>
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[10px]">天气</span>
              <select
                class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
                :value="world.weather"
                aria-label="天气"
                @change="
                  (e: Event) =>
                    store.updateWorldFields({ weather: (e.target as HTMLSelectElement).value })
                "
              >
                <option v-for="w in WEATHER_OPTIONS" :key="w.key" :value="w.key">
                  {{ w.label }}
                </option>
              </select>
            </label>
          </div>
          <label class="text-surface-800/60 mb-1 block text-[10px]">比例尺（单位 / 米）</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            type="number"
            min="0.01"
            step="0.1"
            :value="world.scale"
            aria-label="比例尺"
            @change="
              (e: Event) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (v > 0) store.updateWorldFields({ scale: v });
              }
            "
          />
        </template>

        <template v-else-if="project.type === 'prop' && prop">
          <label class="text-surface-800/60 mb-1 block text-[10px]">道具名称</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="project.name"
            aria-label="道具名称"
            @change="(e: Event) => store.renameProject((e.target as HTMLInputElement).value)"
          />
          <label class="text-surface-800/60 mb-1 block text-[10px]">说明</label>
          <textarea
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 h-14 w-full resize-none rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="prop.description"
            aria-label="道具说明"
            @change="
              (e: Event) =>
                store.updatePropFields({ description: (e.target as HTMLTextAreaElement).value })
            "
          />
          <label class="text-surface-800/60 mb-1 block text-[10px]">用途</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="prop.usage"
            aria-label="道具用途"
            @change="
              (e: Event) => store.updatePropFields({ usage: (e.target as HTMLInputElement).value })
            "
          />
          <label class="text-surface-800/60 mb-1 block text-[10px]">尺寸提示</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="prop.sizeHint"
            aria-label="尺寸提示"
            @change="
              (e: Event) =>
                store.updatePropFields({ sizeHint: (e.target as HTMLInputElement).value })
            "
          />
        </template>
      </section>

      <!-- ============ 场景设置 ============ -->
      <section v-if="scene" aria-label="场景设置">
        <h3 class="text-surface-800/50 mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          场景设置
        </h3>

        <div class="mb-2 grid grid-cols-2 gap-1.5">
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">背景</span>
            <input
              type="color"
              class="border-surface-200 size-7 cursor-pointer rounded border bg-transparent p-0.5"
              :value="scene.background"
              aria-label="背景颜色"
              @change="
                (e: Event) => patchScene({ background: (e.target as HTMLInputElement).value })
              "
            />
          </label>
          <label class="block">
            <span class="text-surface-800/60 mb-1 block text-[10px]">地面色</span>
            <input
              type="color"
              class="border-surface-200 size-7 cursor-pointer rounded border bg-transparent p-0.5"
              :value="scene.groundColor"
              aria-label="地面颜色"
              @change="
                (e: Event) => patchScene({ groundColor: (e.target as HTMLInputElement).value })
              "
            />
          </label>
        </div>

        <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <label class="text-surface-800/70 flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              class="accent-brand-500"
              :checked="scene.groundVisible"
              aria-label="显示地面"
              @change="patchScene({ groundVisible: !scene.groundVisible })"
            />
            地面
          </label>
          <label class="text-surface-800/70 flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              class="accent-brand-500"
              :checked="scene.gridVisible"
              aria-label="显示网格"
              @change="patchScene({ gridVisible: !scene.gridVisible })"
            />
            网格
          </label>
          <label class="text-surface-800/70 flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              class="accent-brand-500"
              :checked="scene.axesVisible"
              aria-label="显示坐标轴"
              @change="patchScene({ axesVisible: !scene.axesVisible })"
            />
            坐标轴
          </label>
        </div>

        <template v-if="ambient">
          <p class="text-surface-800/50 mb-1 text-[10px] font-semibold">环境光</p>
          <div class="mb-2 flex items-center gap-2">
            <input
              type="checkbox"
              class="accent-brand-500"
              :checked="ambient.enabled"
              aria-label="启用环境光"
              @change="toggleAmbient()"
            />
            <input
              type="color"
              class="border-surface-200 size-6 cursor-pointer rounded border bg-transparent p-0.5"
              :value="ambient.color"
              aria-label="环境光颜色"
              @change="(e: Event) => setAmbientColor((e.target as HTMLInputElement).value)"
            />
            <input
              type="range"
              class="accent-brand-500 h-1 min-w-0 flex-1"
              min="0"
              max="3"
              step="0.05"
              :value="ambient.intensity"
              aria-label="环境光强度"
              @input="(e: Event) => setAmbientIntensity((e.target as HTMLInputElement).value)"
            />
            <span class="text-surface-800/50 w-7 text-right text-[10px] tabular-nums">{{
              ambient.intensity.toFixed(2)
            }}</span>
          </div>
        </template>

        <template v-if="main">
          <p class="text-surface-800/50 mb-1 text-[10px] font-semibold">主光</p>
          <div class="mb-1 flex items-center gap-2">
            <input
              type="checkbox"
              class="accent-brand-500"
              :checked="main.enabled"
              aria-label="启用主光"
              @change="toggleMainLight()"
            />
            <input
              type="color"
              class="border-surface-200 size-6 cursor-pointer rounded border bg-transparent p-0.5"
              :value="main.color"
              aria-label="主光颜色"
              @change="(e: Event) => setMainColor((e.target as HTMLInputElement).value)"
            />
            <input
              type="range"
              class="accent-brand-500 h-1 min-w-0 flex-1"
              min="0"
              max="6"
              step="0.1"
              :value="main.intensity"
              aria-label="主光强度"
              @input="(e: Event) => setMainIntensity((e.target as HTMLInputElement).value)"
            />
            <span class="text-surface-800/50 w-7 text-right text-[10px] tabular-nums">{{
              main.intensity.toFixed(1)
            }}</span>
          </div>
        </template>

        <template v-if="fog">
          <p class="text-surface-800/50 mb-1 text-[10px] font-semibold">雾效</p>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label class="text-surface-800/70 flex items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                class="accent-brand-500"
                :checked="fog.enabled"
                aria-label="启用雾效"
                @change="toggleFog()"
              />
              启用
            </label>
            <label class="text-surface-800/70 flex items-center gap-1.5 text-[11px]">
              近
              <input
                class="border-surface-100 bg-surface-50 text-surface-900 w-14 rounded-md border px-1 py-0.5 text-[10px] outline-none"
                type="number"
                min="0"
                :value="fog.near"
                aria-label="雾近端"
                @change="(e: Event) => setFogNear((e.target as HTMLInputElement).value)"
              />
            </label>
            <label class="text-surface-800/70 flex items-center gap-1.5 text-[11px]">
              远
              <input
                class="border-surface-100 bg-surface-50 text-surface-900 w-14 rounded-md border px-1 py-0.5 text-[10px] outline-none"
                type="number"
                min="0"
                :value="fog.far"
                aria-label="雾远端"
                @change="(e: Event) => setFogFar((e.target as HTMLInputElement).value)"
              />
            </label>
          </div>
        </template>
      </section>
    </div>
  </aside>
</template>
