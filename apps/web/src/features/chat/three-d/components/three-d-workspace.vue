<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台主页面
 *
 * 顶部工具栏（项目 / 模式 / 相机 / 工具 / 编辑辅助 / 撤销重做 / 保存状态 /
 * 面板开关 / 导入导出 / 模板 / 返回 Chat）+ 左侧资产面板（资产树 / 预设库 / 区域）
 * + 全宽 Three.js 画布 + 右侧检查器 / 角色设计板 + 底部时间线 / 简报 / 分镜板。
 * 窄屏下左右面板与设计板变为抽屉，画布始终为主区域。
 * 快捷键：W/E/R 工具、V 选择、Delete 删除、Escape 取消选择、方向键微调、
 * Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z 重做（输入框内不劫持）。
 */
import {
  Box,
  Boxes,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  Focus,
  Frame,
  Magnet,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Shirt,
  Trash2,
  Undo2,
  X,
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { CAMERA_PRESETS, TOOL_MODES } from '../constants';
import { cameraPresetLabel } from '../service';
import { useThreeDWorkspaceStore } from '../store';
import type { CameraPresetId, ThreeDCameraState, ThreeDProjectType, ToolMode } from '../types';
import ThreeDAssetPanel from './three-d-asset-panel.vue';
import ThreeDBriefPanel from './three-d-brief-panel.vue';
import ThreeDCanvas from './three-d-canvas.vue';
import ThreeDCharacterBoard from './three-d-character-board.vue';
import ThreeDImportDialog from './three-d-import-dialog.vue';
import ThreeDInspector from './three-d-inspector.vue';
import ThreeDNewDialog from './three-d-new-dialog.vue';

const store = useThreeDWorkspaceStore();
const router = useRouter();

const newOpen = ref(false);
const importOpen = ref(false);
const mobileLeft = ref(false);
const mobileRight = ref(false);
const mobileDesignBoard = ref(false);
const webglFailed = ref(false);
const webglRetryKey = ref(0);
const deleteArmed = ref(false);
const templateName = ref('');
const templateSaveOpen = ref(false);
const focusRequest = ref<{ id: string | null; seq: number }>({ id: null, seq: 0 });
const rightTab = ref<'inspector' | 'design'>('inspector');
let deleteArmTimer: ReturnType<typeof setTimeout> | null = null;

const project = computed(() => store.activeProject);
const selectedIds = computed(() => {
  const p = project.value;
  if (!p) return [];
  return p.selectedAssetIds.length > 0
    ? p.selectedAssetIds
    : p.activeAssetId
      ? [p.activeAssetId]
      : [];
});

const saveLabel = computed(() => {
  if (store.saveStatus === 'error') return '保存失败';
  if (store.saveStatus === 'saving') return '保存中…';
  if (store.lastSavedAt) {
    const d = new Date(store.lastSavedAt);
    return `已自动保存 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return '已保存';
});

/** 当前模式可用的相机预设（通用 + 模式专属） */
const cameraOptions = computed(() => {
  const p = project.value;
  if (!p) return [];
  const group = p.type === 'character' ? '角色' : p.type === 'world' ? '世界' : '通用';
  return CAMERA_PRESETS.filter((c) => c.group === '通用' || c.group === group);
});

const cameraLabel = computed(() =>
  project.value ? cameraPresetLabel(project.value.cameraPreset) : '',
);

const noticesVisible = computed(
  () =>
    (store.recovered || store.tooNew || store.migrated) &&
    !store.ui.noticeDismissed &&
    project.value !== null,
);

function selectProject(id: string) {
  store.selectProject(id);
}

function setTool(tool: ToolMode) {
  store.ui.tool = tool;
}

function onCanvasSelect(assetId: string | null, opts?: { additive?: boolean }) {
  store.selectAsset(assetId, opts ?? {});
}

function onCanvasSelectMany(ids: string[], opts?: { additive?: boolean }) {
  store.selectMany(ids, opts ?? {});
}

function onCameraChange(state: ThreeDCameraState) {
  store.setLastCamera(state);
}

function onShotExit() {
  store.exitShotMode();
}

function onWebglFailed() {
  webglFailed.value = true;
}

function retryWebgl() {
  webglRetryKey.value += 1;
  webglFailed.value = false;
}

function requestFocus() {
  focusRequest.value = {
    id: project.value?.activeAssetId ?? null,
    seq: focusRequest.value.seq + 1,
  };
}

function armDelete() {
  deleteArmed.value = true;
  if (deleteArmTimer) clearTimeout(deleteArmTimer);
  deleteArmTimer = setTimeout(() => {
    deleteArmed.value = false;
  }, 2500);
}

function confirmDelete() {
  if (!deleteArmed.value || !project.value) return;
  store.deleteProject(project.value.id);
  deleteArmed.value = false;
}

function backToChat() {
  const created = store.createChatDraft();
  if (created) void router.push('/chat');
}

function confirmSaveTemplate() {
  store.saveCurrentAsTemplate(templateName.value);
  templateName.value = '';
  templateSaveOpen.value = false;
}

function toggleDesignBoard() {
  store.ui.designBoardOpen = !store.ui.designBoardOpen;
  rightTab.value = 'design';
}

/** 快捷键处理（输入框内不劫持） */
function onKeydown(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  if (
    el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  ) {
    return;
  }
  if (e.isComposing) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    store.redo();
    return;
  }
  if (mod) return;
  switch (e.key.toLowerCase()) {
    case 'w':
      setTool('move');
      break;
    case 'e':
      setTool('rotate');
      break;
    case 'r':
      setTool('scale');
      break;
    case 'v':
      setTool('select');
      break;
    case 'delete':
    case 'backspace':
      e.preventDefault();
      if (store.activeProject?.selectedAssetIds.length) {
        store.batchDeleteSelected();
      } else if (store.activeProject?.activeAssetId) {
        const id = store.activeProject.activeAssetId;
        const asset = store.activeProject.assets.find((a) => a.id === id);
        if (asset && !asset.locked) store.removeAsset(id);
      }
      break;
    case 'escape':
      store.clearSelection();
      break;
    case 'arrowup':
    case 'arrowdown':
    case 'arrowleft':
    case 'arrowright': {
      const key = e.key.toLowerCase();
      const tool = store.ui.tool;
      if (tool === 'select' || !store.activeProject?.activeAssetId) return;
      e.preventDefault();
      const axis: 0 | 1 | 2 =
        key === 'arrowleft' || key === 'arrowright' ? 0 : key === 'arrowup' ? 1 : 2;
      const dir: 1 | -1 = key === 'arrowright' || key === 'arrowup' ? 1 : -1;
      const step =
        tool === 'scale'
          ? e.shiftKey
            ? 0.2
            : 0.05
          : tool === 'rotate'
            ? e.shiftKey
              ? 15
              : 5
            : e.shiftKey
              ? 0.5
              : 0.1;
      store.nudgeAsset(axis, dir, step);
      break;
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  if (deleteArmTimer) clearTimeout(deleteArmTimer);
  store.flushSave();
});

const modeOptions: Array<{ key: ThreeDProjectType; label: string }> = [
  { key: 'character', label: '角色' },
  { key: 'world', label: '世界' },
  { key: 'prop', label: '道具' },
];
</script>

<template>
  <div class="bg-page chat-workspace absolute inset-0 flex flex-col overflow-hidden">
    <!-- ============ 顶部工具栏 ============ -->
    <header class="border-surface-100 flex h-11 shrink-0 items-center gap-1.5 border-b px-2">
      <!-- 项目选择 -->
      <div class="flex min-w-0 items-center gap-1">
        <Boxes class="text-surface-800/50 size-4 shrink-0" />
        <select
          class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 max-w-36 rounded-lg border px-2 py-1 text-[11px] font-medium outline-none"
          :value="store.activeProjectId ?? ''"
          aria-label="选择 3D 项目"
          @change="selectProject(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="p in store.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="新建 3D 项目"
          title="新建 3D 项目"
          @click="newOpen = true"
        >
          <Plus class="size-4" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="deleteArmed ? 'bg-red-50 text-red-600' : ''"
          :aria-label="deleteArmed ? '再次点击确认删除当前项目' : '删除当前项目'"
          :title="deleteArmed ? '确认删除' : '删除项目'"
          @click="deleteArmed ? confirmDelete() : armDelete()"
        >
          <Trash2 class="size-3.5" />
        </button>
      </div>

      <!-- 项目重命名 -->
      <div class="min-w-0 flex-1">
        <input
          v-if="project"
          class="text-surface-900 focus:bg-surface-100 w-full min-w-0 truncate rounded-md bg-transparent px-1.5 py-1 text-xs font-medium outline-none"
          :value="project.name"
          :aria-label="`项目名称（当前：${project.name}）`"
          title="重命名项目"
          @change="(e: Event) => store.renameProject((e.target as HTMLInputElement).value)"
        />
      </div>

      <!-- 保存状态 -->
      <span
        class="text-surface-800/40 shrink-0 text-[10px] tabular-nums"
        :class="store.saveStatus === 'error' ? 'text-red-500' : ''"
        :aria-label="saveLabel"
      >
        {{ saveLabel }}
      </span>

      <!-- 创作模式切换 -->
      <div
        v-if="project"
        class="bg-surface-50 flex shrink-0 items-center gap-0.5 rounded-lg p-0.5"
        role="group"
        aria-label="创作模式"
      >
        <button
          v-for="opt in modeOptions"
          :key="opt.key"
          class="focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="
            project.type === opt.key
              ? 'bg-surface-0 text-surface-900 shadow-sm'
              : 'text-surface-800/50 hover:text-surface-900'
          "
          :aria-pressed="project.type === opt.key"
          @click="store.switchProjectType(opt.key)"
        >
          {{ opt.label }}
        </button>
      </div>

      <!-- 相机预设 -->
      <select
        v-if="project"
        class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 shrink-0 rounded-lg border px-2 py-1 text-[11px] outline-none"
        :value="project.cameraPreset"
        :aria-label="`相机预设（当前 ${cameraLabel}）`"
        @change="
          store.setCameraPreset(($event.target as HTMLSelectElement).value as CameraPresetId)
        "
      >
        <option v-for="c in cameraOptions" :key="c.key" :value="c.key">{{ c.label }}</option>
      </select>

      <!-- 变换工具 -->
      <div
        v-if="project"
        class="bg-surface-50 flex shrink-0 items-center gap-0.5 rounded-lg p-0.5"
        role="group"
        aria-label="变换工具"
      >
        <button
          v-for="t in TOOL_MODES"
          :key="t.key"
          class="focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded-md text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="
            store.ui.tool === t.key
              ? 'bg-surface-0 text-surface-900 shadow-sm'
              : 'text-surface-800/50'
          "
          :aria-label="`${t.label}工具（快捷键 ${t.shortcut}）`"
          :aria-pressed="store.ui.tool === t.key"
          :title="`${t.label}（${t.shortcut}）`"
          @click="setTool(t.key)"
        >
          {{ t.label.slice(0, 1) }}
        </button>
      </div>

      <!-- 编辑辅助（吸附 / 坐标 / 焦点 / 孤立 / 边界框 / 材质预览） -->
      <div
        v-if="project"
        class="flex shrink-0 items-center gap-0.5"
        role="group"
        aria-label="编辑辅助"
      >
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="{ 'bg-surface-100 text-surface-900': store.ui.snap.grid }"
          :aria-label="store.ui.snap.grid ? '网格吸附：开' : '网格吸附：关'"
          :aria-pressed="store.ui.snap.grid"
          title="网格吸附（方向键微调对齐网格）"
          @click="store.ui.snap.grid = !store.ui.snap.grid"
        >
          <Magnet class="size-3.5" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="{ 'bg-surface-100 text-surface-900': store.ui.snap.angle }"
          :aria-label="store.ui.snap.angle ? '角度吸附：开' : '角度吸附：关'"
          :aria-pressed="store.ui.snap.angle"
          title="角度吸附（旋转对齐 15°）"
          @click="store.ui.snap.angle = !store.ui.snap.angle"
        >
          <RotateCcw class="size-3.5" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="{ 'bg-surface-100 text-surface-900': store.ui.coordSpace === 'local' }"
          :aria-label="store.ui.coordSpace === 'local' ? '本地坐标系：开' : '世界坐标系'"
          :aria-pressed="store.ui.coordSpace === 'local'"
          :title="store.ui.coordSpace === 'local' ? '本地坐标系（显示本地轴）' : '世界坐标系'"
          @click="store.ui.coordSpace = store.ui.coordSpace === 'local' ? 'world' : 'local'"
        >
          <Frame class="size-3.5" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="{ 'bg-surface-100 text-surface-900': store.ui.showBoundingBox }"
          :aria-label="store.ui.showBoundingBox ? '显示边界框：开' : '显示边界框：关'"
          :aria-pressed="store.ui.showBoundingBox"
          title="显示选中资产边界框"
          @click="store.ui.showBoundingBox = !store.ui.showBoundingBox"
        >
          <Box class="size-3.5" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="{ 'bg-surface-100 text-surface-900': store.ui.isolation }"
          :aria-label="store.ui.isolation ? '孤立显示选中项：开' : '孤立显示选中项：关'"
          :aria-pressed="store.ui.isolation"
          title="孤立显示选中项（其余隐藏）"
          @click="store.ui.isolation = !store.ui.isolation"
        >
          <EyeOff class="size-3.5" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="聚焦选中资产"
          title="聚焦（相机对准选中资产）"
          @click="requestFocus"
        >
          <Focus class="size-3.5" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :class="{ 'bg-surface-100 text-surface-900': store.ui.materialPreview }"
          :aria-label="store.ui.materialPreview ? '材质参数预览：开' : '材质参数预览：关'"
          :aria-pressed="store.ui.materialPreview"
          title="材质受控参数预览"
          @click="store.ui.materialPreview = !store.ui.materialPreview"
        >
          <Eye class="size-3.5" />
        </button>
      </div>

      <!-- 撤销 / 重做 -->
      <div class="flex shrink-0 items-center gap-0.5">
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-30"
          :disabled="!store.canUndo"
          aria-label="撤销"
          title="撤销（Ctrl+Z）"
          @click="store.undo()"
        >
          <Undo2 class="size-3.5" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-30"
          :disabled="!store.canRedo"
          aria-label="重做"
          title="重做（Ctrl+Shift+Z）"
          @click="store.redo()"
        >
          <Redo2 class="size-3.5" />
        </button>
      </div>

      <!-- 角色设计板（character） -->
      <button
        v-if="project?.type === 'character'"
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
        :class="{ 'bg-surface-100 text-surface-900': store.ui.designBoardOpen }"
        :aria-label="store.ui.designBoardOpen ? '收起角色设计板' : '展开角色设计板'"
        title="角色设计板"
        @click="toggleDesignBoard"
      >
        <Shirt class="size-3.5" />
      </button>

      <!-- 保存为模板 -->
      <div class="relative">
        <button
          v-if="project"
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="将当前项目保存为个人模板"
          title="保存为个人模板"
          @click="templateSaveOpen = !templateSaveOpen"
        >
          <Save class="size-3.5" />
        </button>
        <div
          v-if="templateSaveOpen"
          class="bg-surface-0 shadow-float border-surface-100 absolute top-9 right-0 z-30 w-60 rounded-lg border p-2"
          role="dialog"
          aria-label="保存为个人模板"
        >
          <label class="text-surface-800/60 mb-1 block text-[10px]">模板名称</label>
          <input
            v-model="templateName"
            class="border-surface-100 bg-surface-50 focus:border-brand-500 text-surface-900 mb-2 w-full rounded-md border px-2 py-1 text-[11px] outline-none"
            aria-label="模板名称"
            :placeholder="`${project?.name ?? ''} 模板`"
          />
          <div class="flex justify-end gap-1.5">
            <button
              class="hover:bg-surface-100 text-surface-800/70 rounded-md px-2 py-1 text-[10px]"
              @click="templateSaveOpen = false"
            >
              取消
            </button>
            <button
              class="hover:bg-brand-600 bg-brand-500 rounded-md px-2 py-1 text-[10px] text-white"
              aria-label="确认保存模板"
              @click="confirmSaveTemplate"
            >
              保存
            </button>
          </div>
          <p class="text-surface-800/35 mt-1 text-[9px]">
            快照包含资产 / 区域 / 镜头 / 设定（不共享引用）
          </p>
        </div>
      </div>

      <!-- 底部面板开关 -->
      <button
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
        :class="{ 'bg-surface-100 text-surface-900': store.ui.bottomOpen }"
        :aria-label="store.ui.bottomOpen ? '收起底部面板' : '展开底部面板'"
        :title="store.ui.bottomOpen ? '收起底部面板' : '展开底部面板'"
        @click="store.ui.bottomOpen = !store.ui.bottomOpen"
      >
        <ChevronDown v-if="store.ui.bottomOpen" class="size-4" />
        <ChevronUp v-else class="size-4" />
      </button>

      <!-- 左右面板开关（桌面） -->
      <button
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 hidden size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none lg:flex"
        :class="{ 'bg-surface-100 text-surface-900': store.ui.leftPanelOpen }"
        aria-label="切换资产面板"
        title="资产面板"
        @click="store.ui.leftPanelOpen = !store.ui.leftPanelOpen"
      >
        <PanelLeft class="size-4" />
      </button>
      <button
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 hidden size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none lg:flex"
        :class="{ 'bg-surface-100 text-surface-900': store.ui.rightPanelOpen }"
        aria-label="切换检查器"
        title="检查器"
        @click="store.ui.rightPanelOpen = !store.ui.rightPanelOpen"
      >
        <PanelRight class="size-4" />
      </button>

      <!-- 移动端面板开关 -->
      <button
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none lg:hidden"
        aria-label="打开资产面板"
        title="资产"
        @click="mobileLeft = true"
      >
        <PanelLeft class="size-4" />
      </button>
      <button
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none lg:hidden"
        aria-label="打开检查器"
        title="检查器"
        @click="mobileRight = true"
      >
        <PanelRight class="size-4" />
      </button>

      <!-- 导入导出 -->
      <button
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
        aria-label="导入 3D 项目或模板"
        title="导入项目 / 模板 JSON"
        @click="importOpen = true"
      >
        <FileUp class="size-3.5" />
      </button>
      <button
        class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
        aria-label="导出全部 3D 项目"
        title="导出全部项目 JSON"
        @click="store.exportAllProjects()"
      >
        <FileDown class="size-3.5" />
      </button>

      <!-- 返回 Chat -->
      <button
        v-if="project"
        class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
        aria-label="返回 Chat 继续讨论"
        title="创建 Chat 会话草稿（不自动发送）"
        @click="backToChat"
      >
        <MessageSquare class="size-3" />
        返回 Chat
      </button>
    </header>

    <!-- ============ 恢复 / 版本提示条 ============ -->
    <div
      v-if="noticesVisible"
      class="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
      role="status"
    >
      <span class="min-w-0 flex-1">
        {{ store.recovered ? '本地数据损坏，已恢复为默认工作区。' : '' }}
        {{ store.tooNew ? '本地数据版本过新，当前按默认工作区展示（原数据未改动）。' : '' }}
        {{ store.migrated ? '已从 v1 自动迁移到 v2（新功能已启用，原数据保留）。' : '' }}
      </span>
      <button
        class="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20"
        aria-label="重置 3D 工作台数据"
        @click="store.resetStorage()"
      >
        <RotateCcw class="size-3" />
        重置数据
      </button>
      <button
        class="rounded-md p-0.5 transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20"
        aria-label="忽略提示"
        @click="store.dismissNotices()"
      >
        <X class="size-3.5" />
      </button>
    </div>

    <!-- ============ 主体 ============ -->
    <div class="relative flex min-h-0 flex-1">
      <!-- 左侧资产面板（桌面） -->
      <div v-if="store.ui.leftPanelOpen" class="hidden h-full lg:block">
        <ThreeDAssetPanel />
      </div>

      <!-- 画布（主区域，全宽） -->
      <main class="relative min-w-0 flex-1">
        <ThreeDCanvas
          v-if="project"
          :key="`${project.id}-${webglRetryKey}`"
          :project="project"
          :tool="store.ui.tool"
          :isolation="store.ui.isolation"
          :show-bounding-box="store.ui.showBoundingBox"
          :coord-space="store.ui.coordSpace"
          :selected-ids="selectedIds"
          :focus-request="focusRequest"
          @select="onCanvasSelect"
          @select-many="onCanvasSelectMany"
          @webgl-failed="onWebglFailed"
          @camera-change="onCameraChange"
          @shot-exit="onShotExit"
        />

        <!-- WebGL 降级提示条（画布内仍有重试 UI） -->
        <div
          v-if="webglFailed"
          class="absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] text-amber-700 shadow-sm dark:bg-amber-500/10 dark:text-amber-300"
          role="status"
        >
          <span>WebGL 不可用：已切换为结构化项目编辑模式（资产面板与检查器仍可用）</span>
          <button
            class="rounded-md px-1 py-0.5 font-medium transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20"
            aria-label="重试 3D 渲染"
            @click="retryWebgl"
          >
            重试
          </button>
        </div>

        <!-- 无项目空态 -->
        <div
          v-if="!project"
          class="bg-page absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
        >
          <Boxes class="text-surface-800/20 size-10" />
          <p class="text-surface-800/60 text-sm">没有可用的 3D 项目</p>
          <button
            class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label="新建 3D 项目"
            @click="newOpen = true"
          >
            <Plus class="size-3.5" />
            新建项目
          </button>
        </div>
      </main>

      <!-- 右侧检查器 / 角色设计板（桌面） -->
      <div v-if="store.ui.rightPanelOpen" class="hidden h-full lg:block">
        <div v-if="project?.type === 'character'" class="flex h-full flex-col">
          <div
            class="border-surface-100 bg-surface-50 flex h-9 shrink-0 items-center gap-0.5 border-b px-1.5"
          >
            <button
              class="flex flex-1 items-center justify-center rounded-md py-1 text-[10px] font-medium transition-colors"
              :class="
                rightTab === 'inspector'
                  ? 'bg-surface-0 text-surface-900 shadow-sm'
                  : 'text-surface-800/50 hover:text-surface-900'
              "
              :aria-pressed="rightTab === 'inspector'"
              @click="rightTab = 'inspector'"
            >
              检查器
            </button>
            <button
              class="flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] font-medium transition-colors"
              :class="
                rightTab === 'design'
                  ? 'bg-surface-0 text-surface-900 shadow-sm'
                  : 'text-surface-800/50 hover:text-surface-900'
              "
              :aria-pressed="rightTab === 'design'"
              @click="rightTab = 'design'"
            >
              <Shirt class="size-3" />
              设计板
            </button>
          </div>
          <div class="min-h-0 flex-1">
            <ThreeDCharacterBoard v-if="rightTab === 'design'" />
            <ThreeDInspector v-else />
          </div>
        </div>
        <ThreeDInspector v-else />
      </div>

      <!-- 移动端抽屉：资产面板 -->
      <div v-if="mobileLeft" class="fixed inset-0 z-40 lg:hidden">
        <div class="absolute inset-0 bg-black/30" aria-hidden="true" @click="mobileLeft = false" />
        <div class="absolute top-0 left-0 h-full">
          <ThreeDAssetPanel />
          <button
            class="bg-surface-0 shadow-float absolute top-2 -right-9 flex size-8 items-center justify-center rounded-lg"
            aria-label="关闭资产面板"
            @click="mobileLeft = false"
          >
            <X class="size-4" />
          </button>
        </div>
      </div>

      <!-- 移动端抽屉：检查器 -->
      <div v-if="mobileRight" class="fixed inset-0 z-40 lg:hidden">
        <div class="absolute inset-0 bg-black/30" aria-hidden="true" @click="mobileRight = false" />
        <div class="absolute top-0 right-0 h-full">
          <ThreeDInspector />
          <button
            class="bg-surface-0 shadow-float absolute top-2 -left-9 flex size-8 items-center justify-center rounded-lg"
            aria-label="关闭检查器"
            @click="mobileRight = false"
          >
            <X class="size-4" />
          </button>
        </div>
      </div>

      <!-- 移动端抽屉：角色设计板 -->
      <div v-if="mobileDesignBoard" class="fixed inset-0 z-40 lg:hidden">
        <div
          class="absolute inset-0 bg-black/30"
          aria-hidden="true"
          @click="mobileDesignBoard = false"
        />
        <div class="absolute top-0 right-0 h-full">
          <ThreeDCharacterBoard />
          <button
            class="bg-surface-0 shadow-float absolute top-2 -left-9 flex size-8 items-center justify-center rounded-lg"
            aria-label="关闭角色设计板"
            @click="mobileDesignBoard = false"
          >
            <X class="size-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- ============ 底部面板（时间线 / 简报 / 分镜） ============ -->
    <div v-if="store.ui.bottomOpen" class="shrink-0">
      <ThreeDBriefPanel />
    </div>

    <!-- 弹窗 -->
    <ThreeDNewDialog :open="newOpen" @close="newOpen = false" />
    <ThreeDImportDialog :open="importOpen" @close="importOpen = false" />
  </div>
</template>

<style>
.chat-workspace {
  --chat-cyan: #0891b2;
  --chat-teal: #0d9488;
  --chat-orange: #ea580c;
  --chat-rose: #e11d48;
  --chat-mono: #64748b;
}
</style>
