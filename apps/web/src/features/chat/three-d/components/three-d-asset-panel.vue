<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台资产面板（左侧）
 *
 * 项目资产树：搜索、显示/隐藏、锁定/解锁、选中、新增基础资产、复制 / 删除。
 */
import { Copy, Eye, EyeOff, Layers, Lock, LockOpen, Plus, Search, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';

import { ASSET_TYPE_LABELS, PRIMITIVE_KINDS } from '../constants';
import { useThreeDWorkspaceStore } from '../store';
import type { PrimitiveKind, ThreeDAsset } from '../types';

const store = useThreeDWorkspaceStore();

const addMenuOpen = ref(false);

const query = computed({
  get: () => store.ui.assetQuery,
  set: (v: string) => {
    store.ui.assetQuery = v;
  },
});

interface TreeNode {
  asset: ThreeDAsset;
  depth: number;
}

const visibleRoots = computed<TreeNode[]>(() => {
  const p = store.activeProject;
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
      if (match(a)) result.push({ asset: a, depth });
      const children = p.assets.filter((c) => c.parentId === a.id);
      if (children.length > 0) walk(children, depth + 1);
    }
  };
  walk(roots, 0);
  return result;
});

const matchedCount = computed(() => visibleRoots.value.length);

function select(asset: ThreeDAsset) {
  if (asset.locked) return;
  store.selectAsset(asset.id);
}

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
  store.addAsset({ type: 'group' });
  addMenuOpen.value = false;
}
</script>

<template>
  <aside
    class="border-surface-100 bg-surface-0/60 flex h-full w-60 shrink-0 flex-col border-r"
    aria-label="资产面板"
  >
    <!-- 头部 -->
    <div class="border-surface-100 flex h-10 shrink-0 items-center gap-1.5 border-b px-2.5">
      <Layers class="text-surface-800/50 size-3.5" />
      <span class="text-surface-900 min-w-0 flex-1 truncate text-xs font-medium">资产</span>
      <span class="text-surface-800/35 text-[10px]">{{ matchedCount }} 项</span>
    </div>

    <!-- 搜索 -->
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
          v-for="kind in PRIMITIVE_KINDS.slice(0, 4)"
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
        <div class="relative">
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            :aria-expanded="addMenuOpen"
            aria-label="更多资产类型"
            @click="addMenuOpen = !addMenuOpen"
          >
            <Plus class="size-3" />
            更多
          </button>
          <div
            v-if="addMenuOpen"
            class="bg-surface-0 shadow-float border-surface-100 absolute top-8 left-0 z-20 w-36 rounded-lg border p-1"
          >
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
            <button
              class="hover:bg-surface-100 text-surface-800/70 w-full rounded-md px-2 py-1.5 text-left text-[11px] transition-colors"
              @click="addPrimitive('cone')"
            >
              圆锥
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/70 w-full rounded-md px-2 py-1.5 text-left text-[11px] transition-colors"
              @click="addPrimitive('torus')"
            >
              环面
            </button>
          </div>
        </div>
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
        v-for="node in visibleRoots"
        :key="node.asset.id"
        class="group flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors"
        :class="[
          node.asset.id === store.activeProject?.activeAssetId
            ? 'bg-brand-500/10 text-brand-700'
            : 'hover:bg-surface-100',
          node.asset.locked ? 'opacity-60' : '',
        ]"
        :style="{ paddingLeft: `${8 + node.depth * 14}px` }"
      >
        <button
          class="focus-visible:ring-brand-500/40 min-w-0 flex-1 rounded text-left focus-visible:ring-2 focus-visible:outline-none"
          :aria-label="`选择资产 ${node.asset.name}`"
          :aria-current="node.asset.id === store.activeProject?.activeAssetId"
          @click="select(node.asset)"
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
          class="hover:bg-surface-100 flex size-5 shrink-0 items-center justify-center rounded text-red-500/70 transition-colors hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:outline-none"
          :aria-label="`删除 ${node.asset.name}`"
          title="删除"
          @click.stop="store.removeAsset(node.asset.id)"
        >
          <Trash2 class="size-3" />
        </button>
      </div>
    </div>
  </aside>
</template>
