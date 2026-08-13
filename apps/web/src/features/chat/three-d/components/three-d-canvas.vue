<script setup lang="ts">
/**
 * Chat 功能域 —— 3D 工作台画布
 *
 * 全宽 Three.js 场景：轨道相机、相机预设 / 镜头（Shot）定位、网格 / 坐标轴 /
 * 地面 / 灯光资产 / 区域区块、点击拾取、框选多选、孤立显示、边界框、本地坐标轴。
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
import type { PoseKey, ThreeDCameraState, ThreeDProject, ToolMode } from '../types';

const props = withDefaults(
  defineProps<{
    project: ThreeDProject;
    tool: ToolMode;
    isolation?: boolean;
    showBoundingBox?: boolean;
    coordSpace?: 'world' | 'local';
    /** 选中资产 id 集合（多选） */
    selectedIds?: string[];
    /** 焦点请求：{ id, seq }，seq 变化时聚焦该资产 */
    focusRequest?: { id: string | null; seq: number };
  }>(),
  {
    isolation: false,
    showBoundingBox: false,
    coordSpace: 'world',
    selectedIds: () => [],
    focusRequest: () => ({ id: null, seq: 0 }),
  },
);

const emit = defineEmits<{
  select: [assetId: string | null, opts?: { additive?: boolean }];
  'select-many': [ids: string[], opts?: { additive?: boolean }];
  'webgl-failed': [];
  ready: [];
  'camera-change': [state: ThreeDCameraState];
  'shot-exit': [];
}>();

const container = ref<HTMLElement | null>(null);
const marquee = ref<{ x: number; y: number; w: number; h: number } | null>(null);

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
let pointerDownHit: string | null = null;
let marqueeStart: { x: number; y: number } | null = null;
let contextLostHandler: ((e: Event) => void) | null = null;
const boxHelpers: THREE.BoxHelper[] = [];
let localAxes: THREE.AxesHelper | null = null;

const reducedMotion = ref(false);

/** 资产结构签名：结构变化（增删 / 层级 / 灯光种类）才重建场景 */
const structureKey = computed(() =>
  props.project.assets
    .map((a) => `${a.id}:${a.parentId ?? ''}:${a.type === 'light' ? (a.light?.kind ?? '') : ''}`)
    .join('|'),
);

const assetSignature = computed(() =>
  props.project.assets
    .map(
      (a) =>
        `${a.id}:${a.transform.position.join(',')};${a.transform.rotation.join(',')};${a.transform.scale.join(',')};${a.visible};${a.locked};${a.color};${a.materialPreset};${JSON.stringify(a.materialParams)};${a.type === 'light' ? JSON.stringify(a.light) : ''}`,
    )
    .join('|'),
);

const regionSignature = computed(() => JSON.stringify(props.project.regions));

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

const poseKey = computed<PoseKey>(() =>
  props.project.type === 'character' ? (props.project.character?.pose ?? 'stand') : 'stand',
);

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
  const hasShadowLights = props.project.assets.some(
    (a) => a.type === 'light' && a.light?.shadowEnabled,
  );
  if (renderer.shadowMap) {
    renderer.shadowMap.enabled = hasShadowLights;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
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
  controls.autoRotate = false;
  controls.minDistance = 0.5;
  controls.maxDistance = 60;
  controls.addEventListener('change', () => {
    needsRender = true;
  });
  controls.addEventListener('start', () => {
    // 镜头模式下用户手动操作 → 退出镜头定位
    if (props.project.activeShotId) emit('shot-exit');
  });
  controls.addEventListener('end', () => {
    reportCamera();
  });

  applyCamera(props.project.cameraPreset);

  // 点击拾取 / 框选
  renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  renderer.domElement.addEventListener('pointerup', handlePointerUp);
  renderer.domElement.addEventListener('pointermove', handlePointerMove);

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

  // 按需渲染循环
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

function applyCamera(preset: string) {
  if (!camera || !controls) return;
  const p = cameraForPreset(preset as Parameters<typeof cameraForPreset>[0], props.project.type);
  camera.position.set(p.position[0], p.position[1], p.position[2]);
  controls.target.set(p.target[0], p.target[1], p.target[2]);
  controls.update();
  appliedCameraPreset.value = preset;
  needsRender = true;
  reportCamera();
}

function applyShotCamera(shotId: string | null) {
  if (!camera || !controls) return;
  const shot = props.project.shots.find((s) => s.id === shotId);
  if (!shot) return;
  camera.position.set(shot.position[0], shot.position[1], shot.position[2]);
  controls.target.set(shot.target[0], shot.target[1], shot.target[2]);
  camera.fov = shot.fov;
  camera.updateProjectionMatrix();
  controls.update();
  appliedCameraPreset.value = null;
  needsRender = true;
  reportCamera();
}

function reportCamera() {
  if (!camera || !controls) return;
  emit('camera-change', {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
    fov: Math.round(camera.fov * 10) / 10,
  });
}

/* ---------- 拾取与框选 ---------- */

function pickAssetAt(clientX: number, clientY: number): string | null {
  if (!renderer || !camera || !scene) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const hit of hits) {
    const id = hit.object.userData[ASSET_ID_KEY] as string | undefined;
    if (id) return id;
  }
  return null;
}

function handlePointerDown(e: PointerEvent) {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  pointerDownHit = pickAssetAt(e.clientX, e.clientY);
  marqueeStart = null;
  if (e.button === 0 && props.tool === 'select' && !pointerDownHit) {
    marqueeStart = { x: e.clientX, y: e.clientY };
  }
}

function handlePointerMove(e: PointerEvent) {
  if (!marqueeStart) return;
  if (Math.hypot(e.clientX - marqueeStart.x, e.clientY - marqueeStart.y) < 6) return;
  const rect = container.value?.getBoundingClientRect();
  if (!rect) return;
  const x0 = marqueeStart.x - rect.left;
  const y0 = marqueeStart.y - rect.top;
  const x1 = e.clientX - rect.left;
  const y1 = e.clientY - rect.top;
  marquee.value = {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

function handlePointerUp(e: PointerEvent) {
  const down = pointerDownPos;
  pointerDownPos = null;
  const hitAtDown = pointerDownHit;
  pointerDownHit = null;
  const marqueeRect = marquee.value;
  marquee.value = null;
  if (!down) return;
  // 框选：空白处拖动
  if (marqueeRect && e.button === 0) {
    if (marqueeRect.w > 6 && marqueeRect.h > 6) {
      const ids = assetsInMarquee(marqueeRect);
      if (ids.length > 0) emit('select-many', ids, { additive: e.ctrlKey || e.metaKey });
      else emit('select', null);
      return;
    }
  }
  // 单击拾取（拖动不触发）
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const id = hitAtDown;
  emit('select', id, { additive: e.ctrlKey || e.metaKey });
}

/** 框选：顶层资产世界位置投影到屏幕，落在矩形内即选中 */
function assetsInMarquee(rect: { x: number; y: number; w: number; h: number }): string[] {
  if (!renderer || !camera) return [];
  const el = renderer.domElement;
  const canvasRect = el.getBoundingClientRect();
  const projection = new THREE.Vector3();
  const out: string[] = [];
  for (const asset of props.project.assets) {
    if (asset.parentId || asset.type === 'light') continue;
    const node = built?.groups.get(asset.id);
    if (!node) continue;
    node.getWorldPosition(projection);
    projection.project(camera);
    const sx = (projection.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
    const sy = (-projection.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top;
    if (sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h) {
      out.push(asset.id);
    }
  }
  return out;
}

/* ---------- 响应式同步 ---------- */

watch(structureKey, () => {
  if (!renderer || !camera) return;
  rebuildScene();
});

watch(regionSignature, () => {
  if (!renderer || !camera) return;
  rebuildScene();
});

function rebuildScene() {
  if (!camera || !controls || !renderer) return;
  const oldBuilt = built;
  const next = buildScene(props.project);
  oldBuilt?.dispose();
  scene = next.scene;
  built = next;
  clearHelpers();
  camera.aspect = (container.value?.clientWidth || 1) / (container.value?.clientHeight || 1);
  camera.updateProjectionMatrix();
  const hasShadow = props.project.assets.some((a) => a.type === 'light' && a.light?.shadowEnabled);
  if (renderer.shadowMap) renderer.shadowMap.enabled = hasShadow;
  // 保持当前镜头（镜头模式优先）
  if (props.project.activeShotId) {
    applyShotCamera(props.project.activeShotId);
  } else {
    const preset = props.project.cameraPreset || 'perspective';
    applyCamera(preset);
  }
  syncAssets();
  needsRender = true;
}

/** 增量同步：变换 / 颜色 / 材质 / 可见性 / 姿态 / 选中态 / 孤立 / 边界框（不重建场景） */
function syncAssets() {
  if (!built) return;
  const selectedSet = new Set(props.selectedIds);
  const activeId = props.project.activeAssetId;
  const pose = poseKey.value;
  const isolation = props.isolation;
  for (const asset of props.project.assets) {
    const node = built.groups.get(asset.id);
    if (!node) continue;
    syncAssetNode(node, asset, selectedSet.has(asset.id) || asset.id === activeId, pose);
  }
  // 孤立显示：非选中子树隐藏（不修改数据）
  if (isolation) {
    for (const node of built.groups.values()) {
      const id = node.userData[ASSET_ID_KEY] as string;
      node.visible = selectedSet.has(id) || activeId === id;
    }
  }
  refreshHelpers();
  needsRender = true;
}

/** 边界框 + 本地坐标轴（不修改数据，仅视觉辅助） */
function refreshHelpers() {
  if (!built) return;
  clearHelpers();
  const ids = new Set([
    ...(props.selectedIds.length > 0
      ? props.selectedIds
      : props.project.activeAssetId
        ? [props.project.activeAssetId]
        : []),
  ]);
  if (props.showBoundingBox) {
    for (const id of ids) {
      const node = built.groups.get(id);
      if (!node) continue;
      const helper = new THREE.BoxHelper(node, 0xf59e0b);
      helper.userData[ASSET_ID_KEY] = id;
      built.scene.add(helper);
      boxHelpers.push(helper);
    }
  }
  if (props.coordSpace === 'local' && props.project.activeAssetId) {
    const node = built.groups.get(props.project.activeAssetId);
    if (node) {
      localAxes = new THREE.AxesHelper(0.7);
      node.add(localAxes);
    }
  }
}

function clearHelpers() {
  if (!built) return;
  for (const h of boxHelpers) {
    built.scene.remove(h);
    h.dispose();
  }
  boxHelpers.length = 0;
  if (localAxes && localAxes.parent) {
    localAxes.parent.remove(localAxes);
    localAxes.geometry.dispose();
    (localAxes.material as THREE.Material[]).forEach((m) => m.dispose());
    localAxes = null;
  }
}

watch(assetSignature, () => syncAssets());

watch(
  () =>
    [
      props.project.activeAssetId,
      props.selectedIds,
      props.isolation,
      props.showBoundingBox,
      props.coordSpace,
    ] as const,
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
    if (preset && preset !== appliedCameraPreset.value && !props.project.activeShotId) {
      applyCamera(preset);
    }
  },
);

watch(
  () => props.project.activeShotId,
  (shotId) => {
    if (shotId) applyShotCamera(shotId);
  },
);

watch(
  () => props.focusRequest.seq,
  () => {
    if (props.focusRequest.seq > 0) focusAsset(props.focusRequest.id);
  },
);

/** 聚焦：相机对准资产包围盒中心，距离按包围盒半径缩放 */
function focusAsset(id: string | null) {
  if (!camera || !controls || !built) return;
  if (!id) {
    applyCamera(props.project.cameraPreset);
    return;
  }
  const node = built.groups.get(id);
  if (!node) return;
  const box = new THREE.Box3().setFromObject(node);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.5);
  controls.target.copy(center);
  const dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
  dir.normalize();
  camera.position.copy(center).add(dir.multiplyScalar(radius * 2.4));
  camera.near = Math.max(radius / 100, 0.01);
  camera.far = Math.max(radius * 100, 100);
  camera.updateProjectionMatrix();
  controls.update();
  needsRender = true;
  reportCamera();
}

watch(
  () => props.tool,
  () => {
    marquee.value = null;
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
    renderer.domElement.removeEventListener('pointermove', handlePointerMove);
  }
  if (controls) {
    controls.dispose();
    controls = null;
  }
  clearHelpers();
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
    <!-- 框选遮罩 -->
    <div
      v-if="marquee"
      class="border-brand-500 bg-brand-500/15 pointer-events-none absolute z-10 border"
      :style="{
        left: `${marquee.x}px`,
        top: `${marquee.y}px`,
        width: `${marquee.w}px`,
        height: `${marquee.h}px`,
      }"
      aria-hidden="true"
    />
    <div
      v-if="webglFailed"
      class="bg-page absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center"
      data-testid="webgl-fallback"
      role="alert"
    >
      <p class="text-surface-800/70 text-sm font-medium">WebGL 初始化失败</p>
      <p class="text-surface-800/50 max-w-sm text-xs">
        当前环境无法创建 3D 渲染上下文。你仍然可以编辑项目结构、资产属性、角色 / 世界配置、
        镜头与生成简报（右侧面板），或点击下方按钮重试。
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
