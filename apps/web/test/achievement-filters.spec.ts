import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  allTags,
  filterAchievements,
  filterSummary,
  matchKeyword,
  monthOptions,
  sortAchievements,
  yearOptions,
} from '@/features/achievements/filters';
import { emptyFilters } from '@/features/achievements/types';
import type { Achievement } from '@/features/achievements/types';

/** 最小 fixture 工厂 */
function make(partial: Partial<Achievement> & { id: string }): Achievement {
  return {
    type: 'project',
    title: '未命名',
    summary: '',
    description: '',
    tags: [],
    completedAt: '2026-07-18',
    metrics: [],
    relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] },
    reuse: { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' },
    pinned: false,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

const ITEMS: Achievement[] = [
  make({
    id: 'a1',
    type: 'project',
    title: 'Personal OS v0.1 发布',
    summary: '平台首个可用版本',
    description: '完成整体架构搭建',
    tags: ['vue', 'personal-os'],
    completedAt: '2026-07-18',
    pinned: true,
  }),
  make({
    id: 'a2',
    type: 'article',
    title: '《pnpm workspace 实践》',
    tags: ['pnpm', '写作'],
    completedAt: '2026-06-12',
  }),
  make({
    id: 'a3',
    type: 'workflow',
    title: '博客自动发布流水线',
    tags: ['workflow', '博客'],
    completedAt: '2025-11-02',
  }),
  make({
    id: 'a4',
    type: 'milestone',
    title: '达成 100 次提交',
    tags: ['git', '习惯'],
    completedAt: '2026-08-01',
    archived: true,
  }),
  make({
    id: 'a5',
    type: 'code',
    title: 'useDraggable 指令',
    summary: '零依赖拖拽',
    tags: ['vue', 'typescript'],
    completedAt: '2026-04-08',
    relatedProject: 'Personal OS',
  }),
];

describe('achievement filters（筛选纯函数）', () => {
  it('关键词：匹配标题 / 摘要 / 标签 / 关联项目，忽略大小写与首尾空格', () => {
    expect(matchKeyword(ITEMS[0]!, 'personal os')).toBe(true);
    expect(matchKeyword(ITEMS[1]!, '写作')).toBe(true); // 标签命中
    expect(matchKeyword(ITEMS[4]!, '零依赖')).toBe(true); // 摘要命中
    expect(matchKeyword(ITEMS[4]!, 'PERSONAL OS')).toBe(true); // 关联项目 + 忽略大小写
    expect(matchKeyword(ITEMS[2]!, '不存在的内容')).toBe(false);
    expect(matchKeyword(ITEMS[0]!, '  ')).toBe(true); // 空关键词不过滤
  });

  it('类型筛选：空数组表示全部；选中类型取交集', () => {
    const f = emptyFilters();
    f.archived = 'all'; // 类型语义测试放开归档过滤
    expect(filterAchievements(ITEMS, f)).toHaveLength(ITEMS.length);

    f.types = ['article', 'code'];
    const hit = filterAchievements(ITEMS, f);
    expect(hit.map((a) => a.id)).toEqual(['a2', 'a5']);

    f.types = ['milestone'];
    expect(filterAchievements(ITEMS, f).map((a) => a.id)).toEqual(['a4']);
  });

  it('时间筛选：按完成年份过滤；月份仅在年份选定后生效', () => {
    const f = emptyFilters();
    f.year = 2026;
    // 默认隐藏归档（a4 已归档）
    expect(filterAchievements(ITEMS, f).map((a) => a.id)).toEqual(['a1', 'a2', 'a5']);

    f.month = 7;
    expect(filterAchievements(ITEMS, f).map((a) => a.id)).toEqual(['a1']);

    // year 为空时 month 不生效（UI 保证，逻辑上兜底）
    f.year = null;
    f.month = 6;
    expect(filterAchievements(ITEMS, f)).toHaveLength(4); // 5 条中 a4 归档被隐藏
  });

  it('标签筛选：任一标签命中即可', () => {
    const f = emptyFilters();
    f.tags = ['vue'];
    expect(filterAchievements(ITEMS, f).map((a) => a.id)).toEqual(['a1', 'a5']);

    f.tags = ['vue', '博客'];
    expect(filterAchievements(ITEMS, f).map((a) => a.id)).toEqual(['a1', 'a3', 'a5']);
  });

  it('归档筛选：all / active / archived 三种模式', () => {
    const f = emptyFilters();
    expect(f.archived).toBe('active'); // 默认隐藏归档
    expect(filterAchievements(ITEMS, f).map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a5']);

    f.archived = 'all';
    expect(filterAchievements(ITEMS, f)).toHaveLength(5);

    f.archived = 'archived';
    expect(filterAchievements(ITEMS, f).map((a) => a.id)).toEqual(['a4']);
  });

  it('组合筛选：类型 + 年份 + 标签同时生效，且不修改入参', () => {
    const f = emptyFilters();
    f.types = ['project', 'code'];
    f.year = 2026;
    f.tags = ['vue'];
    const result = filterAchievements(ITEMS, f);
    expect(result.map((a) => a.id)).toEqual(['a1', 'a5']);
    expect(ITEMS).toHaveLength(5); // 入参未被修改
  });
});

describe('achievement sort（排序）', () => {
  it('置顶优先：pinned 恒在最前，其余按完成日期降序', () => {
    const sorted = sortAchievements(ITEMS, 'date-desc');
    expect(sorted[0]!.id).toBe('a1'); // 唯一置顶
    const rest = sorted.slice(1).map((a) => a.id);
    expect(rest).toEqual(['a4', 'a2', 'a5', 'a3']); // 2026-08 > 2026-06 > 2026-04 > 2025-11
  });

  it('date-asc：升序（置顶仍优先）', () => {
    const sorted = sortAchievements(ITEMS, 'date-asc');
    expect(sorted[0]!.id).toBe('a1');
    expect(sorted.slice(1).map((a) => a.id)).toEqual(['a3', 'a5', 'a2', 'a4']);
  });

  it('updated：按最近更新时间降序', () => {
    const updated = [
      make({ id: 'u1', title: '旧', updatedAt: '2026-01-01T00:00:00.000Z' }),
      make({ id: 'u2', title: '新', updatedAt: '2026-06-01T00:00:00.000Z' }),
    ];
    const sorted = sortAchievements(updated, 'updated');
    expect(sorted.map((a) => a.id)).toEqual(['u2', 'u1']);
  });

  it('title：按标题排序（置顶仍优先）', () => {
    const list = [
      make({ id: 't1', title: 'Beta 成果' }),
      make({ id: 't2', title: 'Alpha 成果' }),
      make({ id: 't3', title: 'Charlie 成果' }),
    ];
    const sorted = sortAchievements(list, 'title');
    expect(sorted.map((a) => a.id)).toEqual(['t2', 't1', 't3']);
  });

  it('manual：按 order 升序（置顶仍优先）', () => {
    const list = [
      make({ id: 'm1', order: 3 }),
      make({ id: 'm2', order: 1 }),
      make({ id: 'm3', order: 2 }),
      make({ id: 'm4', order: 0, pinned: true }),
    ];
    const sorted = sortAchievements(list, 'manual');
    expect(sorted.map((a) => a.id)).toEqual(['m4', 'm2', 'm3', 'm1']);
  });
});

describe('achievement filter 状态（计数 / 摘要 / 清空）', () => {
  it('activeFilterCount：按生效条件组计数，空筛选为 0', () => {
    const f = emptyFilters();
    expect(activeFilterCount(f)).toBe(0);

    f.keyword = ' vue ';
    f.types = ['project', 'code'];
    f.year = 2026;
    f.month = 7;
    f.tags = ['vue', '写作'];
    f.archived = 'all';
    expect(activeFilterCount(f)).toBe(6);

    f.month = null;
    f.tags = [];
    f.archived = 'active';
    expect(activeFilterCount(f)).toBe(3);
  });

  it('filterSummary：生成可读条件摘要，按顺序稳定', () => {
    const f = emptyFilters();
    f.keyword = 'vue';
    f.types = ['project'];
    f.year = 2026;
    f.month = 7;
    f.tags = ['vue'];
    f.archived = 'archived';
    expect(filterSummary(f)).toEqual([
      '关键词「vue」',
      '类型：项目发布',
      '2026 年 7 月',
      '标签：vue',
      '仅看已归档',
    ]);

    expect(filterSummary(emptyFilters())).toEqual([]);
  });

  it('清空：emptyFilters 每次返回全新对象，互不影响', () => {
    const a = emptyFilters();
    const b = emptyFilters();
    a.keyword = 'x';
    expect(b.keyword).toBe('');
    expect(a).not.toBe(b);
  });
});

describe('achievement options（年份 / 月份 / 标签派生）', () => {
  it('yearOptions：去重并按年份降序', () => {
    expect(yearOptions(ITEMS)).toEqual([2026, 2025]);
    expect(yearOptions([])).toEqual([]);
  });

  it('monthOptions：指定年份内月份升序，跨年份隔离', () => {
    expect(monthOptions(ITEMS, 2026)).toEqual([4, 6, 7, 8]);
    expect(monthOptions(ITEMS, 2025)).toEqual([11]);
    expect(monthOptions(ITEMS, 2020)).toEqual([]);
  });

  it('allTags：按使用频次降序，同频按名称排序', () => {
    const tags = allTags(ITEMS);
    // vue 出现 2 次排最前；其余出现 1 次（排序顺序依赖 locale，只断言集合与数量）
    expect(tags[0]).toBe('vue');
    expect(tags).toHaveLength(9);
    expect(new Set(tags).size).toBe(9);
    expect(tags).toEqual(
      expect.arrayContaining([
        'git',
        'personal-os',
        'pnpm',
        'typescript',
        'workflow',
        '博客',
        '写作',
        '习惯',
      ]),
    );
  });
});

describe('achievement filters（结构化搜索：标题 / 描述 / 关联项目名称）', () => {
  const SEARCH_ITEMS: Achievement[] = [
    make({
      id: 's1',
      title: 'Personal OS v0.2 发布',
      description: '整体架构重构，引入路由与状态分层',
      relations: {
        projectIds: ['p-personal-os'],
        workflowIds: [],
        predecessorIds: [],
        derivedIds: [],
      },
      tags: ['vue'],
    }),
    make({
      id: 's2',
      title: '博客系统迁移',
      description: '内容与主题迁移完成',
      relations: { projectIds: ['p-blog'], workflowIds: [], predecessorIds: [], derivedIds: [] },
      tags: ['blog'],
    }),
    make({
      id: 's3',
      title: 'CLI 工具集',
      description: '无项目关系字段的旧条目',
      relatedProject: 'CLI 脚手架工具集',
    }),
  ];
  /** 只读引用解析：项目 id → 名称 */
  const resolveProjectName = (id: string): string | undefined =>
    ({ 'p-personal-os': 'Personal OS 一体化系统', 'p-blog': '个人博客与知识库' })[id];

  it('titleQuery：仅匹配标题，与其他条件无关', () => {
    const f = emptyFilters();
    f.archived = 'all';
    f.titleQuery = '发布';
    expect(filterAchievements(SEARCH_ITEMS, f).map((a) => a.id)).toEqual(['s1']);

    f.titleQuery = ' 博客 ';
    expect(filterAchievements(SEARCH_ITEMS, f).map((a) => a.id)).toEqual(['s2']);
  });

  it('descQuery：仅匹配描述', () => {
    const f = emptyFilters();
    f.archived = 'all';
    f.descQuery = '迁移';
    expect(filterAchievements(SEARCH_ITEMS, f).map((a) => a.id)).toEqual(['s2']);

    f.descQuery = '架构';
    expect(filterAchievements(SEARCH_ITEMS, f).map((a) => a.id)).toEqual(['s1']);
  });

  it('projectQuery：按关联项目名称匹配（relations 解析 + 自由文本兜底）', () => {
    const f = emptyFilters();
    f.archived = 'all';
    f.projectQuery = 'personal os';
    expect(filterAchievements(SEARCH_ITEMS, f, resolveProjectName).map((a) => a.id)).toEqual([
      's1',
    ]);

    // 旧版自由文本 relatedProject 仍可命中
    f.projectQuery = 'CLI 脚手架';
    expect(filterAchievements(SEARCH_ITEMS, f, resolveProjectName).map((a) => a.id)).toEqual([
      's3',
    ]);

    // 未提供名称解析器时，仅自由文本可命中
    f.projectQuery = '个人博客';
    expect(filterAchievements(SEARCH_ITEMS, f).map((a) => a.id)).toEqual([]);
  });

  it('结构化搜索与类型/归档组合生效，且不修改入参', () => {
    const f = emptyFilters();
    f.titleQuery = '博客';
    f.types = ['project'];
    const result = filterAchievements(SEARCH_ITEMS, f, resolveProjectName);
    expect(result.map((a) => a.id)).toEqual(['s2']);
    expect(SEARCH_ITEMS).toHaveLength(3);
  });

  it('activeFilterCount / filterSummary 计入结构化条件', () => {
    const f = emptyFilters();
    f.titleQuery = 'x';
    f.projectQuery = 'y';
    expect(activeFilterCount(f)).toBe(2);
    expect(filterSummary(f)).toEqual(['标题包含「x」', '关联项目「y」']);

    const full = emptyFilters();
    full.descQuery = '迁移';
    expect(filterSummary(full)).toEqual(['描述包含「迁移」']);
  });
});
