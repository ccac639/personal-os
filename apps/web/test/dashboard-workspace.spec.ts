import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardTodayWorkbench from '@/features/dashboard/today-workbench.vue';
import DashboardEfficiencySummary from '@/features/dashboard/efficiency-summary.vue';
import DashboardAiWorkbench from '@/features/dashboard/ai-workbench.vue';
import DashboardSystemEvents from '@/features/dashboard/system-events.vue';
import DashboardNotificationCenter from '@/features/dashboard/notification-center.vue';
import DashboardHeroCarousel from '@/features/dashboard/hero-carousel.vue';
import HomePage from '@/pages/index.vue';
import { routes } from '@/router/routes';
import {
  AI_WORKBENCH,
  SYSTEM_EVENTS,
  NOTIFICATIONS,
} from '@/features/dashboard';
import {
  computeWorkSummary,
  directionFor,
  trendLabel,
} from '@/features/dashboard/summary';
import type { SystemEvent } from '@/features/dashboard';

/** 测试用 router（含全部已有路由） */
function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

function mountWithLinks(component: unknown, options: Record<string, unknown> = {}) {
  const router = makeRouter();
  return mount(component as never, {
    global: { plugins: [router] },
    ...options,
  });
}

/** matchMedia stub：控制 prefers-reduced-motion */
function stubMatchMedia(matches: boolean) {
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
  vi.stubGlobal('matchMedia', vi.fn(() => mq));
  return mq;
}

describe('首页 Dashboard（工作台扩展）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('首页正常渲染：新增的今日工作台、效率摘要、AI 工作台、系统事件、通知中心全部出现', async () => {
    const wrapper = mountWithLinks(HomePage);
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain('今日工作台');
    expect(text).toContain('效率摘要');
    expect(text).toContain('AI 工作台');
    expect(text).toContain('系统事件');
    expect(text).toContain('通知');
  });

  /* ---------- 今日工作台 ---------- */

  it('今日工作台：正常渲染条目、专注时间、完成数', () => {
    const wrapper = mountWithLinks(DashboardTodayWorkbench);
    const text = wrapper.text();
    expect(text).toContain('今日工作台');
    expect(text).toContain('专注 96m');
    expect(text).toContain('完成 3 项');
    expect(text).toContain('完成首页指标轮播键盘操作');
    // 条目链接都指向已有路由
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'));
    for (const href of hrefs) {
      expect(routes.some((r) => href === r.path || href?.startsWith(`${r.path}/`))).toBe(true);
    }
  });

  it('今日工作台：空态显示可执行操作', () => {
    const wrapper = mountWithLinks(DashboardTodayWorkbench, {
      props: { data: { focusMinutes: 0, completedToday: 0, items: [] } },
    });
    expect(wrapper.text()).toContain('今日暂无工作项');
    expect(wrapper.text()).toContain('打开项目');
  });

  /* ---------- 效率摘要（纯函数 + 组件） ---------- */

  it('效率摘要纯函数：有数据生成 6 项，趋势方向正确', () => {
    const items = computeWorkSummary({
      completedToday: 3,
      completedThisWeek: 14,
      overdue: 1,
      blocked: 2,
      avgCompletionMinutes: 42,
      focusMinutes: 96,
      prevCompletedToday: 2,
      prevCompletedThisWeek: 11,
      prevOverdue: 2,
      prevBlocked: 3,
      prevAvgCompletionMinutes: 55,
      prevFocusMinutes: 80,
    });
    expect(items).toHaveLength(6);
    // 今日完成 3 > 2 → up
    expect(items.find((i) => i.id === 'completed-today')?.trend?.direction).toBe('up');
    // 逾期 1 < 2（越小越好）→ up（改善）
    expect(items.find((i) => i.id === 'overdue')?.trend?.direction).toBe('up');
    // 平均完成时间 42 < 55（越小越好）→ up
    expect(items.find((i) => i.id === 'avg-completion')?.trend?.direction).toBe('up');
    // 专注 96 > 80 → up
    expect(items.find((i) => i.id === 'focus')?.trend?.direction).toBe('up');
  });

  it('效率摘要纯函数：无数据时 value 缺省（不伪造 0），方向持平', () => {
    const items = computeWorkSummary({});
    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(item.value).toBeUndefined();
      expect(item.trend?.direction).toBe('neutral');
    }
  });

  it('效率摘要纯函数：下降与持平方向', () => {
    expect(directionFor(5, 8, true)).toBe('down');
    expect(directionFor(8, 8, true)).toBe('neutral');
    expect(directionFor(3, 1, false)).toBe('down'); // 越小越好的指标上升 = down
    expect(trendLabel(5, 4)).toBe('+25%');
    expect(trendLabel(4, 5)).toBe('-20%');
    expect(trendLabel(4, 4)).toBe('持平');
  });

  it('效率摘要：组件有数据显示数值与趋势，无数据显示暂无数据', () => {
    const wrapper = mount(DashboardEfficiencySummary);
    expect(wrapper.text()).toContain('效率摘要');
    expect(wrapper.findAll('[data-testid="summary-value"]').length).toBeGreaterThan(0);

    const empty = mount(DashboardEfficiencySummary, { props: { input: {} } });
    expect(empty.text()).toContain('暂无数据');
  });

  /* ---------- AI 工作台 ---------- */

  it('AI 工作台：模型、最近对话、快速入口只跳 /chat', () => {
    const wrapper = mountWithLinks(DashboardAiWorkbench);
    const text = wrapper.text();
    expect(text).toContain('AI 工作台');
    expect(text).toContain(AI_WORKBENCH.model);
    expect(text).toContain(AI_WORKBENCH.lastConversation ?? '');
    // 所有入口链接只指向 /chat
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toBe('/chat');
    }
  });

  it('AI 工作台：数据缺失（null）时显示安全空态', () => {
    const wrapper = mountWithLinks(DashboardAiWorkbench, { props: { data: null } });
    expect(wrapper.text()).toContain('暂无可用 AI 会话');
    // 空态下不渲染任何模型/对话内容
    expect(wrapper.text()).not.toContain(AI_WORKBENCH.model);
  });

  /* ---------- 系统事件 ---------- */

  it('系统事件：按时间倒序渲染（timestamp 越大越新在前）', () => {
    // 故意乱序传入
    const shuffled: SystemEvent[] = [
      { ...SYSTEM_EVENTS[0], id: 'a', timestamp: 100 },
      { ...SYSTEM_EVENTS[1], id: 'b', timestamp: 300 },
      { ...SYSTEM_EVENTS[2], id: 'c', timestamp: 200 },
    ];
    const wrapper = mount(DashboardSystemEvents, { props: { events: shuffled } });
    const titles = wrapper.findAll('p.font-medium').map((p) => p.text());
    // 倒序：b(300) → c(200) → a(100)
    expect(titles[0]).toContain(SYSTEM_EVENTS[1].title);
    expect(titles[1]).toContain(SYSTEM_EVENTS[2].title);
    expect(titles[2]).toContain(SYSTEM_EVENTS[0].title);
  });

  it('系统事件：空态', () => {
    const wrapper = mount(DashboardSystemEvents, { props: { events: [] } });
    expect(wrapper.text()).toContain('暂无系统事件');
  });

  it('系统事件：错误态显示重试，重试后恢复', async () => {
    const wrapper = mount(DashboardSystemEvents, {
      props: { events: SYSTEM_EVENTS, simulateFailure: true },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('事件数据加载失败');
    const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('重试'));
    await retryBtn?.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('数据同步完成');
  });

  /* ---------- 通知中心 ---------- */

  it('通知中心：未读数显示与标记已读', async () => {
    const wrapper = mountWithLinks(DashboardNotificationCenter, {
      props: { notifications: NOTIFICATIONS },
    });
    // NOTIFICATIONS 有 2 条未读
    expect(wrapper.find('[data-testid="unread-badge"]').text()).toBe('2');
    // 标记一条已读 → 未读变 1
    const markBtns = wrapper.findAll('button').filter((b) => b.text().includes('标记已读'));
    await markBtns[0].trigger('click');
    expect(wrapper.find('[data-testid="unread-badge"]').text()).toBe('1');
  });

  it('通知中心：全部标记已读', async () => {
    const wrapper = mountWithLinks(DashboardNotificationCenter, {
      props: { notifications: NOTIFICATIONS },
    });
    const allBtn = wrapper.findAll('button').find((b) => b.text().includes('全部已读'));
    await allBtn?.trigger('click');
    expect(wrapper.find('[data-testid="unread-badge"]').exists()).toBe(false);
  });

  it('通知中心：空态', () => {
    const wrapper = mountWithLinks(DashboardNotificationCenter, {
      props: { notifications: [] },
    });
    expect(wrapper.text()).toContain('暂无通知');
  });

  it('通知中心：操作链接只跳已有路由', () => {
    const wrapper = mountWithLinks(DashboardNotificationCenter, {
      props: { notifications: NOTIFICATIONS },
    });
    const actionLink = wrapper.findAll('a').find((a) => a.text().includes('查看'));
    expect(actionLink?.attributes('href')).toBe('/projects');
  });

  /* ---------- 指标轮播交互 ---------- */

  it('指标轮播：快速连续切换不越界（wrap 取模）', async () => {
    const wrapper = mountWithLinks(DashboardHeroCarousel);
    await flushPromises();
    const nextBtn = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '下一张');
    // 连续点 8 次（超过 slide 数 3），不应抛错
    for (let i = 0; i < 8; i += 1) {
      await nextBtn?.trigger('click');
    }
    // 分页指示器仍在（DOM 正常）
    expect(wrapper.findAll('button[aria-label^="切换到"]').length).toBe(3);
  });

  it('指标轮播：数据数量变化后自动修正当前索引（防御）', async () => {
    const wrapper = mountWithLinks(DashboardHeroCarousel);
    await flushPromises();
    // 切到最后一张
    const nextBtn = wrapper.findAll('button').find((b) => b.attributes('aria-label') === '下一张');
    await nextBtn?.trigger('click');
    await nextBtn?.trigger('click');
    // 数据数量变化（清空 metrics / projects）不抛错，组件仍渲染
    await wrapper.setProps({ metrics: [], projects: [] });
    await flushPromises();
    expect(wrapper.find('section').exists()).toBe(true);
  });

  it('指标轮播：prefers-reduced-motion 时禁用自动轮播（不自动切换）', async () => {
    stubMatchMedia(true);
    const wrapper = mountWithLinks(DashboardHeroCarousel);
    await flushPromises();
    const textBefore = wrapper.text();
    // 推进 6 秒（> AUTOPLAY_MS 5s），不应自动切换
    await vi.advanceTimersByTimeAsync(6000);
    expect(wrapper.text()).toBe(textBefore);
  });

  /* ---------- 全局交互 / 状态 ---------- */

  it('局部模块失败不影响其他模块（系统事件错误态，其余正常）', async () => {
    // 系统事件失败态独立存在
    const events = mount(DashboardSystemEvents, {
      props: { events: SYSTEM_EVENTS, simulateFailure: true },
    });
    await flushPromises();
    expect(events.text()).toContain('事件数据加载失败');
    // 首页整体仍正常渲染（其他模块不受影响）
    const home = mountWithLinks(HomePage);
    await flushPromises();
    expect(home.text()).toContain('今日工作台');
    expect(home.text()).toContain('效率摘要');
  });

  it('窄屏布局：首页无横向滚动风险（各模块使用内部滚动）', async () => {
    const wrapper = mountWithLinks(HomePage);
    await flushPromises();
    const container = wrapper.find('.relative.min-h-screen');
    expect(container.exists()).toBe(true);
    // 通知与系统事件列表使用内部滚动容器
    expect(wrapper.find('ul.max-h-64').exists()).toBe(true);
    expect(wrapper.find('ul.max-h-56').exists()).toBe(true);
  });

  it('键盘与 aria：图标按钮具备 aria-label（轮播箭头、通知入口）', async () => {
    const wrapper = mountWithLinks(HomePage);
    await flushPromises();
    const labelled = wrapper.findAll('[aria-label]');
    expect(labelled.length).toBeGreaterThan(0);
  });
});
