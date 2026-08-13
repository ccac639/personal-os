<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台资产面板（左侧）
 *
 * 三个标签页：
 * - 资产树：group 展开/折叠、拖拽排序与拖入组合（阻止循环 parent）、多选
 *   （Ctrl 切换 / Shift 范围）、类型 / 显隐 / 锁定 / 子项数 / 选中 / 错误状态、
 *   批量操作条（显隐 / 锁定 / 删除 / 分组 / 改色 / 重置变换 / 按类型选择 / 反选）。
 * - 预设库：内置 + 个人资产预设，搜索 / 分类 / 收藏 / 插入 / 保存选择为预设。
 * - 区域（world）：区域 CRUD、危险等级、按区域过滤资产。
 */
import {
  BoxSelect,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Filter,
  FolderTree,
  Layers,
  Lock,
  LockOpen,
  Map,
  Package,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shuffle,
  Star,
  Trash2,
  Ungroup,
  X,
} from '@lucide/vue';
import { computed, ref } from 'vue';

import { ASSET_TYPE_LABELS, COLOR_SWATCHES, PRIMITIVE_KINDS } from '../constants';
import { ASSET_PRESET_CATEGORIES, BUILTIN_ASSET_PRESETS } from '../presets';
import { useThreeDWorkspaceStore } from '../store';
import type { AssetPreset, PrimitiveKind, ThreeDAsset, ThreeDRegion } from '../types';

const store = useThreeDWorkspaceStore();

const addMenuOpen = ref(false);
const expanded = ref<Set<string>>(new Set());
const regionEditing = ref<string | null>(null);
const regionDraft = ref<ThreeDRegion | null>(null);
const presetName = ref('');
const presetCategory = ref('自定义');
const presetSaveOpen = ref(false);
const dragId = ref<string | null>(null);
const dragOverId = ref<string | null>(null);
const dragOverTop = ref(false);

const project = computed(() => store.activeProject);

const query = computed({
  get: () => store.ui.assetQuery,
  set: (v: string) => {
    store.ui.assetQuery = v;
  },
});

const panelTab = computed({
  get: () => store.ui.assetPanelTab,
  set: (v: 'tree' | 'library' | 'regions') => {
    store.ui.assetPanelTab = v;
  },
});

const libraryQuery = computed({
  get: () => store.ui.assetLibraryQuery,
  set: (v: string) => {
    store.ui.assetLibraryQuery = v;
  },
});

const libraryCategory = computed({
  get: () => store.ui.assetLibraryCategory,
  set: (v: string) => {
    store.ui.assetLibraryCategory = v;
  },
});

const regionFilter = computed({
  get: () => store.ui.regionFilter,
  set: (v: string | null) => {
    store.setRegionFilter(v);
  },
});

/* ---------- 资产树 ---------- */

interface TreeNode {
  asset: ThreeDAsset;
  depth: number;
  hasChildren: boolean;
  error: boolean;
}

function treeNodeError(a: ThreeDAsset): boolean {
  const p = project.value;
  if (!p) return false;
  // 错误状态：父资产不存在（孤儿）或自身类型与内容不一致
  if (a.parentId && !p.assets.some((x) => x.id === a.parentId)) return true;
  if (a.type === 'light' && !a.light) return true;
  return false;
}

/** 区域过滤：仅显示区域内资产及其祖先 */
function inRegionFilter(a: ThreeDAsset): boolean {
  const p = project.value;
  const filter = store.ui.regionFilter;
  if (!p || !filter) return true;
  const region = p.regions.find((r) => r.id === filter);
  if (!region) return true;
  if (region.assetIds.includes(a.id)) return true;
  // 祖先在区域内
  let cursorId = a.parentId ?? null;
  while (cursorId) {
    const cursor = p.assets.find((x) => x.id === cursorId);
    if (!cursor) break;
    if (region.assetIds.includes(cursor.id)) return true;
    cursorId = cursor.parentId ?? null;
  }
  return false;
}

const visibleRoots = computed<TreeNode[]>(() => {
  const p = project.value;
  if (!p) return [];
  const q = query.value.trim().toLowerCase();
  const roots = p.assets.filter((a) => !a.parentId);
  const result: TreeNode[] = [];
  const match = (a: ThreeDAsset) =>
    q.length === 0 ||
    a.name.toLowerCase().includes(q) ||
    a.tags.some((t) => t.toLowerCase().includes(q)) ||
    a.notes.toLowerCase().includes(q);
  const walk = (list: ThreeDAsset[], depth: number) => {
    for (const a of list) {
      if (!inRegionFilter(a)) continue;
      if (match(a)) {
        result.push({
          asset: a,
          depth,
          hasChildren: p.assets.some((c) => c.parentId === a.id),
          error: treeNodeError(a),
        });
      }
      if (expanded.value.has(a.id) || q.length > 0) {
        const children = p.assets.filter((c) => c.parentId === a.id);
        if (children.length > 0) walk(children, depth + 1);
      }
    }
  };
  walk(roots, 0);
  return result;
});

const flatIds = computed(() => visibleRoots.value.map((n) => n.asset.id));
const selectionCount = computed(() => project.value?.selectedAssetIds.length ?? 0);

function isSelected(id: string): boolean {
  const p = project.value;
  if (!p) return false;
  return p.selectedAssetIds.includes(id) || p.activeAssetId === id;
}

function onRowClick(a: ThreeDAsset, e: MouseEvent) {
  if (a.locked && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    store.selectAsset(a.id);
    return;
  }
  if (e.ctrlKey || e.metaKey) {
    store.selectAsset(a.id, { additive: true });
    return;
  }
  if (e.shiftKey) {
    store.selectAsset(a.id, { range: true, rangeIds: flatIds.value });
    return;
  }
  store.selectAsset(a.id);
}

function toggleExpand(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

/* ---------- 拖拽 ---------- */

function onDragStart(id: string) {
  dragId.value = id;
  dragOverId.value = null;
  dragOverTop.value = false;
}

function onDragEnd() {
  dragId.value = null;
  dragOverId.value = null;
  dragOverTop.value = false;
}

function onDropOnRow(targetId: string) {
  const sourceId = dragId.value;
  dragId.value = null;
  dragOverId.value = null;
  dragOverTop.value = false;
  if (!sourceId || sourceId === targetId) return;
  const p = project.value;
  if (!p) return;
  const source = p.assets.find((a) => a.id === sourceId);
  const target = p.assets.find((a) => a.id === targetId);
  if (!source || !target) return;
  const sourceParent = source.parentId ?? null;
  // 拖到组容器：移入（若目标有子项则排到末尾）
  if (target.type === 'group') {
    store.moveAssetsToParent([sourceId], target.id);
    expanded.value.add(target.id);
    return;
  }
  // 同级排序：把 source 移到 target 位置
  if (sourceParent === (target.parentId ?? null)) {
    const siblings = p.assets.filter((a) => (a.parentId ?? null) === sourceParent);
    const nextOrder = siblings.map((a) => a.id).filter((id) => id !== sourceId);
    const targetIdx = nextOrder.indexOf(targetId);
    nextOrder.splice(targetIdx >= 0 ? targetIdx : nextOrder.length, 0, sourceId);
    store.reorderInParent(sourceParent, nextOrder);
    return;
  }
  // 不同父级：移动到目标父级并排到目标后
  const ok = store.moveAssetsToParent([sourceId], target.parentId ?? null);
  if (ok) {
    const siblings = p.assets.filter((a) => (a.parentId ?? null) === (target.parentId ?? null));
    const nextOrder = siblings.map((a) => a.id).filter((id) => id !== sourceId);
    const targetIdx = nextOrder.indexOf(targetId);
    nextOrder.splice(targetIdx >= 0 ? targetIdx : nextOrder.length, 0, sourceId);
    store.reorderInParent(target.parentId ?? null, nextOrder);
  }
}

function onDropTopLevel() {
  const sourceId = dragId.value;
  dragId.value = null;
  dragOverId.value = null;
  dragOverTop.value = false;
  if (!sourceId) return;
  const p = project.value;
  if (!p) return;
  if (p.assets.find((a) => a.id === sourceId)?.parentId) {
    store.moveAssetsToParent([sourceId], null);
  }
}

/* ---------- 新增 ---------- */

function addPrimitive(kind: PrimitiveKind) {
  store.addAsset({ type: 'primitive', primitiveKind: kind });
  addMenuOpen.value = false;
}

function addPlaceholder(kind: 'character-placeholder' | 'world-placeholder') {
  store.addAsset({ type: kind });
  addMenuOpen.value = false;
}

function addLight() {
  store.addAsset({ type: 'light' });
  addMenuOpen.value = false;
}

function addGroup() {
  store.createGroupAction();
  addMenuOpen.value = false;
}

function childCount(id: string): number {
  const p = project.value;
  if (!p) return 0;
  return p.assets.filter((a) => a.parentId === id).length;
}

/* ---------- 预设库 ---------- */

const libraryPresets = computed(() => {
  const q = libraryQuery.value.trim().toLowerCase();
  const cat = libraryCategory.value;
  const all = [...BUILTIN_ASSET_PRESETS, ...store.presets];
  return all.filter((p) => {
    if (cat === 'favorite' && !p.favorite) return false;
    if (cat !== 'all' && cat !== 'favorite' && p.category !== cat) return false;
    if (q.length === 0) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.keywords.some((k) => k.toLowerCase().includes(q))
    );
  });
});

function insertPreset(p: AssetPreset) {
  // 简单防重叠：按已插入数量偏移
  const count =
    project.value?.assets.filter((a) => a.notes.includes(`来自预设「${p.name}」`)).length ?? 0;
  store.insertPresetAction(p.id, [count * 1.6, 0, 0]);
}

function confirmSavePreset() {
  store.saveSelectionAsPreset(presetName.value, presetCategory.value);
  presetName.value = '';
  presetSaveOpen.value = false;
}

/* ---------- 区域 ---------- */

function startEditRegion(r: ThreeDRegion) {
  regionEditing.value = r.id;
  regionDraft.value = { ...r, center: [...r.center], size: [...r.size], assetIds: [...r.assetIds] };
}

function cancelEditRegion() {
  regionEditing.value = null;
  regionDraft.value = null;
}

function saveEditRegion() {
  const id = regionEditing.value;
  const draft = regionDraft.value;
  if (!id || !draft) return;
  store.updateRegionAction(id, {
    name: draft.name || '新区域',
    purpose: draft.purpose ?? '',
    style: draft.style ?? '',
    dangerLevel: draft.dangerLevel ?? 0,
    description: draft.description ?? '',
    color: draft.color ?? '#3b82f6',
    assetIds: draft.assetIds ?? [],
  });
  regionEditing.value = null;
  regionDraft.value = null;
}

function toggleAssetInRegion(regionId: string, assetId: string) {
  const draft = regionDraft.value;
  if (!draft) return;
  const ids = new Set(draft.assetIds ?? []);
  if (ids.has(assetId)) ids.delete(assetId);
  else ids.add(assetId);
  draft.assetIds = [...ids];
}
</script>

<template>
  <aside
    class="border-surface-100 bg-surface-0/60 flex h-full w-64 shrink-0 flex-col border-r"
    aria-label="资产面板"
  >
    <!-- 头部：标签页 -->
    <div class="border-surface-100 flex h-10 shrink-0 items-center gap-0.5 border-b px-1.5">
      <button
        class="flex flex-1 items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] font-medium transition-colors"
        :class="
          panelTab === 'tree'
            ? 'bg-surface-100 text-surface-900'
            : 'text-surface-800/50 hover:text-surface-900'
        "
        :aria-pressed="panelTab === 'tree'"
        @click="panelTab = 'tree'"
      >
        <Layers class="size-3" />
        资产
      </button>
      <button
        class="flex flex-1 items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] font-medium transition-colors"
        :class="
          panelTab === 'library'
            ? 'bg-surface-100 text-surface-900'
            : 'text-surface-800/50 hover:text-surface-900'
        "
        :aria-pressed="panelTab === 'library'"
        @click="panelTab = 'library'"
      >
        <Package class="size-3" />
        预设
      </button>
      <button
        v-if="project?.type === 'world'"
        class="flex flex-1 items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] font-medium transition-colors"
        :class="
          panelTab === 'regions'
            ? 'bg-surface-100 text-surface-900'
            : 'text-surface-800/50 hover:text-surface-900'
        "
        :aria-pressed="panelTab === 'regions'"
        @click="panelTab = 'regions'"
      >
        <Map class="size-3" />
        区域
      </button>
    </div>

    <!-- ============ 资产树 ============ -->
    <template v-if="panelTab === 'tree'">
      <div
        class="border-surface-100 focus-within:border-brand-500 bg-surface-50 m-2 flex items-center gap-1.5 rounded-lg border px-2 transition-colors"
      >
        <Search class="text-surface-800/40 size-3.5 shrink-0" />
        <input
          v-model="query"
          class="h-7 w-full min-w-0 bg-transparent text-xs outline-none"
          placeholder="搜索资产 / 标签 / 备注"
          aria-label="搜索资产"
        />
      </div>

      <!-- 新增资产 -->
      <div class="relative shrink-0 px-2 pb-1.5">
        <div class="flex flex-wrap gap-1">
          <button
            v-for="kind in PRIMITIVE_KINDS.slice(0, 3)"
            :key="kind.key"
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            :aria-label="`新增${kind.label}`"
            :title="`新增${kind.label}`"
            @click="addPrimitive(kind.key)"
          >
            {{ kind.label }}
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="新增角色占位"
            title="新增角色占位（基础形体）"
            @click="addPlaceholder('character-placeholder')"
          >
            角色占位
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="新增世界占位"
            title="新增世界占位"
            @click="addPlaceholder('world-placeholder')"
          >
            世界占位
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            :aria-expanded="addMenuOpen"
            aria-label="更多资产类型"
            @click="addMenuOpen = !addMenuOpen"
          >
            <Plus class="size-3" />
            更多
          </button>
        </div>
        <div
          v-if="addMenuOpen"
          class="bg-surface-0 shadow-float border-surface-100 absolute top-8 left-0 z-20 w-40 rounded-lg border p-1"
        >
          <button
            v-for="kind in PRIMITIVE_KINDS.slice(3)"
            :key="kind.key"
            class="hover:bg-surface-100 text-surface-800/70 w-full rounded-md px-2 py-1.5 text-left text-[11px] transition-colors"
            @click="addPrimitive(kind.key)"
          >
            {{ kind.label }}
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/70 w-full rounded-md px-2 py-1.5 text-left text-[11px] transition-colors"
            @click="addLight"
          >
            灯光标记
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/70 w-full rounded-md px-2 py-1.5 text-left text-[11px] transition-colors"
            @click="addGroup"
          >
            组合（分组）
          </button>
        </div>
      </div>

      <!-- 批量操作条 -->
      <div
        v-if="selectionCount > 0"
        class="border-surface-100 bg-brand-500/5 shrink-0 border-y px-2 py-1"
        role="toolbar"
        aria-label="批量操作"
      >
        <div class="mb-1 flex items-center gap-1">
          <span class="text-surface-800/60 flex-1 text-[10px] font-medium"
            >{{ selectionCount }} 项已选</span
          >
          <button
            class="hover:bg-surface-100 text-surface-800/50 hover:text-surface-900 flex size-5 items-center justify-center rounded"
            aria-label="按类型选择同类型资产"
            title="按类型选择"
            @click="store.selectByActiveType()"
          >
            <BoxSelect class="size-3" />
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/50 hover:text-surface-900 flex size-5 items-center justify-center rounded"
            aria-label="反选"
            title="反选顶层资产"
            @click="store.invertSelectionAction()"
          >
            <Shuffle class="size-3" />
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/50 hover:text-surface-900 flex size-5 items-center justify-center rounded"
            aria-label="清空选择"
            title="清空选择"
            @click="store.clearSelection()"
          >
            <X class="size-3" />
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-1">
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 rounded-md px-1.5 py-0.5 text-[10px]"
            aria-label="批量隐藏"
            title="隐藏选中"
            @click="store.batchVisibleAction(false)"
          >
            <EyeOff class="size-3" />
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 rounded-md px-1.5 py-0.5 text-[10px]"
            aria-label="批量锁定"
            title="锁定选中"
            @click="store.batchLockedAction(true)"
          >
            <Lock class="size-3" />
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 rounded-md px-1.5 py-0.5 text-[10px]"
            aria-label="组合选中资产"
            title="组合选中"
            @click="store.batchGroupSelected()"
          >
            <FolderTree class="size-3" />
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 rounded-md px-1.5 py-0.5 text-[10px]"
            aria-label="重置选中资产变换"
            title="重置变换"
            @click="store.batchResetSelected()"
          >
            <RotateCcw class="size-3" />
          </button>
          <button
            class="hover:bg-surface-100 rounded-md px-1.5 py-0.5 text-[10px] text-red-500/70 hover:text-red-600"
            aria-label="批量删除"
            title="删除选中"
            @click="store.batchDeleteSelected()"
          >
            <Trash2 class="size-3" />
          </button>
          <span
            v-for="c in COLOR_SWATCHES.slice(0, 8)"
            :key="c"
            class="size-3 cursor-pointer rounded-sm border border-black/10"
            :style="{ background: c }"
            role="button"
            tabindex="0"
            :aria-label="`批量设置颜色 ${c}`"
            :title="`改色 ${c}`"
            @click="store.batchColorSelected(c)"
            @keydown.enter="store.batchColorSelected(c)"
          />
        </div>
      </div>

      <!-- 资产树 -->
      <div class="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        <div
          v-if="visibleRoots.length === 0"
          class="text-surface-800/40 px-3 py-6 text-center text-[11px]"
        >
          {{ query ? '没有匹配的资产' : '还没有资产，从上方新增' }}
        </div>
        <div
          v-if="project"
          class="rounded-md border border-dashed py-1 text-center text-[9px]"
          :class="
            dragOverTop
              ? 'border-brand-500 bg-brand-500/10 text-brand-600'
              : 'text-surface-800/30 border-transparent'
          "
          data-testid="tree-drop-top"
          @dragover.prevent="dragOverTop = true"
          @dragleave="dragOverTop = false"
          @drop.prevent="onDropTopLevel"
        >
          拖到此处移动到顶层
        </div>
        <div
          v-for="node in visibleRoots"
          :key="node.asset.id"
          class="group flex items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors"
          :class="[
            isSelected(node.asset.id) ? 'bg-brand-500/10 text-brand-700' : 'hover:bg-surface-100',
            node.asset.locked ? 'opacity-60' : '',
            dragOverId === node.asset.id ? 'ring-brand-500 ring-1' : '',
          ]"
          :style="{ paddingLeft: `${6 + node.depth * 13}px` }"
          draggable="true"
          @dragstart="onDragStart(node.asset.id)"
          @dragend="onDragEnd"
          @dragover.prevent="dragOverId = node.asset.id"
          @dragleave="dragOverId === node.asset.id ? (dragOverId = null) : null"
          @drop.prevent="onDropOnRow(node.asset.id)"
        >
          <button
            v-if="node.hasChildren"
            class="text-surface-800/40 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-4 shrink-0 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none"
            :aria-label="
              expanded.has(node.asset.id) ? `折叠 ${node.asset.name}` : `展开 ${node.asset.name}`
            "
            @click.stop="toggleExpand(node.asset.id)"
          >
            <ChevronDown v-if="expanded.has(node.asset.id)" class="size-3" />
            <ChevronRight v-else class="size-3" />
          </button>
          <span v-else class="size-4 shrink-0" aria-hidden="true" />
          <button
            class="focus-visible:ring-brand-500/40 min-w-0 flex-1 rounded text-left focus-visible:ring-2 focus-visible:outline-none"
            :aria-label="`选择资产 ${node.asset.name}`"
            :aria-current="isSelected(node.asset.id)"
            @click="onRowClick(node.asset, $event)"
          >
            <span class="flex items-center gap-1.5">
              <span
                class="size-2.5 shrink-0 rounded-sm border"
                :style="{
                  background: node.asset.color,
                  borderColor: 'color-mix(in srgb, ' + node.asset.color + ' 55%, #000)',
                }"
                aria-hidden="true"
              />
              <span class="truncate text-[11px] font-medium">{{ node.asset.name }}</span>
              <span
                v-if="node.hasChildren"
                class="text-surface-800/35 shrink-0 text-[9px] tabular-nums"
                :aria-label="`${childCount(node.asset.id)} 个子项`"
                >{{ childCount(node.asset.id) }}</span
              >
              <span
                v-if="node.error"
                class="shrink-0 text-[9px] text-red-500"
                title="资产数据异常（父级缺失或内容不一致）"
                aria-label="资产数据异常"
                >⚠</span
              >
            </span>
            <span class="text-surface-800/40 truncate text-[9px]">{{
              ASSET_TYPE_LABELS[node.asset.type]
            }}</span>
          </button>

          <button
            class="hover:bg-surface-100 text-surface-800/45 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-5 shrink-0 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
            :aria-label="node.asset.visible ? `隐藏 ${node.asset.name}` : `显示 ${node.asset.name}`"
            :title="node.asset.visible ? '隐藏' : '显示'"
            @click.stop="store.toggleAssetVisible(node.asset.id)"
          >
            <EyeOff v-if="!node.asset.visible" class="size-3" />
            <Eye v-else class="size-3" />
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/45 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-5 shrink-0 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
            :aria-label="node.asset.locked ? `解锁 ${node.asset.name}` : `锁定 ${node.asset.name}`"
            :title="node.asset.locked ? '解锁' : '锁定'"
            @click.stop="store.toggleAssetLocked(node.asset.id)"
          >
            <LockOpen v-if="node.asset.locked" class="size-3" />
            <Lock v-else class="size-3" />
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/45 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-5 shrink-0 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
            :aria-label="`复制 ${node.asset.name}`"
            title="复制"
            @click.stop="store.copyAsset(node.asset.id)"
          >
            <Copy class="size-3" />
          </button>
          <button
            v-if="node.asset.type === 'group'"
            class="hover:bg-surface-100 text-surface-800/45 focus-visible:ring-brand-500/40 flex size-5 shrink-0 items-center justify-center rounded transition-colors hover:text-red-600 focus-visible:ring-2 focus-visible:outline-none"
            :aria-label="`删除组合 ${node.asset.name}（保留子项）`"
            title="删除组合（保留子项提升到父级）"
            @click.stop="store.deleteGroupAction(node.asset.id, 'promote')"
          >
            <Ungroup class="size-3" />
          </button>
          <button
            class="hover:bg-surface-100 flex size-5 shrink-0 items-center justify-center rounded text-red-500/70 transition-colors hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:outline-none"
            :aria-label="`删除 ${node.asset.name}${node.hasChildren ? '（含子项）' : ''}`"
            :title="node.hasChildren ? '删除（连同子项）' : '删除'"
            @click.stop="store.removeAsset(node.asset.id)"
          >
            <Trash2 class="size-3" />
          </button>
        </div>
      </div>
    </template>

    <!-- ============ 预设库 ============ -->
    <template v-else-if="panelTab === 'library'">
      <div
        class="border-surface-100 focus-within:border-brand-500 bg-surface-50 m-2 flex items-center gap-1.5 rounded-lg border px-2 transition-colors"
      >
        <Search class="text-surface-800/40 size-3.5 shrink-0" />
        <input
          v-model="libraryQuery"
          class="h-7 w-full min-w-0 bg-transparent text-xs outline-none"
          placeholder="搜索预设"
          aria-label="搜索预设"
        />
      </div>
      <div class="flex flex-wrap gap-1 px-2 pb-1.5">
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 rounded-md px-2 py-0.5 text-[10px]"
          :class="libraryCategory === 'all' ? 'bg-surface-100 text-surface-900' : ''"
          :aria-pressed="libraryCategory === 'all'"
          @click="libraryCategory = 'all'"
        >
          全部
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 rounded-md px-2 py-0.5 text-[10px]"
          :class="libraryCategory === 'favorite' ? 'bg-surface-100 text-surface-900' : ''"
          :aria-pressed="libraryCategory === 'favorite'"
          @click="libraryCategory = 'favorite'"
        >
          ★ 收藏
        </button>
        <button
          v-for="cat in ASSET_PRESET_CATEGORIES"
          :key="cat"
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 rounded-md px-2 py-0.5 text-[10px]"
          :class="libraryCategory === cat ? 'bg-surface-100 text-surface-900' : ''"
          :aria-pressed="libraryCategory === cat"
          @click="libraryCategory = cat"
        >
          {{ cat }}
        </button>
      </div>

      <div class="px-2 pb-2">
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="将选中资产保存为个人预设"
          :disabled="selectionCount === 0"
          @click="presetSaveOpen = true"
        >
          <Save class="size-3" />
          保存选中为预设
        </button>
      </div>
      <div
        v-if="presetSaveOpen"
        class="border-surface-100 bg-surface-0 shadow-float absolute top-16 left-2 z-30 w-56 rounded-lg border p-2"
        role="dialog"
        aria-label="保存为个人预设"
      >
        <label class="text-surface-800/60 mb-1 block text-[10px]">预设名称</label>
        <input
          v-model="presetName"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-1.5 w-full rounded-md border px-2 py-1 text-[11px] outline-none"
          aria-label="预设名称"
          placeholder="例如：瞭望塔"
        />
        <label class="text-surface-800/60 mb-1 block text-[10px]">分类</label>
        <select
          v-model="presetCategory"
          class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-md border px-2 py-1 text-[11px] outline-none"
          aria-label="预设分类"
        >
          <option value="自定义">自定义</option>
          <option v-for="cat in ASSET_PRESET_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
        </select>
        <div class="flex justify-end gap-1.5">
          <button
            class="hover:bg-surface-100 text-surface-800/70 rounded-md px-2 py-1 text-[10px]"
            @click="presetSaveOpen = false"
          >
            取消
          </button>
          <button
            class="hover:bg-brand-600 bg-brand-500 rounded-md px-2 py-1 text-[10px] text-white"
            aria-label="确认保存预设"
            @click="confirmSavePreset"
          >
            保存
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
        <p
          v-if="libraryPresets.length === 0"
          class="text-surface-800/40 py-6 text-center text-[11px]"
        >
          没有匹配的预设
        </p>
        <div
          v-for="p in libraryPresets"
          :key="p.id"
          class="border-surface-100 bg-surface-0/70 hover:border-brand-500/40 group rounded-lg border p-2 transition-colors"
        >
          <div class="flex items-center gap-1.5">
            <button
              class="focus-visible:ring-brand-500/40 min-w-0 flex-1 rounded text-left focus-visible:ring-2 focus-visible:outline-none"
              :aria-label="`插入预设 ${p.name}`"
              :title="p.description"
              @click="insertPreset(p)"
            >
              <span class="text-surface-900 block truncate text-[11px] font-medium">
                {{ p.name }}
                <span v-if="!p.builtin" class="text-surface-800/35 text-[9px]">个人</span>
              </span>
              <span class="text-surface-800/40 block truncate text-[9px]">
                {{ p.category }} · {{ p.assets.length }} 项{{
                  p.description ? ` · ${p.description}` : ''
                }}
              </span>
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/45 flex size-5 shrink-0 items-center justify-center rounded"
              :aria-label="p.favorite ? `取消收藏 ${p.name}` : `收藏 ${p.name}`"
              :title="p.favorite ? '取消收藏' : '收藏'"
              @click="store.togglePresetFavorite(p.id)"
            >
              <Star class="size-3" :class="p.favorite ? 'fill-amber-400 text-amber-400' : ''" />
            </button>
            <button
              v-if="!p.builtin"
              class="hover:bg-surface-100 flex size-5 shrink-0 items-center justify-center rounded text-red-500/70 hover:text-red-600"
              :aria-label="`删除个人预设 ${p.name}`"
              title="删除个人预设"
              @click="store.deletePersonalPreset(p.id)"
            >
              <Trash2 class="size-3" />
            </button>
          </div>
          <div class="mt-1 flex gap-1">
            <button
              v-for="(part, i) in p.assets.slice(0, 3)"
              :key="i"
              class="size-3.5 rounded-sm border border-black/10"
              :style="{ background: part.color }"
              :aria-label="`预设部件 ${part.name}`"
              :title="part.name"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- ============ 区域（world） ============ -->
    <template v-else-if="panelTab === 'regions' && project">
      <div class="flex items-center gap-1 px-2 py-1.5">
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="新建区域"
          @click="store.addRegionAction()"
        >
          <Plus class="size-3" />
          新建区域
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 flex items-center gap-1 rounded-md px-2 py-1 text-[10px]"
          :class="regionFilter ? 'bg-brand-500/10 text-brand-600' : ''"
          :aria-label="regionFilter ? '清除区域过滤' : '按区域过滤资产'"
          :title="regionFilter ? '清除过滤' : '区域过滤'"
          @click="regionFilter = null"
        >
          <Filter class="size-3" />
          过滤
        </button>
      </div>
      <div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
        <p
          v-if="project.regions.length === 0"
          class="text-surface-800/40 py-6 text-center text-[11px]"
        >
          还没有区域，点击「新建区域」规划世界分区
        </p>
        <div
          v-for="r in project.regions"
          :key="r.id"
          class="border-surface-100 bg-surface-0/70 rounded-lg border p-2"
          :class="regionFilter === r.id ? 'border-brand-500' : ''"
        >
          <div class="flex items-center gap-1.5">
            <span
              class="size-2.5 shrink-0 rounded-sm"
              :style="{ background: r.color }"
              aria-hidden="true"
            />
            <button
              class="focus-visible:ring-brand-500/40 min-w-0 flex-1 rounded text-left focus-visible:ring-2 focus-visible:outline-none"
              :aria-label="`按区域 ${r.name} 过滤资产`"
              @click="regionFilter = regionFilter === r.id ? null : r.id"
            >
              <span class="text-surface-900 block truncate text-[11px] font-medium">{{
                r.name
              }}</span>
              <span class="text-surface-800/40 block truncate text-[9px]">
                {{ r.purpose || '未设定用途' }} · 危险 {{ r.dangerLevel }}/5 ·
                {{ r.assetIds.length }} 项资产
              </span>
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/45 hover:text-surface-900 flex size-5 items-center justify-center rounded"
              aria-label="编辑区域"
              title="编辑区域"
              @click="startEditRegion(r)"
            >
              <Filter class="size-3" />
            </button>
            <button
              class="hover:bg-surface-100 flex size-5 items-center justify-center rounded text-red-500/70 hover:text-red-600"
              :aria-label="`删除区域 ${r.name}`"
              title="删除区域"
              @click="store.removeRegionAction(r.id)"
            >
              <Trash2 class="size-3" />
            </button>
          </div>

          <div
            v-if="regionEditing === r.id && regionDraft"
            class="border-surface-100 mt-2 space-y-1.5 border-t pt-2"
            role="dialog"
            aria-label="编辑区域"
          >
            <label class="text-surface-800/60 block text-[9px]">名称</label>
            <input
              v-model="regionDraft.name"
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-2 py-1 text-[11px] outline-none"
              aria-label="区域名称"
            />
            <div class="grid grid-cols-2 gap-1.5">
              <label class="block">
                <span class="text-surface-800/60 block text-[9px]">用途</span>
                <input
                  v-model="regionDraft.purpose"
                  class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-2 py-1 text-[10px] outline-none"
                  aria-label="区域用途"
                />
              </label>
              <label class="block">
                <span class="text-surface-800/60 block text-[9px]">风格</span>
                <input
                  v-model="regionDraft.style"
                  class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-2 py-1 text-[10px] outline-none"
                  aria-label="区域风格"
                />
              </label>
            </div>
            <div class="grid grid-cols-2 items-end gap-1.5">
              <label class="block">
                <span class="text-surface-800/60 block text-[9px]">危险等级 0-5</span>
                <input
                  v-model.number="regionDraft.dangerLevel"
                  type="number"
                  min="0"
                  max="5"
                  class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-2 py-1 text-[10px] outline-none"
                  aria-label="危险等级"
                />
              </label>
              <label class="block">
                <span class="text-surface-800/60 block text-[9px]">颜色</span>
                <input
                  v-model="regionDraft.color"
                  type="color"
                  class="size-7 cursor-pointer rounded border border-black/10 bg-transparent p-0.5"
                  aria-label="区域颜色"
                />
              </label>
            </div>
            <div class="grid grid-cols-3 gap-1.5">
              <label class="block">
                <span class="text-surface-800/60 block text-[9px]">中心 X</span>
                <input
                  v-model.number="regionDraft.center[0]"
                  type="number"
                  step="0.5"
                  class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-2 py-1 text-[10px] outline-none"
                  aria-label="区域中心 X"
                />
              </label>
              <label class="block">
                <span class="text-surface-800/60 block text-[9px]">中心 Y</span>
                <input
                  v-model.number="regionDraft.center[1]"
                  type="number"
                  step="0.5"
                  class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-2 py-1 text-[10px] outline-none"
                  aria-label="区域中心 Y"
                />
              </label>
              <label class="block">
                <span class="text-surface-800/60 block text-[9px]">中心 Z</span>
                <input
                  v-model.number="regionDraft.center[2]"
                  type="number"
                  step="0.5"
                  class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-2 py-1 text-[10px] outline-none"
                  aria-label="区域中心 Z"
                />
              </label>
            </div>
            <div class="grid grid-cols-3 gap-1.5">
              <label class="block">
                <span class="text-surface-800/60 block text-[9px]">尺寸 X</span>
                <input
                  v-model.number="regionDraft.size[0]"
                  type="number"
                  min="0.5"
                  step="0.5"
                  class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-2 py-1 text-[10px] outline-none"
                  aria-label="区域尺寸 X"
                />
              </label>
              <label class="block">
                <span class="text-surface-800/60 block text-[9px]">尺寸 Y</span>
                <input
                  v-model.number="regionDraft.size[1]"
                  type="number"
                  min="0.5"
                  step="0.5"
                  class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-2 py-1 text-[10px] outline-none"
                  aria-label="区域尺寸 Y"
                />
              </label>
              <label class="block">
                <span class="text-surface-800/60 block text-[9px]">尺寸 Z</span>
                <input
                  v-model.number="regionDraft.size[2]"
                  type="number"
                  min="0.5"
                  step="0.5"
                  class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 w-full rounded-md border px-2 py-1 text-[10px] outline-none"
                  aria-label="区域尺寸 Z"
                />
              </label>
            </div>
            <label class="text-surface-800/60 block text-[9px]">说明</label>
            <textarea
              v-model="regionDraft.description"
              class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 h-12 w-full resize-none rounded-md border px-2 py-1 text-[10px] outline-none"
              aria-label="区域说明"
            />
            <p class="text-surface-800/60 text-[9px]">关联资产（点击切换）</p>
            <div class="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              <button
                v-for="a in project.assets.filter((x) => !x.parentId)"
                :key="a.id"
                class="rounded-md border px-1.5 py-0.5 text-[9px]"
                :class="
                  regionDraft.assetIds?.includes(a.id)
                    ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                    : 'border-surface-100 text-surface-800/50 hover:bg-surface-100'
                "
                :aria-pressed="regionDraft.assetIds?.includes(a.id)"
                @click="toggleAssetInRegion(r.id, a.id)"
              >
                {{ a.name }}
              </button>
            </div>
            <div class="flex justify-end gap-1.5">
              <button
                class="hover:bg-surface-100 text-surface-800/70 rounded-md px-2 py-1 text-[10px]"
                @click="cancelEditRegion"
              >
                取消
              </button>
              <button
                class="hover:bg-brand-600 bg-brand-500 rounded-md px-2 py-1 text-[10px] text-white"
                aria-label="保存区域修改"
                @click="saveEditRegion"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </aside>
</template>
