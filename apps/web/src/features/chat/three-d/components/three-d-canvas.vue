<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台画布
 *
 * 全宽 Three.js 场景：轨道相机（旋转 / 平移 / 缩放）、相机预设、
 * 网格 / 坐标轴 / 地面 / 环境光开关、点击拾取、选中高亮（克制）。
 * 卸载时清理 renderer / 动画帧 / 控制器 / 监听 / 纹理 / 几何体。
 * WebGL 初始化失败 → 发出 webgl-failed，由外层展示可恢复降级界面。
 */
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import {
  ASSET_ID_KEY,
  buildScene,
  cameraForPreset,
  syncAssetNode,
  syncSceneSettings,
  type BuiltScene,
} from '../engine/scene-factory';
import type { CameraPresetId, ThreeDProject, ToolMode } from '../types';

const props = defineProps<{
  project: ThreeDProject;
  tool: ToolMode;
}>();

const emit = defineEmits<{
  select: [assetId: string | null];
  'webgl-failed': [];
  ready: [];
}>();

const container = ref<HTMLElement | null>(null);

const webglFailed = ref(false);
const appliedCameraPreset = ref<string | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let controls: OrbitControls | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let built: BuiltScene | null = null;
let rafId = 0;
let needsRender = false;
let disposed = false;
let resizeObserver: ResizeObserver | null = null;
let pointerDownPos: { x: number; y: number } | null = null;
let contextLostHandler: ((e: Event) => void) | null = null;

const reducedMotion = ref(false);

/** 资产结构签名：结构变化（增删 / 层级）才重建场景 */
const structureKey = computed(() =>
  props.project.assets.map((a) => `${a.id}:${a.parentId ?? ''}`).join('|'),
);

const assetSignature = computed(() =>
  props.project.assets
    .map(
      (a) =>
        `${a.id}:${a.transform.position.join(',')};${a.transform.rotation.join(',')};${a.transform.scale.join(',')};${a.visible};${a.locked};${a.color};${a.materialPreset}`,
    )
    .join('|'),
);

const sceneSignature = computed(() => {
  const s = props.project.sceneSettings;
  return JSON.stringify([
    s.background,
    s.groundColor,
    s.groundVisible,
    s.gridVisible,
    s.axesVisible,
    s.ambientLight,
    s.mainLight,
    s.fog,
  ]);
});

onMounted(() => {
  reducedMotion.value = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  if (!initRenderer()) {
    webglFailed.value = true;
    emit('webgl-failed');
    return;
  }
  emit('ready');
});

onBeforeUnmount(() => {
  disposeAll();
});

/** 初始化 renderer / scene / camera / controls；失败返回 false */
function initRenderer(): boolean {
  const el = container.value;
  if (!el) return false;
  let gl: THREE.WebGLRenderer | null = null;
  try {
    gl = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      // 保留绘制缓冲：readPixels / 截图 / 未来缩略图功能可用
      preserveDrawingBuffer: true,
    });
  } catch {
    return false;
  }
  if (!gl || !gl.getContext()) {
    gl?.dispose();
    return false;
  }
  renderer = gl;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(el.clientWidth || 1, el.clientHeight || 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.setAttribute('aria-label', '3D 预览画布');
  renderer.domElement.tabIndex = 0;

  camera = new THREE.PerspectiveCamera(
    50,
    (el.clientWidth || 1) / (el.clientHeight || 1),
    0.1,
    200,
  );

  const rebuilt = buildScene(props.project);
  scene = rebuilt.scene;
  built = rebuilt;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion.value;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.autoRotate = false; // 默认不无限自动旋转
  controls.minDistance = 0.5;
  controls.maxDistance = 60;
  controls.addEventListener('change', () => {
    needsRender = true;
  });

  // 相机预设必须在 controls 创建后应用（applyCamera 依赖 controls）
  applyCamera(props.project.cameraPreset);

  // 点击拾取
  renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  renderer.domElement.addEventListener('pointerup', handlePointerUp);

  // WebGL 上下文丢失 → 降级
  contextLostHandler = () => {
    webglFailed.value = true;
    emit('webgl-failed');
  };
  renderer.domElement.addEventListener('webglcontextlost', contextLostHandler);

  // resize
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (!renderer || !camera || !el) return;
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      needsRender = true;
    });
    resizeObserver.observe(el);
  }

  // 按需渲染循环：只在需要时重绘（保持稳定帧率）
  const tick = () => {
    if (disposed) return;
    rafId = requestAnimationFrame(tick);
    if (!renderer || !scene || !camera) return;
    let changed = false;
    if (controls) changed = controls.update();
    if (changed || needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  };
  rafId = requestAnimationFrame(tick);
  needsRender = true;
  return true;
}

function applyCamera(preset: CameraPresetId) {
  if (!camera || !controls) return;
  const p = cameraForPreset(preset, props.project.type);
  camera.position.set(p.position[0], p.position[1], p.position[2]);
  controls.target.set(p.target[0], p.target[1], p.target[2]);
  controls.update();
  appliedCameraPreset.value = preset;
  needsRender = true;
}

/* ---------- 拾取 ---------- */

function handlePointerDown(e: PointerEvent) {
  pointerDownPos = { x: e.clientX, y: e.clientY };
}

function handlePointerUp(e: PointerEvent) {
  const down = pointerDownPos;
  pointerDownPos = null;
  if (!down) return;
  // 拖动（旋转 / 平移 / 缩放）不触发选择
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  if (!renderer || !camera || !scene) return;
  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const hit of hits) {
    const id = hit.object.userData[ASSET_ID_KEY] as string | undefined;
    if (id) {
      emit('select', id);
      return;
    }
  }
  emit('select', null);
}

/* ---------- 响应式同步 ---------- */

watch(structureKey, () => {
  if (!renderer || !camera) return;
  rebuildScene();
});

function rebuildScene() {
  if (!camera || !controls || !renderer) return;
  // 重建场景（保留相机 / 控制器）
  const oldBuilt = built;
  const next = buildScene(props.project);
  oldBuilt?.dispose();
  scene = next.scene;
  built = next;
  camera.aspect = (container.value?.clientWidth || 1) / (container.value?.clientHeight || 1);
  camera.updateProjectionMatrix();
  // 相机目标可能改变（项目类型），保持当前预设
  const preset = props.project.cameraPreset || 'perspective';
  const p = cameraForPreset(preset, props.project.type);
  camera.position.set(p.position[0], p.position[1], p.position[2]);
  controls.target.set(p.target[0], p.target[1], p.target[2]);
  controls.update();
  syncAssets();
  needsRender = true;
}

/** 增量同步：变换 / 颜色 / 可见性 / 选中态（不重建场景） */
function syncAssets() {
  if (!built) return;
  const selectedId = props.project.activeAssetId;
  for (const asset of props.project.assets) {
    const node = built.groups.get(asset.id);
    if (!node) continue;
    syncAssetNode(node, asset, asset.id === selectedId);
  }
  needsRender = true;
}

watch(assetSignature, () => syncAssets());

watch(
  () => props.project.activeAssetId,
  () => syncAssets(),
);

watch(sceneSignature, () => {
  if (scene && built) {
    syncSceneSettings(scene, built, props.project.sceneSettings);
    needsRender = true;
  }
});

watch(
  () => props.project.cameraPreset,
  (preset) => {
    if (preset && preset !== appliedCameraPreset.value) applyCamera(preset);
  },
);

watch(
  () => props.tool,
  () => {
    needsRender = true;
  },
);

/* ---------- 清理 ---------- */

function disposeAll() {
  disposed = true;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (contextLostHandler && renderer?.domElement) {
    renderer.domElement.removeEventListener('webglcontextlost', contextLostHandler);
    contextLostHandler = null;
  }
  if (renderer?.domElement) {
    renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
    renderer.domElement.removeEventListener('pointerup', handlePointerUp);
  }
  if (controls) {
    controls.dispose();
    controls = null;
  }
  if (built) {
    built.dispose();
    built = null;
  }
  scene = null;
  camera = null;
  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }
  container.value?.replaceChildren();
}

/** WebGL 初始化失败后的可恢复重试 */
function retryInit() {
  webglFailed.value = false;
  disposed = false;
  // 清理上次失败可能残留的 DOM
  container.value?.replaceChildren();
  if (initRenderer()) {
    emit('ready');
  } else {
    webglFailed.value = true;
    emit('webgl-failed');
  }
}
</script>

<template>
  <div ref="container" class="three-d-canvas absolute inset-0 overflow-hidden">
    <div
      v-if="webglFailed"
      class="bg-page absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center"
      data-testid="webgl-fallback"
      role="alert"
    >
      <p class="text-surface-800/70 text-sm font-medium">WebGL 初始化失败</p>
      <p class="text-surface-800/50 max-w-sm text-xs">
        当前环境无法创建 3D 渲染上下文。你仍然可以编辑项目结构、资产属性与生成简报（右侧面板），
        或点击下方按钮重试。
      </p>
      <div class="flex gap-2">
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          aria-label="重试初始化 3D 画布"
          @click="retryInit"
        >
          重试 3D 渲染
        </button>
      </div>
    </div>
  </div>
</template>
