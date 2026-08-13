import { describe, expect, it } from 'vitest';

import {
  parseQuickCapture,
  extractPriority,
  extractTags,
  parseDateKeyword,
} from '@/features/tasks/quick-capture';

const TODAY = '2026-08-13'; // 周四

describe('快速捕获解析（确定性，无 NLP）', () => {
  it('基础标题', () => {
    expect(parseQuickCapture('完成接口联调', TODAY)).toEqual({
      title: '完成接口联调',
      dueDate: undefined,
      priority: 'medium',
      tags: [],
    });
  });

  it('日期关键词：今天 / 明天 / 后天', () => {
    expect(parseQuickCapture('提交周报 今天', TODAY)?.dueDate).toBe('2026-08-13');
    expect(parseQuickCapture('写方案 明天', TODAY)?.dueDate).toBe('2026-08-14');
    expect(parseQuickCapture('修复bug 后天', TODAY)?.dueDate).toBe('2026-08-15');
  });

  it('日期关键词：本周五 / 本周一（本周已过则跳下周）', () => {
    // 本周五 = 2026-08-14
    expect(parseQuickCapture('发布 v1.2 本周五', TODAY)?.dueDate).toBe('2026-08-14');
    // 本周一已过（今天是周四）→ 跳到下周一 = 2026-08-17
    expect(parseQuickCapture('晨会准备 周一', TODAY)?.dueDate).toBe('2026-08-17');
  });

  it('日期关键词：下周五 / 下周', () => {
    expect(parseQuickCapture('培训 下周五', TODAY)?.dueDate).toBe('2026-08-21');
    expect(parseQuickCapture('规划 下周', TODAY)?.dueDate).toBe('2026-08-20');
  });

  it('日期关键词：下月 / 月底', () => {
    expect(parseQuickCapture('年度回顾 下月', TODAY)?.dueDate).toBe('2026-09-01');
    expect(parseQuickCapture('账单 月底', TODAY)?.dueDate).toBe('2026-08-31');
  });

  it('优先级标记：!高 / !urgent / !低 / !中', () => {
    expect(parseQuickCapture('处理线上告警 !高', TODAY)?.priority).toBe('high');
    expect(parseQuickCapture('紧急修复 !urgent', TODAY)?.priority).toBe('urgent');
    expect(parseQuickCapture('整理文档 !低', TODAY)?.priority).toBe('low');
    expect(parseQuickCapture('常规任务 !中', TODAY)?.priority).toBe('medium');
    // 无标记默认 medium
    expect(parseQuickCapture('默认任务', TODAY)?.priority).toBe('medium');
  });

  it('标签提取：中文 / 英文 #标签', () => {
    const r = parseQuickCapture('重构登录模块 #登录 #security 明天 !高', TODAY)!;
    expect(r.tags).toEqual(['登录', 'security']);
    expect(r.priority).toBe('high');
    expect(r.dueDate).toBe('2026-08-14');
    expect(r.title).toBe('重构登录模块');
  });

  it('组合：标题 + 日期 + 优先级 + 标签', () => {
    const r = parseQuickCapture('#发布 写发布说明 本周五 !urgent', TODAY)!;
    expect(r.title).toBe('写发布说明');
    expect(r.tags).toEqual(['发布']);
    expect(r.dueDate).toBe('2026-08-14');
    expect(r.priority).toBe('urgent');
  });

  it('空输入 / 非法 today → null（确定性）', () => {
    expect(parseQuickCapture('', TODAY)).toBeNull();
    expect(parseQuickCapture('   ', TODAY)).toBeNull();
    expect(parseQuickCapture('任务', 'not-a-date')).toBeNull();
    expect(parseQuickCapture('!高', TODAY)).toBeNull();
    expect(parseQuickCapture('#tag', TODAY)).toBeNull();
  });

  it('extractPriority / extractTags / parseDateKeyword 独立函数', () => {
    expect(extractPriority('任务 !高').priority).toBe('high');
    expect(extractTags('任务 #a #b').tags).toEqual(['a', 'b']);
    expect(parseDateKeyword('明天', TODAY).date).toBe('2026-08-14');
    expect(parseDateKeyword('无关键词', TODAY).date).toBeUndefined();
  });
});
