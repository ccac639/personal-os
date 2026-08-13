/**
 * Chat 功能域 —— 3D 工作台 Three.js 引擎
 *
 * 从结构化项目数据构建场景图：只使用基础几何体与程序化材质，
 * 不使用外链模型 / 贴图 / 图片。提供完整的资源清理（几何体 / 材质 / 纹理）。
 * 本模块只被 canvas 组件引用；领域层与 store 不依赖 three。
 *
 * v2 新增：
 * - 材质预设扩展（金属/塑料/玻璃/地形）+ 受控参数（粗糙度/金属度/透明度/发光强度）
 * - light 资产渲染为真实灯光（环境光/方向光/点光/聚光灯）+ 编辑辅助标记
 * - 世界区域半透明区块与边界线（不遮挡主编辑、不参与拾取）
 * - 角色姿态偏移（确定性旋转/位移，无需骨骼）
 * - 多选高亮 / 材质预览
 */
import * as THREE from 'three';

import { applyPoseToTransform, poseOffsets } from '../poses';
import type {
  CameraPresetId,
  MaterialPresetId,
  PoseKey,
  ThreeDAsset,
  ThreeDProject,
  ThreeDSceneSettings,
} from '../types';

/** 场景图节点携带的资产 id */
export const ASSET_ID_KEY = 'assetId';
export const ASSET_NAME_KEY = 'assetName';
/** 选中高亮（克制：不闪烁，仅提高 emissive） */
const HIGHLIGHT_COLOR = new THREE.Color('#f59e0b');
/** 阴影灯上限（性能） */
const MAX_SHADOW_LIGHTS = 2;

/** 计算允许投射阴影的灯光资产 id 集合（前 N 盏启用的阴影灯） */
export function shadowLightIds(project: ThreeDProject): Set<string> {
  const ids = new Set<string>();
  let count = 0;
  for (const a of project.assets) {
    if (a.type === 'light' && a.light?.enabled && a.light.shadowEnabled) {
      if (count >= MAX_SHADOW_LIGHTS) continue;
      ids.add(a.id);
      count += 1;
    }
  }
  return ids;
}

export interface BuiltScene {
  scene: THREE.Scene;
  /** 顶层资产 group（key=资产 id） */
  groups: Map<string, THREE.Group>;
  /** 灯光资产 → 真实灯光对象 */
  lightObjects: Map<string, THREE.Light>;
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
  const lightObjects = new Map<string, THREE.Light>();

  const settings = project.sceneSettings;
  const pose = (project.type === 'character' ? project.character?.pose : undefined) ?? 'stand';

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

  // 世界区域：半透明区块 + 边界线（不遮挡主编辑）
  for (const region of project.regions) {
    const boxMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(region.color),
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    materials.push(boxMat);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), boxMat);
    box.position.set(region.center[0], region.center[1], region.center[2]);
    box.scale.set(region.size[0], region.size[1], region.size[2]);
    box.renderOrder = 5;
    box.userData.regionId = region.id;
    // 区域不参与拾取
    box.raycast = () => {};
    disposables.push(box.geometry);
    scene.add(box);

    const edgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(region.color),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    materials.push(edgeMat);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      edgeMat,
    );
    edges.position.copy(box.position);
    edges.scale.copy(box.scale);
    edges.renderOrder = 6;
    edges.userData.regionId = region.id;
    edges.raycast = () => {};
    disposables.push(edges.geometry);
    scene.add(edges);
  }

  // 资产 → 场景图
  const childrenOf = (parentId: string | null) =>
    project.assets.filter((a) => (a.parentId ?? null) === parentId);

  function buildAsset(asset: ThreeDAsset): THREE.Object3D {
    const node = buildNode(asset, materials, disposables, lightObjects);
    node.userData[ASSET_ID_KEY] = asset.id;
    node.userData[ASSET_NAME_KEY] = asset.name;
    applyTransform(node, asset);
    if (asset.type === 'character-placeholder') {
      applyPoseOffset(node, asset, pose);
    }
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

  // 阴影上限：仅前 N 盏启用的阴影灯投射（性能保护）
  const shadowIds = shadowLightIds(project);
  for (const [id, light] of lightObjects) {
    if (light.castShadow !== undefined) light.castShadow = shadowIds.has(id);
  }

  return {
    scene,
    groups,
    lightObjects,
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
  lightObjects: Map<string, THREE.Light>,
): THREE.Object3D {
  if (asset.type === 'group') {
    return new THREE.Group();
  }
  if (asset.type === 'light') {
    return buildLightNode(asset, materials, disposables, lightObjects);
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

/** 灯光资产：真实灯光 + 编辑辅助标记（方向光/聚光灯带方向指示） */
function buildLightNode(
  asset: ThreeDAsset,
  materials: THREE.Material[],
  disposables: Array<{ dispose: () => void }>,
  lightObjects: Map<string, THREE.Light>,
): THREE.Object3D {
  const light = asset.light ?? {
    kind: 'point',
    enabled: true,
    intensity: 1,
    color: '#ffffff',
    temperature: null,
    shadowEnabled: false,
    range: 12,
    angle: 45,
    target: [0, 0, 0],
  };
  const group = new THREE.Group();
  let threeLight: THREE.Light;
  if (light.kind === 'ambient') {
    threeLight = new THREE.AmbientLight(new THREE.Color(light.color), light.intensity);
  } else if (light.kind === 'directional') {
    const dir = new THREE.DirectionalLight(new THREE.Color(light.color), light.intensity);
    dir.target.position.set(light.target[0], light.target[1], light.target[2]);
    dir.castShadow = light.shadowEnabled;
    group.add(dir.target);
    threeLight = dir;
  } else if (light.kind === 'spot') {
    const spot = new THREE.SpotLight(new THREE.Color(light.color), light.intensity);
    spot.angle = (light.angle * Math.PI) / 180;
    spot.distance = light.range > 0 ? light.range : 0;
    spot.target.position.set(light.target[0], light.target[1], light.target[2]);
    spot.castShadow = light.shadowEnabled;
    group.add(spot.target);
    threeLight = spot;
  } else {
    const point = new THREE.PointLight(new THREE.Color(light.color), light.intensity);
    point.distance = light.range > 0 ? light.range : 0;
    point.castShadow = light.shadowEnabled;
    threeLight = point;
  }
  threeLight.visible = light.enabled;
  lightObjects.set(asset.id, threeLight);
  group.userData.lightObject = threeLight;
  group.add(threeLight);

  // 标记：八面体（灯光种类颜色）+ 方向指示线
  const markerMat = makeMaterial({ ...asset, materialPreset: 'emissive' }, materials);
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), markerMat);
  group.add(marker);
  disposables.push(marker.geometry);

  if (light.kind === 'directional' || light.kind === 'spot') {
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(light.color),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    materials.push(lineMat);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(
        light.target[0] - asset.transform.position[0],
        light.target[1] - asset.transform.position[1],
        light.target[2] - asset.transform.position[2],
      )
        .normalize()
        .multiplyScalar(0.9),
    ]);
    const line = new THREE.Line(lineGeo, lineMat);
    line.userData[ASSET_ID_KEY] = asset.id;
    line.raycast = () => {};
    disposables.push(lineGeo);
    group.add(line);
  }
  return group;
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

/** 材质预设 → 程序化材质（每个资产独立实例，便于高亮与销毁；受控参数来自 materialParams） */
function makeMaterial(asset: ThreeDAsset, materials: THREE.Material[]): THREE.Material {
  const color = new THREE.Color(asset.color);
  const p = asset.materialParams ?? {
    roughness: 0.6,
    metalness: 0.12,
    opacity: 1,
    emissiveIntensity: 0,
  };
  const opts = {
    color,
    roughness: clamp01(p.roughness),
    metalness: clamp01(p.metalness),
    transparent: p.opacity < 1,
    opacity: clamp01(p.opacity),
  };
  let material: THREE.Material;
  switch (asset.materialPreset) {
    case 'matte':
      material = new THREE.MeshStandardMaterial({ ...opts, roughness: 0.96, metalness: 0.02 });
      break;
    case 'metal':
      material = new THREE.MeshStandardMaterial({ ...opts, roughness: 0.35, metalness: 0.9 });
      break;
    case 'plastic':
      material = new THREE.MeshStandardMaterial({ ...opts, roughness: 0.35, metalness: 0.05 });
      break;
    case 'glass':
      material = new THREE.MeshStandardMaterial({
        ...opts,
        roughness: 0.1,
        metalness: 0,
        transparent: true,
        opacity: clamp01(p.opacity) === 1 ? 0.35 : clamp01(p.opacity),
      });
      break;
    case 'glossy':
      material = new THREE.MeshStandardMaterial({ ...opts, roughness: 0.16, metalness: 0.55 });
      break;
    case 'emissive':
      material = new THREE.MeshStandardMaterial({
        ...opts,
        roughness: 0.5,
        metalness: 0.1,
        emissive: color,
        emissiveIntensity: clamp05(p.emissiveIntensity) > 0 ? clamp05(p.emissiveIntensity) : 0.75,
      });
      break;
    case 'wireframe':
      material = new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: clamp01(p.opacity),
      });
      break;
    case 'translucent':
      material = new THREE.MeshStandardMaterial({
        ...opts,
        roughness: 0.4,
        metalness: 0.05,
        transparent: true,
        opacity: clamp01(p.opacity) === 1 ? 0.45 : clamp01(p.opacity),
      });
      break;
    case 'terrain':
      material = new THREE.MeshStandardMaterial({ ...opts, roughness: 1, metalness: 0 });
      break;
    default:
      material = new THREE.MeshStandardMaterial({ ...opts, roughness: 0.6, metalness: 0.12 });
  }
  materials.push(material);
  return material;
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}
function clamp05(v: number): number {
  return Math.min(Math.max(v, 0), 5);
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

/** 角色部位叠加姿态偏移（确定性旋转 / 位移） */
function applyPoseOffset(node: THREE.Object3D, asset: ThreeDAsset, pose: PoseKey) {
  const off = poseOffsets(pose, asset.name);
  if (
    off.position[0] === 0 &&
    off.position[1] === 0 &&
    off.position[2] === 0 &&
    off.rotation[0] === 0 &&
    off.rotation[1] === 0 &&
    off.rotation[2] === 0
  ) {
    return;
  }
  node.position.add(new THREE.Vector3(off.position[0], off.position[1], off.position[2]));
  node.rotation.x += (off.rotation[0] * Math.PI) / 180;
  node.rotation.y += (off.rotation[1] * Math.PI) / 180;
  node.rotation.z += (off.rotation[2] * Math.PI) / 180;
}

/** 同步单资产到场景节点（变换 / 可见性 / 材质 / 灯光 / 姿态 / 选中态） */
export function syncAssetNode(
  node: THREE.Object3D,
  asset: ThreeDAsset,
  selected: boolean,
  pose: PoseKey = 'stand',
) {
  applyTransform(node, asset);
  if (asset.type === 'character-placeholder') {
    applyPoseOffset(node, asset, pose);
  }
  node.visible = asset.visible;
  if (asset.type === 'light' && node.userData.lightObject instanceof THREE.Light) {
    syncLightObject(node.userData.lightObject, asset);
  }
  node.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material) return;
    if (material instanceof THREE.MeshStandardMaterial) {
      material.color.set(asset.color);
      const p = asset.materialParams;
      if (p) {
        material.roughness = clamp01(p.roughness);
        material.metalness = clamp01(p.metalness);
        material.transparent =
          p.opacity < 1 ||
          asset.materialPreset === 'glass' ||
          asset.materialPreset === 'translucent';
        material.opacity = clamp01(p.opacity);
      }
      if (selected) {
        material.emissive.copy(HIGHLIGHT_COLOR);
        material.emissiveIntensity = 0.32;
      } else if (asset.materialPreset === 'emissive') {
        material.emissive.copy(new THREE.Color(asset.color));
        material.emissiveIntensity = clamp05(asset.materialParams?.emissiveIntensity ?? 0.75);
      } else {
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 1;
      }
    } else if (material instanceof THREE.MeshBasicMaterial) {
      material.color.set(asset.color);
    }
  });
}

/** 灯光对象参数同步（颜色 / 强度 / 范围 / 角度 / 启用） */
function syncLightObject(light: THREE.Light, asset: ThreeDAsset) {
  const cfg = asset.light;
  if (!cfg) return;
  light.visible = cfg.enabled;
  light.color.set(cfg.color);
  if (light instanceof THREE.AmbientLight) {
    light.intensity = cfg.intensity;
    return;
  }
  light.intensity = cfg.intensity;
  if (light instanceof THREE.PointLight) {
    light.distance = cfg.range > 0 ? cfg.range : 0;
  } else if (light instanceof THREE.SpotLight) {
    light.angle = (cfg.angle * Math.PI) / 180;
    light.distance = cfg.range > 0 ? cfg.range : 0;
    light.target.position.set(cfg.target[0], cfg.target[1], cfg.target[2]);
  } else if (light instanceof THREE.DirectionalLight) {
    light.target.position.set(cfg.target[0], cfg.target[1], cfg.target[2]);
  }
}

/** 选中高亮应用到整个资产子树（多选：selected 集合包含即高亮） */
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

/** 供测试 / 工具使用：姿态偏移叠加 */
export { applyPoseToTransform, poseOffsets };

/** 构建时使用的材质预设（类型引用，便于测试断言） */
export type { MaterialPresetId };
