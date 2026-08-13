<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台检查器（右侧）
 *
 * - 单资产：名称 / 显隐 / 锁定 / 变换 / 颜色 / 材质预设 + 受控参数（预览）/ 标签 / 备注 /
 *   灯光参数（light 资产）/ 重置到默认配置。
 * - 多选：批量显隐 / 锁定 / 删除 / 分组 / 改色 / 重置变换 / 增量变换（混合值显示）。
 * - 模式设定：角色（档案 / 外观）/ 世界（时代 / 地点 / 镜头语言等）/ 道具。
 * - 场景设置：背景 / 地面 / 网格 / 轴 / 环境光 / 主光 / 雾 + 世界环境预设。
 * 所有变更进入撤销栈；编辑状态均有文字标签，不只靠颜色表达。
 */
import { computed, ref } from 'vue';

import {
  AGE_GROUP_OPTIONS,
  ASSET_TYPE_LABELS,
  BODY_PROPORTIONS,
  BODY_TYPE_OPTIONS,
  COLOR_SWATCHES,
  ENVIRONMENT_PRESETS,
  LIGHT_KINDS,
  MATERIAL_PRESETS,
  MATERIAL_PRESET_PARAMS,
  POSE_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  WEATHER_OPTIONS,
  defaultTransform,
} from '../constants';
import { useThreeDWorkspaceStore } from '../store';
import type { LightKind, ThreeDAsset, ThreeDProject, Vec3Tuple } from '../types';

const store = useThreeDWorkspaceStore();

const project = computed(() => store.activeProject);
const asset = computed(() => store.activeAsset);
const selectionCount = computed(() => project.value?.selectedAssetIds.length ?? 0);
const multi = computed(() => selectionCount.value > 1);
const envCustomName = ref('');

/* ---------- 场景设置 ---------- */

const scene = computed(() => project.value?.sceneSettings);

function patchScene(patch: Partial<ThreeDProject['sceneSettings']>) {
  store.updateScene(patch);
}

const ambient = computed(() => scene.value?.ambientLight);
const main = computed(() => scene.value?.mainLight);
const fog = computed(() => scene.value?.fog);
const envPreset = computed(() => project.value?.environmentPreset ?? 'custom');

function ASSET_TYPE_NAME(t: ThreeDAsset['type']): string {
  return ASSET_TYPE_LABELS[t];
}

function applyEnvPreset(raw: string) {
  if (raw === 'custom') {
    store.saveCustomEnvironmentAction(envCustomName.value || '自定义环境');
    return;
  }
  store.applyEnvironmentPresetAction(
    raw as Parameters<typeof store.applyEnvironmentPresetAction>[0],
  );
}

/* ---------- 模式设定 ---------- */

const character = computed(() => project.value?.character);
const world = computed(() => project.value?.world);
const prop = computed(() => project.value?.prop);

/* ---------- 资产属性（单资产） ---------- */

const transform = computed(() => asset.value?.transform);
const light = computed(() => asset.value?.light);
const materialParams = computed(() => asset.value?.materialParams);

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
  store.setMaterialPresetAction(a.id, raw as ThreeDAsset['materialPreset']);
}

function setMaterialParam(
  key: 'roughness' | 'metalness' | 'opacity' | 'emissiveIntensity',
  raw: string,
) {
  const a = asset.value;
  if (!a) return;
  store.updateMaterialParamsAction(a.id, { [key]: Number(raw) });
}

function setAssetNotes(raw: string) {
  const a = asset.value;
  if (!a) return;
  store.patchAsset(a.id, { notes: raw.slice(0, 500) }, '备注更新');
}

function resetAssetDefaults() {
  const a = asset.value;
  if (!a) return;
  store.patchAsset(
    a.id,
    {
      transform: defaultTransform(),
      color:
        a.type === 'light'
          ? '#fbbf24'
          : a.type === 'camera-marker'
            ? '#38bdf8'
            : a.type === 'world-placeholder'
              ? '#16a34a'
              : a.type === 'character-placeholder'
                ? '#f1c27d'
                : '#6366f1',
      materialPreset:
        a.type === 'light' ? 'emissive' : a.type === 'camera-marker' ? 'wireframe' : 'standard',
      materialParams: {
        ...MATERIAL_PRESET_PARAMS[
          a.type === 'light' ? 'emissive' : a.type === 'camera-marker' ? 'wireframe' : 'standard'
        ],
      },
    },
    '重置资产到默认配置',
  );
}

/* ---------- 灯光编辑 ---------- */

function setLightKind(raw: string) {
  const a = asset.value;
  if (!a || !light.value) return;
  store.updateLightAction(a.id, { kind: raw as LightKind });
}

function patchLight(patch: Partial<NonNullable<ThreeDAsset['light']>>) {
  const a = asset.value;
  if (!a || !light.value) return;
  store.updateLightAction(a.id, patch);
}

/* ---------- 多选批量 ---------- */

const selectionAssets = computed(() => {
  const p = project.value;
  if (!p) return [];
  const ids =
    p.selectedAssetIds.length > 0 ? p.selectedAssetIds : p.activeAssetId ? [p.activeAssetId] : [];
  return ids
    .map((id) => p.assets.find((a) => a.id === id))
    .filter((a): a is ThreeDAsset => Boolean(a));
});

/** 混合值：所有选中一致返回该值，否则 null（显示“混合值”） */
function mixedValue<T>(pick: (a: ThreeDAsset) => T): T | null {
  const list = selectionAssets.value;
  if (list.length === 0) return null;
  const first = pick(list[0]!);
  return list.every((a) => pick(a) === first) ? first : null;
}

const mixedVisible = computed<boolean | null>(() => mixedValue((a) => a.visible));
const mixedLocked = computed<boolean | null>(() => mixedValue((a) => a.locked));
const mixedColor = computed<string | null>(() => mixedValue((a) => a.color));
const mixedMaterial = computed<string | null>(() => mixedValue((a) => a.materialPreset));

function mixedTransformValue(key: TransformKey, axis: 0 | 1 | 2): number | null {
  const list = selectionAssets.value;
  if (list.length === 0) return null;
  const first = list[0]!.transform[key][axis];
  return list.every((a) => a.transform[key][axis] === first) ? first : null;
}

function batchDeltaInput(key: 'move' | 'rotate' | 'scale', axis: 0 | 1 | 2, raw: string) {
  const v = Number(raw);
  if (!Number.isFinite(v) || v === 0) return;
  const delta: Vec3Tuple = [0, 0, 0];
  delta[axis] = v;
  store.batchTransformSelected(key, delta);
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
    class="border-surface-100 bg-surface-0/60 flex h-full w-72 shrink-0 flex-col border-l"
    aria-label="检查器"
  >
    <div class="border-surface-100 flex h-10 shrink-0 items-center gap-1.5 border-b px-2.5">
      <span class="text-surface-900 text-xs font-medium">检查器</span>
      <span class="text-surface-800/35 ml-auto truncate text-[10px]">
        {{ multi ? `${selectionCount} 项已选` : asset ? asset.name : '场景' }}
      </span>
    </div>

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <!-- ============ 批量编辑（多选） ============ -->
      <section v-if="multi" aria-label="批量编辑">
        <h3 class="text-surface-800/50 mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          批量编辑（{{ selectionCount }} 项）
        </h3>

        <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <label class="text-surface-800/70 flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              class="accent-brand-500"
              :checked="mixedVisible === true"
              :indeterminate="mixedVisible === null"
              aria-label="批量可见"
              @change="store.batchVisibleAction(!mixedVisible)"
            />
            可见
          </label>
          <label class="text-surface-800/70 flex items-center gap-1.5 text-[11px]">
            <input
              type="checkbox"
              class="accent-brand-500"
              :checked="mixedLocked === true"
              :indeterminate="mixedLocked === null"
              aria-label="批量锁定"
              @change="store.batchLockedAction(!mixedLocked)"
            />
            锁定
          </label>
        </div>

        <div class="mb-2 flex flex-wrap items-center gap-1">
          <button
            class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 rounded-md px-2 py-1 text-[10px] font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="组合选中资产"
            @click="store.batchGroupSelected()"
          >
            组合
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 rounded-md px-2 py-1 text-[10px] transition-colors"
            aria-label="重置选中资产变换"
            @click="store.batchResetSelected()"
          >
            重置变换
          </button>
          <button
            class="hover:bg-surface-100 rounded-md px-2 py-1 text-[10px] text-red-500/80 transition-colors hover:text-red-600"
            aria-label="删除选中资产"
            @click="store.batchDeleteSelected()"
          >
            删除
          </button>
        </div>

        <div class="mb-2">
          <p class="text-surface-800/50 mb-1 text-[10px] font-semibold">批量改色</p>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="c in COLOR_SWATCHES"
              :key="c"
              class="focus-visible:ring-brand-500/40 size-4 rounded-sm border border-black/10 transition-transform focus-visible:ring-2 focus-visible:outline-none"
              :class="mixedColor === c ? 'ring-brand-500 scale-110 ring-1' : ''"
              :style="{ background: c }"
              :aria-label="`批量设置颜色 ${c}`"
              :title="c"
              @click="store.batchColorSelected(c)"
            />
          </div>
          <p class="text-surface-800/40 mt-0.5 text-[9px]">当前：{{ mixedColor ?? '混合值' }}</p>
        </div>

        <div class="mb-2">
          <p class="text-surface-800/50 mb-1 text-[10px] font-semibold">批量材质</p>
          <select
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="mixedMaterial ?? ''"
            aria-label="批量材质预设"
            @change="
              (e: Event) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v) {
                  for (const a of selectionAssets)
                    store.setMaterialPresetAction(a.id, v as ThreeDAsset['materialPreset']);
                }
              }
            "
          >
            <option value="" disabled>{{ mixedMaterial ? '统一' : '混合值' }}</option>
            <option v-for="m in MATERIAL_PRESETS" :key="m.key" :value="m.key">{{ m.label }}</option>
          </select>
        </div>

        <!-- 增量变换（共同中心） -->
        <div class="mb-1 grid grid-cols-3 gap-1.5">
          <template v-for="cfg in TRANSFORM_FIELDS" :key="cfg.label">
            <label class="text-surface-800/45 block text-[9px]">Δ {{ cfg.label }}</label>
            <input
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-1.5 py-1 text-[11px] tabular-nums outline-none"
              type="number"
              step="0.1"
              :placeholder="
                mixedTransformValue(cfg.key, cfg.axis) === null
                  ? '混合'
                  : String(mixedTransformValue(cfg.key, cfg.axis))
              "
              :aria-label="`批量增量 ${cfg.label}`"
              @change="
                (e: Event) =>
                  batchDeltaInput(
                    cfg.key === 'position' ? 'move' : cfg.key === 'rotation' ? 'rotate' : 'scale',
                    cfg.axis,
                    (e.target as HTMLInputElement).value,
                  )
              "
            />
          </template>
        </div>
        <p class="text-surface-800/40 text-[9px]">
          增量变换以选中集共同中心为基准（旋转 / 缩放同步调整位置偏移）。
        </p>
      </section>

      <!-- ============ 资产属性（单资产） ============ -->
      <section v-else-if="asset" aria-label="资产属性">
        <h3 class="text-surface-800/50 mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
          资产属性 · {{ asset.type === 'light' ? '灯光' : ASSET_TYPE_NAME(asset.type) }}
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
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 ml-auto rounded-md px-1.5 py-0.5 text-[9px] transition-colors"
            aria-label="重置资产到默认配置"
            title="重置变换 / 颜色 / 材质"
            @click="resetAssetDefaults"
          >
            重置默认
          </button>
        </div>

        <!-- 灯光参数 -->
        <template v-if="asset.type === 'light' && light">
          <p class="text-surface-800/50 mb-1 text-[10px] font-semibold">灯光</p>
          <div class="mb-2 grid grid-cols-2 gap-1.5">
            <label class="block">
              <span class="text-surface-800/60 mb-0.5 block text-[9px]">种类</span>
              <select
                class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-1.5 py-1 text-[10px] outline-none"
                :value="light.kind"
                aria-label="灯光种类"
                @change="(e: Event) => setLightKind((e.target as HTMLSelectElement).value)"
              >
                <option v-for="k in LIGHT_KINDS" :key="k.key" :value="k.key">{{ k.label }}</option>
              </select>
            </label>
            <label class="flex items-end pb-1">
              <span class="text-surface-800/70 flex items-center gap-1 text-[10px]">
                <input
                  type="checkbox"
                  class="accent-brand-500"
                  :checked="light.enabled"
                  aria-label="启用灯光"
                  @change="patchLight({ enabled: !light.enabled })"
                />
                启用
              </span>
            </label>
          </div>
          <div class="mb-2 flex items-center gap-1.5">
            <input
              type="color"
              class="border-surface-200 size-6 cursor-pointer rounded border bg-transparent p-0.5"
              :value="light.color"
              :aria-label="`灯光颜色 ${light.color}`"
              @change="(e: Event) => patchLight({ color: (e.target as HTMLInputElement).value })"
            />
            <input
              type="range"
              class="accent-brand-500 h-1 min-w-0 flex-1"
              min="0"
              max="5"
              step="0.1"
              :value="light.intensity"
              aria-label="灯光强度"
              @input="
                (e: Event) =>
                  patchLight({ intensity: Number((e.target as HTMLInputElement).value) })
              "
            />
            <span class="text-surface-800/50 w-8 text-right text-[10px] tabular-nums">{{
              light.intensity.toFixed(1)
            }}</span>
          </div>
          <div class="mb-2 flex items-center gap-1.5">
            <label class="text-surface-800/60 flex items-center gap-1 text-[10px]">
              色温 K
              <input
                class="border-surface-100 bg-surface-50 text-surface-900 w-16 rounded-md border px-1 py-0.5 text-[10px] outline-none"
                type="number"
                min="1500"
                max="12000"
                step="100"
                :value="light.temperature ?? ''"
                :placeholder="light.temperature === null ? '使用颜色' : ''"
                aria-label="灯光色温"
                @change="
                  (e: Event) => {
                    const v = (e.target as HTMLInputElement).value;
                    patchLight({ temperature: v ? Number(v) : null });
                  }
                "
              />
            </label>
            <label class="text-surface-800/60 flex items-center gap-1 text-[10px]">
              <input
                type="checkbox"
                class="accent-brand-500"
                :checked="light.shadowEnabled"
                aria-label="灯光投射阴影"
                @change="patchLight({ shadowEnabled: !light.shadowEnabled })"
              />
              阴影
            </label>
          </div>
          <div
            v-if="light.kind === 'point' || light.kind === 'spot'"
            class="mb-1 grid grid-cols-2 gap-1.5"
          >
            <label class="block">
              <span class="text-surface-800/60 mb-0.5 block text-[9px]">范围</span>
              <input
                class="border-surface-100 bg-surface-50 text-surface-900 w-full rounded-md border px-1.5 py-1 text-[10px] outline-none"
                type="number"
                min="0"
                step="0.5"
                :value="light.range"
                aria-label="灯光范围"
                @change="
                  (e: Event) => patchLight({ range: Number((e.target as HTMLInputElement).value) })
                "
              />
            </label>
            <label v-if="light.kind === 'spot'" class="block">
              <span class="text-surface-800/60 mb-0.5 block text-[9px]">锥角 °</span>
              <input
                class="border-surface-100 bg-surface-50 text-surface-900 w-full rounded-md border px-1.5 py-1 text-[10px] outline-none"
                type="number"
                min="0"
                max="90"
                step="1"
                :value="light.angle"
                aria-label="聚光灯锥角"
                @change="
                  (e: Event) => patchLight({ angle: Number((e.target as HTMLInputElement).value) })
                "
              />
            </label>
          </div>
        </template>

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

        <!-- 材质预设 + 受控参数 -->
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
        <template v-if="store.ui.materialPreview && materialParams">
          <div class="mt-1.5 space-y-1">
            <label class="flex items-center gap-2 text-[10px]">
              <span class="text-surface-800/60 w-12 shrink-0">粗糙度</span>
              <input
                type="range"
                class="accent-brand-500 h-1 min-w-0 flex-1"
                min="0"
                max="1"
                step="0.01"
                :value="materialParams.roughness"
                :aria-label="`粗糙度 ${materialParams.roughness}`"
                @input="
                  (e: Event) => setMaterialParam('roughness', (e.target as HTMLInputElement).value)
                "
              />
              <span class="text-surface-800/50 w-8 text-right text-[10px] tabular-nums">{{
                materialParams.roughness.toFixed(2)
              }}</span>
            </label>
            <label class="flex items-center gap-2 text-[10px]">
              <span class="text-surface-800/60 w-12 shrink-0">金属度</span>
              <input
                type="range"
                class="accent-brand-500 h-1 min-w-0 flex-1"
                min="0"
                max="1"
                step="0.01"
                :value="materialParams.metalness"
                :aria-label="`金属度 ${materialParams.metalness}`"
                @input="
                  (e: Event) => setMaterialParam('metalness', (e.target as HTMLInputElement).value)
                "
              />
              <span class="text-surface-800/50 w-8 text-right text-[10px] tabular-nums">{{
                materialParams.metalness.toFixed(2)
              }}</span>
            </label>
            <label class="flex items-center gap-2 text-[10px]">
              <span class="text-surface-800/60 w-12 shrink-0">透明度</span>
              <input
                type="range"
                class="accent-brand-500 h-1 min-w-0 flex-1"
                min="0"
                max="1"
                step="0.01"
                :value="materialParams.opacity"
                :aria-label="`透明度 ${materialParams.opacity}`"
                @input="
                  (e: Event) => setMaterialParam('opacity', (e.target as HTMLInputElement).value)
                "
              />
              <span class="text-surface-800/50 w-8 text-right text-[10px] tabular-nums">{{
                materialParams.opacity.toFixed(2)
              }}</span>
            </label>
            <label class="flex items-center gap-2 text-[10px]">
              <span class="text-surface-800/60 w-12 shrink-0">发光</span>
              <input
                type="range"
                class="accent-brand-500 h-1 min-w-0 flex-1"
                min="0"
                max="5"
                step="0.05"
                :value="materialParams.emissiveIntensity"
                :aria-label="`发光强度 ${materialParams.emissiveIntensity}`"
                @input="
                  (e: Event) =>
                    setMaterialParam('emissiveIntensity', (e.target as HTMLInputElement).value)
                "
              />
              <span class="text-surface-800/50 w-8 text-right text-[10px] tabular-nums">{{
                materialParams.emissiveIntensity.toFixed(2)
              }}</span>
            </label>
          </div>
          <p class="text-surface-800/35 mt-0.5 text-[9px]">受控参数已归一化（0-1 / 0-5）</p>
        </template>

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
          <div class="mb-2 grid grid-cols-2 gap-1.5">
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[10px]">代号</span>
              <input
                class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
                :value="character.codename"
                aria-label="角色代号"
                @change="
                  (e: Event) =>
                    store.updateCharacterFields({ codename: (e.target as HTMLInputElement).value })
                "
              />
            </label>
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[10px]">年龄段</span>
              <select
                class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
                :value="character.ageGroup"
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
          </div>
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
              <span class="text-surface-800/60 mb-1 block text-[10px]">体型</span>
              <select
                class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
                :value="character.bodyType"
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
                :value="character.style"
                aria-label="角色风格"
                @change="
                  (e: Event) =>
                    store.updateCharacterFields({ style: (e.target as HTMLInputElement).value })
                "
              />
            </label>
          </div>
          <label class="text-surface-800/60 mb-1 block text-[10px]">个性关键词</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="character.personalityKeywords"
            aria-label="个性关键词"
            @change="
              (e: Event) =>
                store.updateCharacterFields({
                  personalityKeywords: (e.target as HTMLInputElement).value,
                })
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
                    store.setPoseAction(
                      (e.target as HTMLSelectElement).value as Parameters<
                        typeof store.setPoseAction
                      >[0],
                    )
                "
              >
                <option v-for="p in POSE_OPTIONS" :key="p.key" :value="p.key">
                  {{ p.label }}（{{ p.hint }}）
                </option>
              </select>
            </label>
          </div>
          <div class="mb-2 grid grid-cols-3 gap-1.5">
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[10px]">头部比例</span>
              <input
                class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-1.5 py-1 text-[11px] outline-none"
                type="number"
                min="0.5"
                max="2"
                step="0.05"
                :value="character.headRatio"
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
                :value="character.shoulderWidth"
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
                :value="character.legLength"
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
          <div class="mb-2 grid grid-cols-2 gap-1.5">
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[10px]">主色</span>
              <input
                type="color"
                class="border-surface-200 size-7 cursor-pointer rounded border bg-transparent p-0.5"
                :value="character.primaryColor"
                aria-label="角色主色"
                @change="
                  (e: Event) =>
                    store.updateCharacterFields({
                      primaryColor: (e.target as HTMLInputElement).value,
                    })
                "
              />
            </label>
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[10px]">辅色</span>
              <input
                type="color"
                class="border-surface-200 size-7 cursor-pointer rounded border bg-transparent p-0.5"
                :value="character.secondaryColor"
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
          <label class="text-surface-800/60 mb-1 block text-[10px]">装备关键词</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="character.equipmentKeywords"
            aria-label="装备关键词"
            @change="
              (e: Event) =>
                store.updateCharacterFields({
                  equipmentKeywords: (e.target as HTMLInputElement).value,
                })
            "
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
          <div class="mb-2 grid grid-cols-2 gap-1.5">
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[10px]">时代 / 风格</span>
              <input
                class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
                :value="world.eraStyle"
                aria-label="时代风格"
                @change="
                  (e: Event) =>
                    store.updateWorldFields({ eraStyle: (e.target as HTMLInputElement).value })
                "
              />
            </label>
            <label class="block">
              <span class="text-surface-800/60 mb-1 block text-[10px]">地点</span>
              <input
                class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
                :value="world.location"
                aria-label="地点"
                @change="
                  (e: Event) =>
                    store.updateWorldFields({ location: (e.target as HTMLInputElement).value })
                "
              />
            </label>
          </div>
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
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
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
          <label class="text-surface-800/60 mb-1 block text-[10px]">镜头语言</label>
          <input
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-lg border px-2 py-1 text-[11px] outline-none"
            :value="world.shotLanguage"
            aria-label="镜头语言"
            @change="
              (e: Event) =>
                store.updateWorldFields({ shotLanguage: (e.target as HTMLInputElement).value })
            "
          />
          <p v-if="project.regions.length > 0" class="text-surface-800/40 mt-2 text-[10px]">
            已规划 {{ project.regions.length }} 个区域 ·
            {{ project.shots.length }} 个镜头（见分镜板）
          </p>
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

        <!-- 环境预设 -->
        <div class="mb-2">
          <label class="text-surface-800/60 mb-1 block text-[10px]">环境预设（可撤销）</label>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="ep in ENVIRONMENT_PRESETS"
              :key="ep.id"
              class="hover:bg-surface-100 rounded-md border px-2 py-1 text-[9px] transition-colors"
              :class="
                envPreset === ep.id
                  ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                  : 'border-surface-100 text-surface-800/60 hover:text-surface-900'
              "
              :aria-pressed="envPreset === ep.id"
              :title="ep.description"
              @click="applyEnvPreset(ep.id)"
            >
              {{ ep.name }}
            </button>
          </div>
          <div class="mt-1.5 flex items-center gap-1.5">
            <input
              v-model="envCustomName"
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 min-w-0 flex-1 rounded-md border px-2 py-1 text-[10px] outline-none"
              :placeholder="envPreset === 'custom' ? '当前为自定义环境' : '自定义环境名称'"
              aria-label="自定义环境名称"
            />
            <button
              class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 shrink-0 rounded-md px-2 py-1 text-[10px] transition-colors"
              aria-label="保存为项目自定义环境"
              @click="store.saveCustomEnvironmentAction(envCustomName || '自定义环境')"
            >
              保存自定义
            </button>
          </div>
          <p class="text-surface-800/35 mt-0.5 text-[9px]">
            {{ envPreset === 'custom' ? '自定义环境（基于当前场景设置）' : '预设已应用，可撤销' }}
          </p>
        </div>

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
