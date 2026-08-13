import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDiagnosticsReport,
  diagnosticsToText,
  diagnosticsToJson,
  estimateStorage,
  copyDiagnosticsText,
  probeCapabilities,
} from '@/features/admin/diagnostics';
import { CHAT_KEYS, WORKFLOW_KEYS } from '@/features/admin/registry';
import { useAdminStore } from '@/features/admin/store';
import { createPinia, setActivePinia } from 'pinia';

describe('admin 诊断报告', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('报告包含应用、路由、主题、密度、语言与时区', () => {
    const report = buildDiagnosticsReport({
      route: '/admin',
      theme: '深色',
      density: '紧凑',
      reduceMotion: true,
      providers: [],
    });
    expect(report.app.name).toBe('Personal OS');
    expect(report.app.version).toBe('0.1.0');
    expect(report.app.route).toBe('/admin');
    expect(report.app.theme).toBe('深色');
    expect(report.app.density).toBe('紧凑');
    expect(report.app.reduceMotion).toBe(true);
    expect(report.app.language.length).toBeGreaterThan(0);
    expect(report.app.timezone.length).toBeGreaterThan(0);
  });

  it('模块状态：存在 / 缺失 / 损坏可识别', () => {
    localStorage.setItem(CHAT_KEYS.data, JSON.stringify([{ id: 's1', schemaVersion: 1 }]));
    localStorage.setItem(WORKFLOW_KEYS.data, '{bad');
    const report = buildDiagnosticsReport({
      route: '/',
      theme: '浅色',
      density: '舒适',
      reduceMotion: false,
      providers: [],
    });
    const chat = report.modules.find((m) => m.moduleId === 'chat')!;
    const wf = report.modules.find((m) => m.moduleId === 'workflows')!;
    expect(chat.status).toBe('ok');
    expect(chat.summary?.count).toBe(1);
    expect(wf.status).toBe('corrupt');
  });

  it('存储估算：只读遍历并计算字节数', () => {
    localStorage.setItem('personal-os.test-key-a', 'hello');
    const est = estimateStorage();
    expect(est.totalBytes).toBeGreaterThan(0);
    expect(est.quotaBytes).toBe(5 * 1024 * 1024);
    expect(est.ratio).toBeGreaterThan(0);
    expect(est.nearQuota).toBe(false);
  });

  it('Provider 诊断只报告「已配置/未配置」，绝不暴露 Key 内容或长度', () => {
    const report = buildDiagnosticsReport({
      route: '/',
      theme: '浅色',
      density: '舒适',
      reduceMotion: false,
      providers: [
        { id: 'a', name: '通用兼容接口', enabled: true, hasKey: true },
        { id: 'b', name: '文本模型', enabled: false, hasKey: false },
      ],
    });
    expect(report.providers).toHaveLength(2);
    expect(report.providers[0]!.configured).toBe(true);
    expect(report.providers[1]!.configured).toBe(false);
    const text = diagnosticsToText(report);
    expect(text).toContain('已配置');
    expect(text).toContain('未配置');
    expect(text).not.toMatch(/sk-|Bearer|key[:=]\s*\S{3,}/i);
  });

  it('能力探测：jsdom 下 Blob 下载可用、剪贴板不可用', () => {
    const caps = probeCapabilities();
    expect(caps.blobDownload).toBe(true);
    expect(caps.fileImport).toBe(true);
    expect(caps.webStorage).toBe(true);
    expect(caps.clipboard).toBe(false);
  });

  it('纯文本报告可复制且包含关键段落', () => {
    const report = buildDiagnosticsReport({
      route: '/',
      theme: '浅色',
      density: '舒适',
      reduceMotion: false,
      providers: [],
    });
    const text = diagnosticsToText(report);
    expect(text).toContain('Personal OS 本地诊断报告');
    expect(text).toContain('本地存储用量');
    expect(text).toContain('模块状态');
    expect(text).toContain('AI Provider');
    expect(text).toContain('未连接真实模型');
  });

  it('JSON 报告可序列化且不含敏感字段', () => {
    const report = buildDiagnosticsReport({
      route: '/',
      theme: '浅色',
      density: '舒适',
      reduceMotion: false,
      providers: [{ id: 'a', name: 'x', enabled: true, hasKey: true }],
    });
    const json = diagnosticsToJson(report);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json).not.toContain('apiKey');
  });

  it('复制文本：clipboard 可用时成功', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const ok = await copyDiagnosticsText('hello report');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello report');
  });

  it('复制文本：clipboard 不可用时返回 false', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const ok = await copyDiagnosticsText('hello report');
    expect(ok).toBe(false);
  });

  it('诊断不修改任何用户数据', () => {
    localStorage.setItem(CHAT_KEYS.data, JSON.stringify([{ id: 's1', schemaVersion: 1 }]));
    const before = localStorage.getItem(CHAT_KEYS.data);
    buildDiagnosticsReport({
      route: '/',
      theme: '浅色',
      density: '舒适',
      reduceMotion: false,
      providers: [],
    });
    expect(localStorage.getItem(CHAT_KEYS.data)).toBe(before);
    expect(localStorage.length).toBe(1);
  });

  it('与 Admin store 联动：真实 Provider 状态进入报告（仅 configured）', () => {
    const admin = useAdminStore();
    admin.setApiKey('generic-compat', 'sk-memory-only');
    const report = buildDiagnosticsReport({
      route: '/admin',
      theme: '浅色',
      density: '舒适',
      reduceMotion: false,
      providers: admin.providers.map((p) => ({
        id: p.id,
        name: p.name,
        enabled: p.enabled,
        hasKey: Boolean(p.apiKey?.trim()),
      })),
    });
    const text = diagnosticsToText(report);
    expect(text).toContain('通用兼容接口');
    expect(text).not.toContain('sk-memory-only');
  });
});
