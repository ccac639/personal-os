/**
 * Chat 功能域 —— 3D 工作台 Three.js 引擎
 *
 * 从结构化项目数据构建场景图：只使用基础几何体与程序化材质，
 * 不使用外链模型 / 贴图 / 图片。提供完整的资源清理（几何体 / 材质 / 纹理）。
 * 本模块只被 canvas 组件引用；领域层与 store 不依赖 three。
 */
import * as THREE from 'three';

import type {
  CameraPresetId,
  MaterialPresetId,
  ThreeDAsset,
  ThreeDProject,
  ThreeDSceneSettings,
} from '../types';

/** 场景图节点携带的资产 id */
export const ASSET_ID_KEY = 'assetId';
export const ASSET_NAME_KEY = 'assetName';
/** 选中高亮（克制：不闪烁，仅提高 emissive） */
const HIGHLIGHT_COLOR = new THREE.Color('#f59e0b');

export interface BuiltScene {
  scene: THREE.Scene;
  /** 顶层资产 group（key=资产 id） */
  groups: Map<string, THREE.Group>;
  /** 主光（方向光） */
  mainLight: THREE.DirectionalLight;
  ambientLight: THREE.AmbientLight;
  grid: THREE.GridHelper | null;
  axes: THREE.AxesHelper | null;
  ground: THREE.Mesh | null;
  dispose: () => void;
}

export function buildScene(project: ThreeDProject): BuiltScene {
  const scene = new THREE.Scene();
  const groups = new Map<string, THREE.Group>();
  const disposables: Array<{ dispose: () => void }> = [];
  const materials: THREE.Material[] = [];

  const settings = project.sceneSettings;

  // 背景与雾
  scene.background = new THREE.Color(settings.background);
  if (settings.fog.enabled) {
    scene.fog = new THREE.Fog(
      new THREE.Color(settings.fog.color),
      settings.fog.near,
      settings.fog.far,
    );
  }

  // 灯光：环境光 + 主光（程序化）
  const ambientLight = new THREE.AmbientLight(
    new THREE.Color(settings.ambientLight.color),
    settings.ambientLight.intensity,
  );
  ambientLight.visible = settings.ambientLight.enabled;
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(
    new THREE.Color(settings.mainLight.color),
    settings.mainLight.intensity,
  );
  mainLight.position.set(...settings.mainLight.position);
  mainLight.visible = settings.mainLight.enabled;
  scene.add(mainLight);
  scene.add(mainLight.target);

  // 地面 + 网格 + 坐标轴
  let ground: THREE.Mesh | null = null;
  if (settings.groundVisible) {
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(settings.groundColor),
      roughness: 1,
      metalness: 0,
    });
    materials.push(groundMaterial);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    disposables.push(ground.geometry);
    scene.add(ground);
  }

  let grid: THREE.GridHelper | null = null;
  if (settings.gridVisible) {
    const dark = luminance(settings.background) < 0.5;
    grid = new THREE.GridHelper(
      40,
      40,
      dark ? new THREE.Color('#475569') : new THREE.Color('#94a3b8'),
      dark ? new THREE.Color('#334155') : new THREE.Color('#cbd5e1'),
    );
    grid.position.y = 0.001;
    grid.material.transparent = true;
    grid.material.opacity = 0.85;
    scene.add(grid);
  }

  let axes: THREE.AxesHelper | null = null;
  if (settings.axesVisible) {
    axes = new THREE.AxesHelper(2.5);
    axes.position.y = 0.01;
    scene.add(axes);
  }

  // 资产 → 场景图
  const childrenOf = (parentId: string | null) =>
    project.assets.filter((a) => (a.parentId ?? null) === parentId);

  function buildAsset(asset: ThreeDAsset): THREE.Object3D {
    const node = buildNode(asset, materials, disposables);
    node.userData[ASSET_ID_KEY] = asset.id;
    node.userData[ASSET_NAME_KEY] = asset.name;
    applyTransform(node, asset);
    node.visible = asset.visible;
    return node;
  }

  function walk(parentId: string | null): THREE.Object3D[] {
    const nodes: THREE.Object3D[] = [];
    for (const asset of childrenOf(parentId)) {
      const node = buildAsset(asset);
      const children = walk(asset.id);
      for (const child of children) node.add(child);
      nodes.push(node);
    }
    return nodes;
  }

  for (const node of walk(null)) {
    scene.add(node);
    const id = node.userData[ASSET_ID_KEY] as string;
    groups.set(id, node as THREE.Group);
  }

  return {
    scene,
    groups,
    mainLight,
    ambientLight,
    grid,
    axes,
    ground,
    dispose: () => {
      for (const m of materials) m.dispose();
      for (const d of disposables) d.dispose();
      // 不要在 traverse 回调中修改 children（会导致 undefined 子节点）；
      // scene.clear() 一次性移除所有子对象
      scene.clear();
    },
  };
}

/** 根据资产类型构建节点（基础几何体 + 程序化材质） */
function buildNode(
  asset: ThreeDAsset,
  materials: THREE.Material[],
  disposables: Array<{ dispose: () => void }>,
): THREE.Object3D {
  if (asset.type === 'group') {
    return new THREE.Group();
  }
  if (asset.type === 'light') {
    // 灯光标记：不自发光照（场景灯光由 sceneSettings 控制），仅视觉占位
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18),
      makeMaterial(asset, materials),
    );
    disposables.push(marker.geometry);
    return marker;
  }
  if (asset.type === 'camera-marker') {
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.4, 4),
      makeMaterial(asset, materials),
    );
    marker.rotation.x = Math.PI; // 锥尖指向 -Z（相机朝向）
    disposables.push(marker.geometry);
    return marker;
  }
  if (asset.type === 'primitive') {
    const mesh = new THREE.Mesh(
      primitiveGeometry(asset.primitiveKind ?? 'cube'),
      makeMaterial(asset, materials),
    );
    disposables.push(mesh.geometry);
    return mesh;
  }
  if (asset.type === 'character-placeholder') {
    return buildCharacterPart(asset, materials, disposables);
  }
  if (asset.type === 'world-placeholder') {
    return buildWorldPart(asset, materials, disposables);
  }
  return new THREE.Group();
}

/** 角色占位部件：按名称启发式选择基础形体 */
function buildCharacterPart(
  asset: ThreeDAsset,
  materials: THREE.Material[],
  disposables: Array<{ dispose: () => void }>,
): THREE.Object3D {
  const name = asset.name;
  const mat = makeMaterial(asset, materials);
  if (name.includes('头')) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), mat);
    disposables.push(mesh.geometry);
    return mesh;
  }
  if (name.includes('臂') || name.includes('腿')) {
    // 圆柱近似四肢
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 16), mat);
    disposables.push(mesh.geometry);
    return mesh;
  }
  // 默认（躯干 / 其他）：长方体
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  disposables.push(mesh.geometry);
  return mesh;
}

/** 世界占位部件：地面 / 建筑 / 植被等基础形体组合 */
function buildWorldPart(
  asset: ThreeDAsset,
  materials: THREE.Material[],
  disposables: Array<{ dispose: () => void }>,
): THREE.Object3D {
  const name = asset.name;
  const mat = makeMaterial(asset, materials);
  if (name.includes('植被') || name.includes('树')) {
    // 树：树干 + 树冠（cone）
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 10), mat);
    trunk.position.y = 0.25;
    const crownMat = makeMaterial({ ...asset, color: shade(asset.color, 0.85) }, materials);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 10), crownMat);
    crown.position.y = 0.95;
    group.add(trunk, crown);
    disposables.push(trunk.geometry, crown.geometry);
    return group;
  }
  // 默认：长方体块（建筑 / 地面 / 道路 / 区域块）
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  disposables.push(mesh.geometry);
  return mesh;
}

/** 基础几何体 */
function primitiveGeometry(kind: NonNullable<ThreeDAsset['primitiveKind']>): THREE.BufferGeometry {
  switch (kind) {
    case 'cube':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 24, 16);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1, 20);
    case 'plane':
      return new THREE.PlaneGeometry(1, 1);
    case 'torus':
      return new THREE.TorusGeometry(0.4, 0.16, 12, 28);
  }
}

/** 材质预设 → 程序化材质（每个资产独立实例，便于高亮与销毁） */
function makeMaterial(asset: ThreeDAsset, materials: THREE.Material[]): THREE.Material {
  const color = new THREE.Color(asset.color);
  let material: THREE.Material;
  switch (asset.materialPreset) {
    case 'matte':
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.96, metalness: 0.02 });
      break;
    case 'glossy':
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.16, metalness: 0.55 });
      break;
    case 'emissive':
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: 0.75,
      });
      break;
    case 'wireframe':
      material = new THREE.MeshBasicMaterial({ color, wireframe: true });
      break;
    case 'translucent':
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.4,
        metalness: 0.05,
        transparent: true,
        opacity: 0.45,
      });
      break;
    default:
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.12 });
  }
  materials.push(material);
  return material;
}

function applyTransform(node: THREE.Object3D, asset: ThreeDAsset) {
  node.position.set(
    asset.transform.position[0],
    asset.transform.position[1],
    asset.transform.position[2],
  );
  node.rotation.set(
    (asset.transform.rotation[0] * Math.PI) / 180,
    (asset.transform.rotation[1] * Math.PI) / 180,
    (asset.transform.rotation[2] * Math.PI) / 180,
  );
  node.scale.set(asset.transform.scale[0], asset.transform.scale[1], asset.transform.scale[2]);
}

/** 同步单资产到场景节点（变换 / 可见性 / 材质 / 选中态） */
export function syncAssetNode(node: THREE.Object3D, asset: ThreeDAsset, selected: boolean) {
  applyTransform(node, asset);
  node.visible = asset.visible;
  node.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material) return;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.set(asset.color);
      if (selected) {
        material.emissive.copy(HIGHLIGHT_COLOR);
        material.emissiveIntensity = 0.32;
      } else if (asset.materialPreset === 'emissive') {
        material.emissive.copy(new THREE.Color(asset.color));
        material.emissiveIntensity = 0.75;
      } else {
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 1;
      }
    } else if (material instanceof THREE.MeshBasicMaterial) {
      material.color.set(asset.color);
    }
  });
}

/** 选中高亮应用到整个资产子树 */
export function applySelection(node: THREE.Object3D, selected: boolean, baseAsset: ThreeDAsset) {
  syncAssetNode(node, baseAsset, selected);
}

/** 相机预设（位置 + 目标） */
export function cameraForPreset(
  preset: CameraPresetId,
  projectType: ThreeDProject['type'],
): { position: [number, number, number]; target: [number, number, number] } {
  const charTarget: [number, number, number] = [0, 1.1, 0];
  const worldTarget: [number, number, number] = [0, 0.5, 0];
  const propTarget: [number, number, number] = [0, 0.6, 0];
  const target =
    projectType === 'character' ? charTarget : projectType === 'world' ? worldTarget : propTarget;
  switch (preset) {
    case 'front':
      return { position: [0, 1.1, 6], target };
    case 'side':
      return { position: [6, 1.1, 0], target };
    case 'top':
      return { position: [0, 10, 0.001], target: [0, 0, 0] };
    case 'closeup':
      return { position: [0, 1.4, 2.4], target: charTarget };
    case 'birdseye':
      return { position: [0, 12, 8], target: worldTarget };
    case 'fullbody':
      return { position: [0, 1.3, 4.5], target: charTarget };
    case 'halfbody':
      return { position: [0, 1.5, 2.2], target: [0, 1.4, 0] };
    case 'face':
      return { position: [0, 1.7, 1.1], target: [0, 1.62, 0] };
    case 'back':
      return { position: [0, 1.1, -4.5], target: charTarget };
    case 'threeview':
      return { position: [3.2, 1.6, 3.2], target: charTarget };
    case 'street':
      return { position: [0, 1.8, 6], target: worldTarget };
    case 'ground':
      return { position: [0, 0.5, 3.5], target: [0, 0.1, 0] };
    case 'building':
      return { position: [-5, 4, -3], target: [0, 1.5, 0] };
    default:
      return { position: [4.5, 3.5, 6], target };
  }
}

/** 场景设置同步（不重建场景） */
export function syncSceneSettings(
  scene: THREE.Scene,
  built: BuiltScene,
  settings: ThreeDSceneSettings,
) {
  scene.background = new THREE.Color(settings.background);
  if (settings.fog.enabled) {
    scene.fog = new THREE.Fog(
      new THREE.Color(settings.fog.color),
      settings.fog.near,
      settings.fog.far,
    );
  } else {
    scene.fog = null;
  }
  built.ambientLight.color.set(settings.ambientLight.color);
  built.ambientLight.intensity = settings.ambientLight.intensity;
  built.ambientLight.visible = settings.ambientLight.enabled;
  built.mainLight.color.set(settings.mainLight.color);
  built.mainLight.intensity = settings.mainLight.intensity;
  built.mainLight.position.set(...settings.mainLight.position);
  built.mainLight.visible = settings.mainLight.enabled;
  if (built.ground && built.ground.material instanceof THREE.MeshStandardMaterial) {
    built.ground.material.color.set(settings.groundColor);
  }
  if (built.grid) {
    built.grid.visible = settings.gridVisible;
  }
  if (built.axes) {
    built.axes.visible = settings.axesVisible;
  }
}

function luminance(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function shade(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return `#${c.getHexString()}`;
}

/** 构建时使用的材质预设（类型引用，便于测试断言） */
export type { MaterialPresetId };
