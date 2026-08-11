import { describe, expect, it } from 'vitest';

import { configuration } from '../src/config/configuration.js';

describe('api configuration', () => {
  it('提供默认配置', () => {
    const config = configuration();
    expect(config.port).toBe(3000);
    expect(config.mongodb.uri).toContain('personal_os');
    expect(config.redis.url).toBe('redis://localhost:6379');
  });

  it('读取环境变量覆盖', () => {
    process.env.API_PORT = '4000';
    const config = configuration();
    expect(config.port).toBe(4000);
    delete process.env.API_PORT;
  });
});
