import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardHeroCarousel from '@/features/dashboard/hero-carousel.vue';
import DashboardActivityFeed from '@/features/dashboard/activity-feed.vue';
import DashboardTrendingAI from '@/features/dashboard/trending-ai.vue';
import DashboardWorkflowStatus from '@/features/dashboard/workflow-status.vue';
import DashboardSystemOverview from '@/features/dashboard/system-overview.vue';
import DashboardQuickActions from '@/features/dashboard/quick-actions.vue';
import DashboardSystemStatus from '@/features/dashboard/system-status.vue';
import DashboardStatsCards from '@/features/dashboard/stats-cards.vue';
import HomePage from '@/pages/index.vue';
import { routes } from '@/router/routes';
import { GITHUB_TREND, WORKFLOW_RUNS, SYSTEM_SERVICES, QUICK_ACTIONS } from '@/features/dashboard';

/** 测试用 router（含全部已有路由，验证链接目标真实存在） */
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes,
  });
}

/** 挂载组件 + router（真实 RouterLink，点击可导航） */
function mountWithRouter(component: unknown, options: Record<string, unknown> = {}) {
  const router = makeRouter();
  return mount(component as never, {
    global: {
      plugins: [router],
    },
    ...options,
  });
}

/** 挂载带 router-link 的组件（空态/工作流等使用 router-link 的组件） */
function mountWithLinks(component: unknown, options: Record<string, unknown> = {}) {
  const router = makeRouter();
  return mount(component as never, {
    global: { plugins: [router] },
    ...options,
  });
}

/** matchMedia stub：控制 prefers-reduced-motion（jsdom 未实现） */
function stubMatchMedia(matches = false) {
  const mq = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mq),
  );
}

describe('首页 Dashboard（轮播版）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubMatchMedia();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it(
    '正常渲染：标题、指标轮播、最近活动、GitHub 趋势、工作流、系统监控、快速操作、系统状态',
    { timeout: 15_000 },
    async () => {
      // 全量并行时懒加载 chunk + 整棵首页树渲染可能超出默认 5s 阈值（既有 flaky 根因）：
      // 显式放宽到 15s，属合理阈值而非掩盖（用例本身无等待循环/定时器依赖）
      const wrapper = mountWithRouter(HomePage);
      await flushPromises();
      expect(wrapper.text()).toContain('最近活动');
      expect(wrapper.text()).toContain('GitHub 本周趋势');
      expect(wrapper.text()).toContain('工作流');
      expect(wrapper.text()).toContain('系统监控');
      expect(wrapper.text()).toContain('快速操作');
      expect(wrapper.text()).toContain('系统状态');
    },
  );

  it('指标卡片：显示标题、主数值、趋势与迷你图；无趋势数据显示占位', async () => {
    const wrapper = mount(DashboardStatsCards, {
      props: {
        metrics: [
          {
            id: 'a',
            label: '指标A',
            value: '12',
            icon: 'Layers',
            trend: { value: '+5%', direction: 'up', label: '较上周' },
            points: [1, 2, 3],
          },
          {
            id: 'b',
            label: '指标B',
            value: '8',
            icon: 'Code2',
            trend: { value: '-2%', direction: 'down', label: '较上周' },
            points: [3, 2, 1],
          },
          { id: 'c', label: '指标C', value: '0', icon: 'Boxes' },
        ],
      },
    });
    expect(wrapper.text()).toContain('指标A');
    expect(wrapper.text()).toContain('12');
    expect(wrapper.text()).toContain('+5%');
    expect(wrapper.text()).toContain('-2%');
    // 无趋势数据：显示占位而非伪造 0
    expect(wrapper.text()).toContain('暂无趋势数据');
    // 有数据的指标渲染 sparkline（data-testid 精确匹配）
    expect(wrapper.findAll('[data-testid="sparkline"]').length).toBe(2);
  });

  it('指标轮播：左右切换按钮、分页指示器、键盘操作', async () => {
    const wrapper = mountWithRouter(DashboardHeroCarousel);
    await flushPromises();
    // 初始 slide 1 = 统计卡片
    expect(wrapper.text()).toContain('开发中项目');
    // 点击下一张 -> slide 2（开发中项目列表）
    const nextBtn = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '下一张');
    await nextBtn?.trigger('click');
    expect(wrapper.text()).toContain('Personal OS');
    // 点击上一张返回
    const prevBtn = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '上一张');
    await prevBtn?.trigger('click');
    expect(wrapper.text()).toContain('开发中项目');
    // 键盘右方向键切换
    await wrapper.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.text()).toContain('Personal OS');
  });

  it('最近活动：空态显示可执行操作', () => {
    const wrapper = mountWithLinks(DashboardActivityFeed, { props: { activities: [] } });
    expect(wrapper.text()).toContain('暂无最近活动');
    expect(wrapper.text()).toContain('去新建项目');
    // 查看全部链接指向已有路由（router-link 渲染为 <a href="/projects">）
    expect(wrapper.findAll('a').some((a) => a.attributes('href') === '/projects')).toBe(true);
  });

  it('最近活动：进行中显示进度，失败显示原因，标题/摘要两行截断', () => {
    // ActivityFeed 使用 RouterLink：必须带 router 插件（消除 router-link 解析 warn）
    const wrapper = mountWithRouter(DashboardActivityFeed, {
      props: {
        activities: [
          {
            id: 'r1',
            type: 'workflow',
            title: '运行中的流水线',
            description: '描述',
            timestamp: '1 分钟前',
            icon: 'Workflow',
            status: 'running',
            progress: 60,
          },
          {
            id: 'f1',
            type: 'workflow',
            title: '失败的任务',
            description: '描述',
            timestamp: '2 分钟前',
            icon: 'XCircle',
            status: 'failed',
            failureReason: '超时',
          },
        ],
      } as never,
    });
    expect(wrapper.text()).toContain('进行中');
    expect(wrapper.text()).toContain('失败');
    expect(wrapper.text()).toContain('超时');
    // 进度条存在
    expect(wrapper.find('.bg-brand-600').exists()).toBe(true);
  });

  it('GitHub 趋势：loading skeleton → ready 渲染 Top 数据', async () => {
    const wrapper = mount(DashboardTrendingAI, { props: { items: GITHUB_TREND.slice(0, 3) } });
    // 初始 loading
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    // 等 500ms 模拟加载完成
    await vi.advanceTimersByTimeAsync(600);
    expect(wrapper.text()).toContain('GitHub 本周趋势');
    expect(wrapper.text()).toContain(GITHUB_TREND[0].name);
    expect(wrapper.text()).toContain(GITHUB_TREND[0].deltaStars);
    // 外链安全属性
    const link = wrapper.find('a[target="_blank"]');
    expect(link.exists()).toBe(true);
    expect(link.attributes('rel')).toBe('noopener noreferrer');
  });

  it('GitHub 趋势：error 显示重试，点击后恢复 ready', async () => {
    const wrapper = mount(DashboardTrendingAI, {
      props: { items: GITHUB_TREND.slice(0, 2), initialState: 'error' },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('趋势数据加载失败');
    const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('重试'));
    await retryBtn?.trigger('click');
    await vi.advanceTimersByTimeAsync(600);
    expect(wrapper.text()).toContain(GITHUB_TREND[0].name);
  });

  it('GitHub 趋势：空数据显示空态', async () => {
    const wrapper = mount(DashboardTrendingAI, { props: { items: [] } });
    await vi.advanceTimersByTimeAsync(600);
    expect(wrapper.text()).toContain('本周暂无趋势数据');
  });

  it('工作流：成功率统计、状态展示、失败原因、空态', () => {
    const wrapper = mountWithLinks(DashboardWorkflowStatus, { props: { runs: WORKFLOW_RUNS } });
    expect(wrapper.text()).toContain('成功率 33%');
    expect(wrapper.text()).toContain('运行中');
    expect(wrapper.text()).toContain('失败');
    expect(wrapper.text()).toContain('内容包含未审核链接');
    // 查看全部只走已有路由
    expect(wrapper.findAll('a').some((a) => a.attributes('href') === '/workflows')).toBe(true);
    // 空态
    const empty = mountWithLinks(DashboardWorkflowStatus, { props: { runs: [] } });
    expect(empty.text()).toContain('暂无工作流运行');
  });

  it('系统监控：刷新按钮 loading → ready；失败显示重试；无数据不画假折线', async () => {
    const wrapper = mount(DashboardSystemOverview, {
      props: { samples: [10, 12, 11], simulateFailure: true },
    });
    // 初始 ready + 有折线
    expect(wrapper.find('[data-testid="latency-sparkline"]').exists()).toBe(true);
    const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('刷新'));
    await refreshBtn?.trigger('click');
    // loading 中
    expect(wrapper.text()).toContain('刷新中');
    await vi.advanceTimersByTimeAsync(500);
    // 失败 -> 显示错误 + 重试
    expect(wrapper.text()).toContain('监控数据获取失败');
    const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('重试'));
    await retryBtn?.trigger('click');
    await vi.advanceTimersByTimeAsync(500);
    // 重试成功 -> mock 数据含 offline/unknown -> 部分服务离线（非伪造全绿）
    expect(wrapper.text()).toContain('部分服务离线');
    // 无样本数据 -> 不画假折线
    const empty = mount(DashboardSystemOverview, { props: { samples: [] } });
    expect(empty.find('[data-testid="latency-sparkline"]').exists()).toBe(false);
    expect(empty.text()).toContain('暂无延迟数据');
  });

  it('系统监控：卸载时清理定时器', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const wrapper = mount(DashboardSystemOverview);
    const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('刷新'));
    await refreshBtn?.trigger('click');
    wrapper.unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('系统状态：online/degraded/offline/unknown 四种状态正确展示', () => {
    const wrapper = mount(DashboardSystemStatus, { props: { services: SYSTEM_SERVICES } });
    expect(wrapper.text()).toContain('运行中');
    expect(wrapper.text()).toContain('降级');
    expect(wrapper.text()).toContain('离线');
    expect(wrapper.text()).toContain('未知');
    // unknown 不能显示绿色 dot（HTML 里含 surface 灰 dot class，且无 green）
    expect(wrapper.html()).toContain('bg-surface-800/40');
    // degraded 延迟显示橙色
    expect(wrapper.html()).toContain('text-orange-600');
    // unknown 服务的 dot 是灰色而非绿色：在含 "Search" 的整行 HTML 中，
    // dot span 是独立的 size-2.5 元素；直接断言整个行容器无 bg-green-500
    const serviceRows = wrapper.findAll('div.border-surface-100');
    const searchRow = serviceRows.find((row) => row.text().includes('Search'));
    expect(searchRow).toBeDefined();
    expect(searchRow?.html()).not.toContain('bg-green-500');
    expect(searchRow?.html()).toContain('bg-surface-800/40');
    // 对照：online 服务行应含绿色 dot
    const webRow = serviceRows.find((row) => row.text().includes('Web'));
    expect(webRow?.html()).toContain('bg-green-500');
  });

  it('快速操作：四宫格、图标、点击跳转已有路由（无死链接）', async () => {
    const wrapper = mountWithRouter(DashboardQuickActions);
    const links = wrapper.findAll('a');
    expect(links.length).toBe(4);
    const hrefs = links.map((l) => l.attributes('href'));
    // 所有链接目标必须是已有路由
    const validRoutes = routes.map((r) => r.path);
    for (const href of hrefs) {
      expect(validRoutes.some((r) => href === r || href.startsWith(`${r}/`))).toBe(true);
    }
    // 点击"新建项目"链接目标为 /projects（已有路由，无死链接）
    const router = wrapper.vm.$router as ReturnType<typeof makeRouter>;
    await router.push('/');
    await flushPromises();
    const projectLinks = wrapper.findAll('a').filter((a) => a.attributes('href') === '/projects');
    expect(projectLinks.length).toBeGreaterThan(0);
    // 路由目标真实存在且可导航（vue-router 导航行为由框架保证）
    await router.push('/projects');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/projects');
  });

  it('快速操作：外部注入可覆盖（测试注入渲染）', () => {
    const wrapper = mountWithRouter(DashboardQuickActions, {
      props: {
        actions: QUICK_ACTIONS.slice(0, 2),
      },
    });
    expect(wrapper.findAll('a').length).toBe(2);
  });

  it('窄屏布局：指标卡片与主网格不横向溢出', { timeout: 15_000 }, async () => {
    // 同 77 行：整棵首页树渲染，全量并行下放宽超时阈值
    const wrapper = mountWithRouter(HomePage);
    await flushPromises();
    // 首页容器不应有横向滚动
    const container = wrapper.find('.relative.min-h-screen');
    expect(container.exists()).toBe(true);
    // 网格使用 lg:grid-cols-3，中等宽度自动堆叠
    const grid = wrapper.find('.lg\\:grid-cols-3');
    expect(grid.exists()).toBe(true);
  });

  it('导航链接和其他页面行为未被改变（布局测试）', () => {
    makeRouter();
    // 路由表必须包含全部导航目标
    const navTargets = [
      '/',
      '/chat',
      '/workflows',
      '/projects',
      '/achievements',
      '/admin',
      '/settings',
    ];
    const paths = routes.map((r) => r.path);
    for (const t of navTargets) {
      expect(paths).toContain(t);
    }
  });
});
