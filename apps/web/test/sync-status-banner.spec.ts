import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import SyncStatusBanner from '@/features/projects/sync-status-banner.vue';
import { createSyncState, type SyncState } from '@/features/projects/sync-core';

function state(patch: Partial<SyncState>): SyncState {
  return { ...createSyncState(), ...patch };
}

describe('SyncStatusBanner 同步状态横幅', () => {
  it('全 idle 且无 dirty：不渲染（无可提示）', () => {
    const wrapper = mount(SyncStatusBanner, { props: { states: [state({}), state({})] } });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[class*="border-red"]').exists()).toBe(false);
  });

  it('loading：显示同步中文案', () => {
    const wrapper = mount(SyncStatusBanner, { props: { states: [state({ status: 'loading' })] } });
    expect(wrapper.text()).toContain('正在从服务端同步数据');
  });

  it('offline + dirty：错误提示 + 待同步条数 + 重试按钮', () => {
    const wrapper = mount(SyncStatusBanner, {
      props: { states: [state({ status: 'offline', dirty: 2 })] },
    });
    expect(wrapper.text()).toContain('无法连接服务端');
    expect(wrapper.text()).toContain('2 条变更待同步');
    expect(wrapper.text()).toContain('重试');
  });

  it('error：同步失败文案（透出 lastError）', () => {
    const wrapper = mount(SyncStatusBanner, {
      props: { states: [state({ status: 'error', lastError: '服务端 500' })] },
    });
    expect(wrapper.text()).toContain('同步失败');
    expect(wrapper.text()).toContain('服务端 500');
  });

  it('conflict：数据冲突文案', () => {
    const wrapper = mount(SyncStatusBanner, {
      props: { states: [state({ status: 'conflict', lastError: '版本过期' })] },
    });
    expect(wrapper.text()).toContain('数据冲突');
    expect(wrapper.text()).toContain('版本过期');
  });

  it('dirty>0 但 idle：待同步提示（warn 档）', () => {
    const wrapper = mount(SyncStatusBanner, { props: { states: [state({ dirty: 3 })] } });
    expect(wrapper.text()).toContain('3 条本地变更待同步');
    expect(wrapper.text()).toContain('重试');
  });

  it('多状态合并：取最严重（error 优先于 loading），dirty 求和', () => {
    const wrapper = mount(SyncStatusBanner, {
      props: {
        states: [
          state({ status: 'loading' }),
          state({ status: 'error', lastError: 'E1', dirty: 1 }),
        ],
      },
    });
    // 合并结果 = error（rank 最高）：显示同步失败文案
    expect(wrapper.text()).toContain('同步失败');
    expect(wrapper.text()).toContain('E1');
    // dirty 求和 = 1 → 提供重试入口
    expect(wrapper.text()).toContain('重试');
  });

  it('saving：轻提示（无重试按钮）', () => {
    const wrapper = mount(SyncStatusBanner, { props: { states: [state({ status: 'saving' })] } });
    expect(wrapper.text()).toContain('正在保存到服务端');
    expect(wrapper.text()).not.toContain('重试');
  });

  it('点击重试 emit retry；关闭 emit dismiss', async () => {
    const wrapper = mount(SyncStatusBanner, {
      props: { states: [state({ status: 'offline', dirty: 1 })] },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('retry')).toBeTruthy();
  });
});
