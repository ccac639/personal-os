import { describe, expect, it } from 'vitest';

import { redactHeaders, redactSensitive, redactUrl } from '../src/common/security/redact.js';

describe('redactSensitive（字符串脱敏）', () => {
  it('Mongo/Redis/HTTP URI 凭证 → 脱敏并保留 host', () => {
    expect(redactSensitive('mongodb://user:pass@localhost:27017/db')).toBe(
      'mongodb://***@localhost:27017/db',
    );
    expect(redactSensitive('mongodb+srv://admin:secret@cluster.example.com/db')).toBe(
      'mongodb+srv://***@cluster.example.com/db',
    );
    expect(redactSensitive('redis://:hunter2@localhost:6379')).toBe('redis://***@localhost:6379');
    expect(redactSensitive('https://admin:hunter2@example.com/x')).toBe(
      'https://***@example.com/x',
    );
  });

  it('敏感字段值 → [REDACTED]', () => {
    expect(redactSensitive('"password":"hunter2"')).toBe('"password":"[REDACTED]"');
    expect(redactSensitive('token=abc123')).toContain('[REDACTED]');
    expect(redactSensitive('API_KEY=sk-xxx')).toContain('[REDACTED]');
    expect(redactSensitive('"secret":"s3cret"')).toContain('[REDACTED]');
  });

  it('普通文本与路径不变', () => {
    expect(redactSensitive('hello world')).toBe('hello world');
    expect(redactSensitive('GET /api/projects?page=2')).toBe('GET /api/projects?page=2');
  });
});

describe('redactHeaders（请求头脱敏）', () => {
  it('敏感头替换为 [REDACTED]，其余保留', () => {
    const out = redactHeaders({
      authorization: 'Bearer xxx',
      'x-api-key': 'secret-key',
      cookie: 'session=abc',
      'content-type': 'application/json',
      'x-request-id': 'req-1',
    });
    expect(out.authorization).toBe('[REDACTED]');
    expect(out['x-api-key']).toBe('[REDACTED]');
    expect(out.cookie).toBe('[REDACTED]');
    expect(out['content-type']).toBe('application/json');
    expect(out['x-request-id']).toBe('req-1');
  });

  it('大小写不敏感', () => {
    const out = redactHeaders({ Authorization: 'Bearer x', 'X-Api-Key': 'k' });
    expect(out.Authorization).toBe('[REDACTED]');
    expect(out['X-Api-Key']).toBe('[REDACTED]');
  });
});

describe('redactUrl（访问日志 URL 脱敏）', () => {
  it('敏感 query 参数值 → [REDACTED]', () => {
    expect(redactUrl('/api/x?token=abc&page=2')).toBe('/api/x?token=[REDACTED]&page=2');
    expect(redactUrl('/api/x?api_key=k1&code=c2&name=n')).toBe(
      '/api/x?api_key=[REDACTED]&code=[REDACTED]&name=n',
    );
  });

  it('无 query / 非敏感参数不变', () => {
    expect(redactUrl('/api/health')).toBe('/api/health');
    expect(redactUrl('/api/projects?page=2&sort=name')).toBe('/api/projects?page=2&sort=name');
  });
});
