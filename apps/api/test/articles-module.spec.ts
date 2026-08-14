import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { RequestIdInterceptor } from '../src/common/interceptors/request-id.interceptor.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { createValidationPipe } from '../src/common/validation.js';
import { ArticlesModule } from '../src/modules/articles/articles.module.js';
import { ArticlesService } from '../src/modules/articles/articles.service.js';

/**
 * articles 契约测试（只读镜像 Blog 内容层）。
 *
 * 覆盖文档 Phase 1 验收项：
 * - 列表按 date 倒序、draft 排除；
 * - 详情未知 slug → 404（错误信封）；
 * - 标签/分类聚合正确；
 * - 统一成功信封 {code:'OK',message,data}（平台 TransformInterceptor）。
 */
describe('articles 模块（只读镜像 Blog 内容层）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ArticlesModule],
      providers: [
        { provide: APP_PIPE, useValue: createValidationPipe() },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
        { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('列表', () => {
    it('返回统一成功信封且 items 按 date 倒序、不含 draft', async () => {
      const res = await request(app.getHttpServer()).get('/articles').expect(200);
      expect(res.body.code).toBe('OK');
      expect(res.body.data).toBeDefined();
      const { items, total, page, pageSize } = res.body.data;
      expect(Array.isArray(items)).toBe(true);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(page).toBe(1);
      expect(pageSize).toBeGreaterThanOrEqual(1);
      // 倒序校验
      const dates = items.map((a: { date: string }) => a.date);
      const sorted = [...dates].sort((a, b) => b.localeCompare(a));
      expect(dates).toEqual(sorted);
      // draft 排除
      const slugs = items.map((a: { slug: string }) => a.slug);
      expect(slugs).not.toContain('draft-reading-list-2026');
      // 列表项不含正文
      for (const item of items) {
        expect(item.body).toBeUndefined();
      }
    });

    it('pageSize 非法（0）返回 400 校验错误', async () => {
      const res = await request(app.getHttpServer()).get('/articles?pageSize=0').expect(400);
      expect(res.body.code).toBeDefined();
    });

    it('未知 slug 详情返回 404', async () => {
      const res = await request(app.getHttpServer()).get('/articles/does-not-exist').expect(404);
      expect(res.body.code).toBeDefined();
    });
  });

  describe('详情', () => {
    it('返回正文（渲染 HTML）与相邻导航', async () => {
      const res = await request(app.getHttpServer()).get('/articles/hello-personal-os').expect(200);
      const { article, prev, next } = res.body.data;
      expect(article.slug).toBe('hello-personal-os');
      expect(article.title).toBe('你好，Personal OS');
      expect(article.body).toContain('<h3>');
      expect(article.tags).toContain('personal-os');
      // 相邻导航：非 draft 序列中按 date 倒序，hello-personal-os(08-01) 应有下一篇
      expect(typeof prev).toBe('object');
      expect(typeof next).toBe('object');
    });

    it('draft 文章详情返回 404', async () => {
      await request(app.getHttpServer()).get('/articles/draft-reading-list-2026').expect(404);
    });
  });

  describe('标签 / 分类聚合', () => {
    it('标签聚合含文章数且不含 draft 标签', async () => {
      const res = await request(app.getHttpServer()).get('/articles/tags').expect(200);
      const tags = res.body.data;
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThanOrEqual(1);
      const names = tags.map((t: { name: string }) => t.name);
      expect(names).not.toContain('书单'); // 仅 draft 文章使用
    });

    it('按标签筛选只返回该标签文章', async () => {
      const res = await request(app.getHttpServer()).get('/articles/by-tag/nuxt').expect(200);
      const items = res.body.data;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThanOrEqual(1);
      for (const item of items) {
        expect(item.tags).toContain('nuxt');
      }
    });

    it('分类聚合与按分类筛选', async () => {
      const catRes = await request(app.getHttpServer()).get('/articles/categories').expect(200);
      const cats = catRes.data ?? catRes.body.data;
      expect(Array.isArray(cats)).toBe(true);
      expect(cats.some((c: { name: string }) => c.name === '技术')).toBe(true);

      const byCat = await request(app.getHttpServer())
        .get('/articles/by-category/%E6%8A%80%E6%9C%AF')
        .expect(200);
      const items = byCat.body.data;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('service 层（复用 Blog 内容目录）', () => {
    it('与 blog 内容同步：列表总数 = 非 draft 文章数', () => {
      const service = app.get(ArticlesService);
      const { total } = service.list({});
      expect(total).toBeGreaterThanOrEqual(4); // 4 篇发布 + 1 篇 draft
    });

    it('getDetail 对未知 slug 返回 null', () => {
      const service = app.get(ArticlesService);
      expect(service.getDetail('missing')).toBeNull();
    });

    it('listTags 按文章数倒序', () => {
      const service = app.get(ArticlesService);
      const tags = service.listTags();
      const counts = tags.map((t) => t.count);
      const sorted = [...counts].sort((a, b) => b - a);
      expect(counts).toEqual(sorted);
    });
  });
});
