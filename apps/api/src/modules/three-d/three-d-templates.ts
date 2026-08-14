import type {
  AssetNodeData,
  CameraConfig,
  CharacterConfig,
  GenerationBrief,
  StoryboardShot,
  WorldRegion,
} from './three-d.schema.js';

/** 3D 项目模板：仅结构化元数据，无任何文件/二进制引用 */
export interface ThreeDTemplate {
  id: string;
  name: string;
  description: string;
  defaults: {
    assets: AssetNodeData[];
    characters: CharacterConfig[];
    worldRegions: WorldRegion[];
    storyboards: StoryboardShot[];
    brief?: GenerationBrief;
  };
}

const characterCamera: CameraConfig = {
  position: [0, 1.6, 3.5],
  target: [0, 1, 0],
  fov: 45,
};

export const THREE_D_TEMPLATES: ThreeDTemplate[] = [
  {
    id: 'tpl_blank',
    name: '空白项目',
    description: '从零开始，不含任何预置内容',
    defaults: { assets: [], characters: [], worldRegions: [], storyboards: [] },
  },
  {
    id: 'tpl_character-showcase',
    name: '角色展示',
    description: '预置角色根节点、基础灯光与展示镜头，适合角色概念展示',
    defaults: {
      assets: [
        {
          id: 'ast_root',
          parentId: null,
          name: '角色资产',
          kind: 'folder',
          meta: { note: '角色相关资源' },
        },
        {
          id: 'ast_root_mesh',
          parentId: 'ast_root',
          name: '角色模型',
          kind: 'mesh',
          meta: { lod: 'high' },
        },
        {
          id: 'ast_root_mat',
          parentId: 'ast_root',
          name: '主材质',
          kind: 'material',
          meta: { roughness: 0.5 },
        },
        {
          id: 'ast_light',
          parentId: null,
          name: '主光',
          kind: 'light',
          meta: { intensity: 1.2, color: '#ffffff' },
        },
        { id: 'ast_cam', parentId: null, name: '展示镜头', kind: 'camera', meta: { fov: 45 } },
      ],
      characters: [
        {
          id: 'chr_main',
          name: '主角',
          description: '待设计的展示角色',
          role: 'protagonist',
          appearance: { style: 'stylized', palette: 'warm' },
          props: [],
        },
      ],
      worldRegions: [],
      storyboards: [
        {
          id: 'shot_hero',
          name: '主角特写',
          description: '正面 3/4 角度特写',
          sequence: 1,
          durationSeconds: 5,
          camera: characterCamera,
        },
      ],
    },
  },
  {
    id: 'tpl_storyboard',
    name: '分镜脚本',
    description: '预置三镜头分镜：开场 / 中景 / 特写',
    defaults: {
      assets: [
        { id: 'ast_root', parentId: null, name: '场景资产', kind: 'folder', meta: {} },
        { id: 'ast_light', parentId: null, name: '主光', kind: 'light', meta: { intensity: 1 } },
      ],
      characters: [],
      worldRegions: [],
      storyboards: [
        {
          id: 'shot_open',
          name: '开场全景',
          description: '交代环境与氛围',
          sequence: 1,
          durationSeconds: 6,
          camera: { position: [0, 3, 10], target: [0, 1, 0], fov: 60 },
        },
        {
          id: 'shot_mid',
          name: '中景对话',
          description: '角色互动',
          sequence: 2,
          durationSeconds: 8,
          camera: { position: [2, 1.6, 4], target: [0, 1.2, 0], fov: 50 },
        },
        {
          id: 'shot_close',
          name: '特写',
          description: '情绪表达',
          sequence: 3,
          durationSeconds: 4,
          camera: { position: [0, 1.6, 2], target: [0, 1.4, 0], fov: 40 },
        },
      ],
    },
  },
];
