import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatStore } from '@/features/chat/store';
import {
  MAX_PROJECTS,
  THREE_D_STORAGE_KEY,
  THREE_D_STORAGE_VERSION,
} from '@/features/chat/three-d';
import {
  DeterministicMockGenerationService,
  setThreeDGenerationService,
} from '@/features/chat/three-d/service';
import { useThreeDWorkspaceStore } from '@/features/chat/three-d/store';
import type { ThreeDGenerationService } from '@/features/chat/three-d/types';

describe('3D store：项目 CRUD 与状态', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('首次使用播种三个概念项目', () => {
    const store = useThreeDWorkspaceStore();
    expect(store.projectCount).toBe(3);
    const types = store.projects.map((p) => p.type).sort();
    expect(types).toEqual(['character', 'prop', 'world']);
  });

  it('新建 / 重命名 / 状态 / 删除', () => {
    const store = useThreeDWorkspaceStore();
    const created = store.addProject({ name: ' 我的项目 ', type: 'prop' });
    expect(created!.name).toBe('我的项目');
    expect(store.activeProjectId).toBe(created!.id);
    expect(store.renameProject('改名项目')).toBe(true);
    expect(store.activeProject!.name).toBe('改名项目');
    expect(store.setProjectStatus('ready')).toBe(true);
    expect(store.activeProject!.status).toBe('ready');
    expect(store.deleteProject(created!.id)).toBe(true);
    expect(store.projectCount).toBe(3);
  });

  it('创作模式切换：保留资产并初始化模式字段', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '切换', type: 'character' });
    const assetCount = store.activeProject!.assets.length;
    store.switchProjectType('world');
    expect(store.activeProject!.type).toBe('world');
    expect(store.activeProject!.assets).toHaveLength(assetCount);
    expect(store.activeProject!.world).toBeDefined();
  });

  it('项目数量上限：逐出最旧非种子项目', () => {
    const store = useThreeDWorkspaceStore();
    for (let i = 0; i < MAX_PROJECTS; i += 1) {
      store.addProject({ name: `项目 ${i}`, type: 'prop' });
    }
    expect(store.projectCount).toBeLessThanOrEqual(MAX_PROJECTS);
    // 种子项目保留
    expect(store.projects.some((p) => p.id === 'seed-character-01')).toBe(true);
  });
});

describe('3D store：资产操作与撤销重做', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('新增 / 复制 / 锁定 / 显隐 / 删除', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '道具', type: 'prop' });
    const cube = store.addAsset({ type: 'primitive', primitiveKind: 'cube' })!;
    expect(store.activeAsset!.name).toBe('立方体');

    const copy = store.copyAsset(cube.id)!;
    expect(copy.id).not.toBe(cube.id);
    expect(store.activeProject!.assets).toHaveLength(2);

    store.toggleAssetLocked(copy.id);
    expect(store.activeProject!.assets.find((a) => a.id === copy.id)!.locked).toBe(true);
    store.toggleAssetVisible(cube.id);
    expect(store.activeProject!.assets.find((a) => a.id === cube.id)!.visible).toBe(false);

    expect(store.removeAsset(copy.id)).toBe(true);
    expect(store.activeProject!.assets).toHaveLength(1);
  });

  it('变换 / 颜色进入撤销栈并可撤销重做', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '道具', type: 'prop' });
    const cube = store.addAsset({ type: 'primitive', primitiveKind: 'cube' })!;

    store.setAssetTransform(cube.id, {
      position: [2, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
    expect(store.activeAsset!.transform.position).toEqual([2, 0, 0]);
    store.setAssetColor(cube.id, '#ff0000');
    expect(store.activeAsset!.color).toBe('#ff0000');
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.activeAsset!.color).toBe('#6366f1');
    store.undo();
    expect(store.activeAsset!.transform.position).toEqual([0, 0, 0]);
    expect(store.canRedo).toBe(true);
    store.redo();
    expect(store.activeAsset!.transform.position).toEqual([2, 0, 0]);
  });

  it('撤销覆盖新增 / 删除 / 复制 / 场景设置', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '道具', type: 'prop' });
    const cube = store.addAsset({ type: 'primitive', primitiveKind: 'cube' })!;
    expect(store.activeProject!.assets).toHaveLength(1);
    store.undo();
    expect(store.activeProject!.assets).toHaveLength(0);
    store.redo();
    expect(store.activeProject!.assets).toHaveLength(1);

    store.removeAsset(cube.id);
    store.undo();
    expect(store.activeProject!.assets).toHaveLength(1);

    store.copyAsset(cube.id);
    store.undo();
    expect(store.activeProject!.assets).toHaveLength(1);

    store.updateScene({ background: '#000000' });
    expect(store.activeProject!.sceneSettings.background).toBe('#000000');
    store.undo();
    expect(store.activeProject!.sceneSettings.background).not.toBe('#000000');
  });

  it('切换项目清空撤销栈，避免跨项目误操作', () => {
    const store = useThreeDWorkspaceStore();
    const a = store.addProject({ name: 'A', type: 'prop' })!;
    store.addAsset({ type: 'primitive', primitiveKind: 'cube' });
    expect(store.canUndo).toBe(true);
    store.selectProject(a.id);
    // selectProject 已激活 a；再切到种子项目
    store.selectProject('seed-world-01');
    expect(store.canUndo).toBe(false);
  });
});

describe('3D store：持久化', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('自动保存 { version, data } 信封，不存 WebGL 对象', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '持久化项目', type: 'prop' });
    store.addAsset({ type: 'primitive', primitiveKind: 'sphere' });
    store.flushSave();
    const raw = localStorage.getItem(THREE_D_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { version: number; data: { projects: unknown[] } };
    expect(parsed.version).toBe(THREE_D_STORAGE_VERSION);
    expect(parsed.data.projects.length).toBeGreaterThan(0);
    const json = JSON.stringify(parsed);
    expect(json).not.toMatch(/renderer|texture|geometry|webgl|gltf|fbx|base64/i);
  });

  it('损坏数据回退默认 + recovered 标志', () => {
    localStorage.setItem(THREE_D_STORAGE_KEY, '{oops');
    const store = useThreeDWorkspaceStore();
    expect(store.recovered).toBe(true);
    expect(store.projectCount).toBeGreaterThanOrEqual(3);
  });

  it('版本过新：tooNew 标志且保留原数据', () => {
    localStorage.setItem(
      THREE_D_STORAGE_KEY,
      JSON.stringify({ version: 99, data: { projects: [], ui: {} } }),
    );
    const store = useThreeDWorkspaceStore();
    expect(store.tooNew).toBe(true);
    expect(localStorage.getItem(THREE_D_STORAGE_KEY)).toContain('"version":99');
  });

  it('写入失败不崩溃，更改保留在内存', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const store = useThreeDWorkspaceStore();
    expect(() => store.addProject({ name: '内存项目', type: 'prop' })).not.toThrow();
    expect(store.projects.some((p) => p.name === '内存项目')).toBe(true);
    spy.mockRestore();
  });

  it('重载后恢复项目与 UI 偏好', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '恢复测试', type: 'world' });
    store.ui.tool = 'scale';
    store.ui.bottomOpen = true;
    store.flushSave();
    setActivePinia(createPinia());
    const store2 = useThreeDWorkspaceStore();
    expect(store2.projects.some((p) => p.name === '恢复测试')).toBe(true);
    expect(store2.ui.tool).toBe('scale');
    expect(store2.ui.bottomOpen).toBe(true);
  });
});

describe('3D store：导入导出', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('导入预览 → 确认入库；重复 id 复制为新项目', () => {
    const store = useThreeDWorkspaceStore();
    const seed = store.projects[0]!;
    const exportJson = JSON.stringify({
      app: 'personal-os-3d',
      version: 1,
      kind: 'projects',
      exportedAt: Date.now(),
      projects: [
        seed,
        { ...seed, id: 'incoming-new', name: '导入的新项目' },
        { id: 'bad', name: '', type: 'unknown-type', assets: [] },
      ],
    });
    const preview = store.previewImport(exportJson);
    expect(preview.ok).toBe(true);
    expect(store.pendingImport!.preview.validCount).toBe(2);
    expect(store.pendingImport!.preview.invalidCount).toBe(1);
    const result = store.commitImport();
    expect(result!.added).toBe(1);
    expect(result!.copied).toBe(1);
    expect(store.projects.some((p) => p.name.includes('（导入）'))).toBe(true);
    expect(store.projects.filter((p) => p.id === seed.id)).toHaveLength(1);
  });

  it('无效导入文本返回错误', () => {
    const store = useThreeDWorkspaceStore();
    expect(store.previewImport('not json').ok).toBe(false);
    expect(store.previewImport(JSON.stringify({ app: 'wrong' })).ok).toBe(false);
  });
});

describe('3D store：生成简报与 mock service 注入', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('简报文本随项目字段生成', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '角色：剑士', type: 'character' });
    expect(store.briefText).toContain('角色：剑士');
    store.updateCharacterFields({ role: '前锋剑士' });
    expect(store.briefText).toContain('角色定位：前锋剑士');
  });

  it('自定义简报文本可编辑与重置', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: 'X', type: 'prop' });
    store.setBriefText('自定义文本');
    expect(store.briefText).toBe('自定义文本');
    store.resetBriefText();
    expect(store.briefText).toContain('X');
  });

  it('mock service 生成结构化草稿（仅本地预览）', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '世界', type: 'world' });
    const draft = await store.runGenerationDraft();
    expect(draft).not.toBeNull();
    expect(draft!.status).toBe('draft');
    expect(draft!.source).toBe('mock');
    expect(draft!.plan.length).toBeGreaterThan(0);
    expect(draft!.suggestedAssets.length).toBeGreaterThan(0);
    expect(draft!.note).toContain('仅本地预览');
    expect(store.generationDraft).not.toBeNull();
  });

  it('注入自定义 service：UI / Store 领域逻辑不变', async () => {
    const custom: ThreeDGenerationService = {
      createDraft: vi.fn(async (input) => ({
        requestId: 'custom-1',
        status: 'draft',
        source: 'mock',
        projectType: input.projectType,
        plan: ['自定义计划步骤'],
        suggestedAssets: [],
        suggestedLights: [],
        suggestedCamera: { preset: 'perspective', note: '自定义' },
        createdAt: Date.now(),
        note: '仅本地预览',
      })),
    };
    setThreeDGenerationService(custom);
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '道具', type: 'prop' });
    const draft = await store.runGenerationDraft();
    expect(draft!.plan).toEqual(['自定义计划步骤']);
    expect(store.generationDraft!.suggestedCamera.preset).toBe('perspective');
    setThreeDGenerationService(new DeterministicMockGenerationService());
  });
});

describe('3D store：Chat 联动', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('从助手消息创建 3D 项目草稿：仅结构化文本，不自动执行', async () => {
    const chat = useChatStore();
    chat.deleteSession(chat.activeId!);
    chat.sendMessage('帮我设计一个赛博武士角色');
    // 等待流式回复完成（打字机推进，最长 8s）
    await vi.waitFor(
      () => {
        expect(chat.isStreaming).toBe(false);
        expect(chat.activeSession!.messages[1]!.content.length).toBeGreaterThan(0);
      },
      { timeout: 8000 },
    );
    const msg = chat.activeSession!.messages[1]!;
    const store = useThreeDWorkspaceStore();
    expect(store.saveFromMessage(msg.id)).toBe(true);
    expect(store.pendingFromMessage).not.toBeNull();
    expect(store.pendingFromMessage!.sourceText.length).toBeGreaterThan(0);
    const project = store.commitFromMessage({
      name: store.pendingFromMessage!.name,
      type: 'character',
      description: store.pendingFromMessage!.description,
    });
    expect(project).not.toBeNull();
    expect(store.projects.some((p) => p.name === project!.name)).toBe(true);
    expect(store.pendingFromMessage).toBeNull();
    // 不自动执行：没有调用任何生成 service 的痕迹
    expect(store.generationDraft).toBeNull();
  });

  it('二进制 / 附件消息拒绝创建草稿', async () => {
    const chat = useChatStore();
    chat.deleteSession(chat.activeId!);
    chat.sendMessage('data:image/png;base64,AAAA');
    await vi.waitFor(
      () => {
        expect(chat.isStreaming).toBe(false);
      },
      { timeout: 8000 },
    );
    // 构造二进制占位内容验证拒绝路径
    chat.activeSession!.messages[1]!.content = 'data:image/png;base64,AAAA';
    const msg = chat.activeSession!.messages[1]!;
    const store = useThreeDWorkspaceStore();
    expect(store.saveFromMessage(msg.id)).toBe(false);
    expect(store.pendingFromMessage).toBeNull();
  });

  it('从 3D 工作台返回 Chat：创建会话草稿，不自动发送', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '集市街区', type: 'world' });
    const chat = useChatStore();
    chat.deleteSession(chat.activeId!);
    const sessionId = store.createChatDraft();
    expect(sessionId).not.toBeNull();
    expect(chat.activeSession?.messages).toHaveLength(0);
    expect(chat.composerDraft).toContain('集市街区');
    expect(chat.composerDraft).toContain('3D 工作台');
  });
});

describe('3D store：种子项目类型与导出', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('种子项目可导出为合法文件', () => {
    const store = useThreeDWorkspaceStore();
    const json = JSON.stringify({
      app: 'personal-os-3d',
      version: 1,
      kind: 'project',
      exportedAt: Date.now(),
      project: store.activeProject,
    });
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe('personal-os-3d');
    expect(json).not.toMatch(/data:|base64/i);
  });
});
