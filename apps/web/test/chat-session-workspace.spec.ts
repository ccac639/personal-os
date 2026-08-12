import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatSidebar from '@/features/chat/components/chat-sidebar.vue';
import { setChatReplyService } from '@/features/chat/service';
import { useChatStore } from '@/features/chat/store';

describe('chat 会话工作区：固定 / 归档 / 筛选 / 统计 / 批量删除', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
    setChatReplyService({ generateReply: (input) => Promise.resolve(`回复：${input}`) });
  });

  it('固定：置顶显示；取消固定后恢复更新时间倒序', () => {
    const store = useChatStore();
    store.deleteSession(store.activeId!); // 清默认会话
    const a = store.createSession();
    const b = store.createSession();
    const c = store.createSession();
    // 显式更新时间，避免同毫秒导致排序不稳定
    a.updatedAt = 1000;
    b.updatedAt = 2000;
    c.updatedAt = 3000;

    expect(store.visibleSessions.map((s) => s.id)).toEqual([c.id, b.id, a.id]);

    store.togglePin(b.id);
    expect(store.visibleSessions.map((s) => s.id)).toEqual([b.id, c.id, a.id]);
    expect(store.visibleSessions[0]!.pinned).toBe(true);

    store.togglePin(b.id);
    expect(store.visibleSessions.map((s) => s.id)).toEqual([c.id, b.id, a.id]);
  });

  it('归档：默认列表隐藏、归档区可见、恢复后回到列表', () => {
    const store = useChatStore();
    store.deleteSession(store.activeId!);
    const a = store.createSession();
    store.createSession();
    store.toggleArchive(a.id);

    expect(store.visibleSessions.every((s) => s.id !== a.id)).toBe(true);
    expect(store.archivedSessions.map((s) => s.id)).toContain(a.id);

    store.toggleArchive(a.id); // 恢复
    expect(store.archivedSessions).toHaveLength(0);
    expect(store.visibleSessions.map((s) => s.id)).toContain(a.id);
  });

  it('归档当前会话：选中态与消息保留，可随时恢复', () => {
    const store = useChatStore();
    store.sendMessage('归档前的消息');
    const id = store.activeId!;
    const messages = [...store.activeSession!.messages];

    store.toggleArchive(id);
    expect(store.activeId).toBe(id); // 仍可继续查看
    expect(store.activeSession!.messages).toEqual(messages);

    store.toggleArchive(id);
    expect(store.visibleSessions.map((s) => s.id)).toContain(id);
  });

  it('按模型类别筛选会话', () => {
    const store = useChatStore();
    store.deleteSession(store.activeId!);
    store.createSession('general-reasoning');
    store.createSession('code-collab');

    store.setSessionModelFilter('code');
    expect(store.visibleSessions).toHaveLength(1);
    expect(store.visibleSessions[0]!.model).toBe('code-collab');

    store.setSessionModelFilter('all');
    expect(store.visibleSessions).toHaveLength(2);
  });

  it('按时间窗口筛选会话（今天 / 近 7 天 / 近 30 天）', () => {
    const store = useChatStore();
    store.deleteSession(store.activeId!);
    const fresh = store.createSession();
    const old = store.createSession();
    old.updatedAt = Date.now() - 10 * 24 * 3600 * 1000;

    store.setSessionTimeFilter('today');
    expect(store.visibleSessions.map((s) => s.id)).toEqual([fresh.id]);

    store.setSessionTimeFilter('week');
    expect(store.visibleSessions.map((s) => s.id)).toEqual([fresh.id]);

    store.setSessionTimeFilter('month');
    expect(store.visibleSessions.map((s) => s.id)).toEqual([fresh.id, old.id]);

    store.setSessionTimeFilter('all');
    expect(store.visibleSessions).toHaveLength(2);
  });

  it('仅看含书签的会话：按消息书签筛选', () => {
    const store = useChatStore();
    store.deleteSession(store.activeId!);
    const s1 = store.createSession();
    const s2 = store.createSession();
    store.sendMessage('书签会话消息');
    const msgId = store.activeSession!.messages[0]!.id;
    store.toggleBookmark(msgId);

    // s1 无消息（无书签），s2 有书签
    store.setSessionModelFilter('all');
    store.toggleSessionBookmarkFilter();
    expect(store.visibleSessions).toHaveLength(1);
    expect(store.visibleSessions[0]!.id).toBe(s2.id);

    store.toggleSessionBookmarkFilter();
    expect(store.visibleSessions.length).toBeGreaterThanOrEqual(2);
    expect(store.visibleSessions.some((s) => s.id === s1.id)).toBe(true);
  });

  it('批量删除：一次删除多个会话', () => {
    const store = useChatStore();
    store.deleteSession(store.activeId!);
    const a = store.createSession();
    const b = store.createSession();
    const c = store.createSession();

    store.deleteSessions([a.id, c.id]);
    expect(store.sessions.map((s) => s.id)).toEqual([b.id]);
    expect(store.activeId).toBe(b.id);
  });

  it('批量删除当前会话：回退到剩余第一个', () => {
    const store = useChatStore();
    store.deleteSession(store.activeId!);
    store.createSession();
    store.createSession();
    const active = store.activeId!;

    store.deleteSessions([active]);
    expect(store.sessions).toHaveLength(1);
    expect(store.activeId).toBe(store.sessions[0]!.id);
  });

  it('会话统计：消息数 / 轮次 / 书签 / 字符 / 估算 token', () => {
    const store = useChatStore();
    store.sendMessage('你好，帮我总结一下');
    const session = store.activeSession!;
    const msgId = session.messages[0]!.id;
    store.toggleBookmark(msgId);

    const stats = store.sessionStats(session)!;
    expect(stats.total).toBe(2);
    expect(stats.userMessages).toBe(1);
    expect(stats.assistantMessages).toBe(1);
    expect(stats.bookmarks).toBe(1);
    expect(stats.chars).toBe(session.messages.reduce((n, m) => n + m.content.length, 0));
    expect(stats.estTokens).toBeGreaterThan(0);
    expect(store.sessionStats(null)).toBeNull();
  });
});

describe('ChatSidebar 工作区交互', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('固定按钮：点击后会话置顶', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.createSession();
    const wrapper = mount(ChatSidebar, {
      props: { mobileOpen: false },
      global: { plugins: [pinia] },
    });

    const pinBtn = wrapper.find('button[aria-label="固定会话"]');
    expect(pinBtn.exists()).toBe(true);
    await pinBtn.trigger('click');
    expect(store.sessions[0]!.pinned).toBe(true);
    expect(wrapper.find('button[aria-label="取消固定"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('批量选择：勾选后批量删除，Esc 退出批量模式', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.deleteSession(store.activeId!);
    const a = store.createSession();
    const b = store.createSession();
    const c = store.createSession();
    a.title = '甲会话';
    b.title = '乙会话';
    c.title = '丙会话';
    const wrapper = mount(ChatSidebar, {
      props: { mobileOpen: false },
      global: { plugins: [pinia] },
    });

    await wrapper.find('button[aria-label="批量选择会话"]').trigger('click');
    await wrapper.find('[aria-label="选择会话 乙会话"]').trigger('click');
    await wrapper.find('[aria-label="选择会话 丙会话"]').trigger('click');
    expect(wrapper.text()).toContain('已选 2 个会话');

    await wrapper.find('button[aria-label="删除所选会话"]').trigger('click');
    expect(store.sessions.map((s) => s.id)).toEqual([a.id]);
    // 批量模式已退出，无删除栏
    expect(wrapper.find('button[aria-label="删除所选会话"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('归档区：展开显示归档会话，可恢复', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    const s = store.createSession();
    store.toggleArchive(s.id);
    const wrapper = mount(ChatSidebar, {
      props: { mobileOpen: false },
      global: { plugins: [pinia] },
    });

    await wrapper.find('button[aria-label="展开归档会话"]').trigger('click');
    expect(wrapper.text()).toContain(s.title);

    await wrapper.find('button[aria-label="恢复会话"]').trigger('click');
    expect(store.sessions[0]!.archived).toBeFalsy();
    expect(wrapper.find('button[aria-label="恢复会话"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('键盘导航：Enter 打开会话', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.deleteSession(store.activeId!);
    const target = store.createSession();
    target.title = '键盘目标会话';
    const wrapper = mount(ChatSidebar, {
      props: { mobileOpen: false },
      global: { plugins: [pinia] },
    });

    await wrapper.find('[aria-label="打开会话 键盘目标会话"]').trigger('keydown', { key: 'Enter' });
    expect(store.activeId).toBe(target.id);
    wrapper.unmount();
  });
});
