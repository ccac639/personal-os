import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMockModel } from '../src/modules/_shared/testing/mock-model.js';
import { createTestApp } from '../src/modules/_shared/testing/test-app.js';
import { KnowledgeModule } from '../src/modules/knowledge/knowledge.module.js';

describe('Knowledge API（项目知识条目）', () => {
  let app: INestApplication;
  const Knowledge = createMockModel();

  beforeEach(async () => {
    app = await createTestApp([KnowledgeModule], { models: { Knowledge } });
  });

  afterEach(async () => {
    await app.close();
    Knowledge.reset();
  });

  describe('创建与读取', () => {
    it('创建决策/问题/参考条目（含关联）', async () => {
      const projectId = new Types.ObjectId().toString();
      const taskId = new Types.ObjectId().toString();
      const milestoneId = new Types.ObjectId().toString();

      const decision = await request(app.getHttpServer())
        .post('/api/knowledge')
        .send({
          type: 'decision',
          title: '采用 Nuxt 3',
          content: '理由：生态成熟、性能好',
          projectId,
          taskId,
          milestoneId,
          tags: ['架构'],
        })
        .expect(201);
      expect(decision.body.type).toBe('decision');
      expect(decision.body.projectId).toBe(projectId);
      expect(decision.body.taskId).toBe(taskId);
      expect(decision.body.milestoneId).toBe(milestoneId);
      expect(decision.body.tags).toEqual(['架构']);

      const issue = await request(app.getHttpServer())
        .post('/api/knowledge')
        .send({ type: 'issue', title: '构建慢', content: '待优化', issueStatus: 'open' })
        .expect(201);
      expect(issue.body.issueStatus).toBe('open');

      const reference = await request(app.getHttpServer())
        .post('/api/knowledge')
        .send({ type: 'reference', title: 'Mongo 文档', content: 'https://mongodb.com/docs' })
        .expect(201);
      expect(reference.body.type).toBe('reference');
      expect(reference.body.issueStatus).toBeUndefined();
    });

    it('DTO 校验：缺 type/title/content 或非法枚举返回 400', async () => {
      await request(app.getHttpServer())
        .post('/api/knowledge')
        .send({ type: 'decision', title: 'x' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/knowledge')
        .send({ type: 'unknown', title: 'x', content: 'y' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/knowledge')
        .send({ type: 'issue', title: 'x', content: 'y', issueStatus: 'bad' })
        .expect(400);
    });

    it('获取详情/404/非法 ObjectId', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/knowledge')
        .send({ type: 'decision', title: 'x', content: 'y' })
        .expect(201);
      const got = await request(app.getHttpServer())
        .get(`/api/knowledge/${created.body.id}`)
        .expect(200);
      expect(got.body.title).toBe('x');

      await request(app.getHttpServer())
        .get(`/api/knowledge/${new Types.ObjectId().toString()}`)
        .expect(404);
      await request(app.getHttpServer()).get('/api/knowledge/bad-id').expect(400);
    });

    it('PATCH 更新与解除关联', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/knowledge')
        .send({ type: 'issue', title: '旧标题', content: '内容', issueStatus: 'open' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .patch(`/api/knowledge/${created.body.id}`)
        .send({ title: '新标题', issueStatus: 'resolved' })
        .expect(200);
      expect(res.body.title).toBe('新标题');
      expect(res.body.issueStatus).toBe('resolved');
    });

    it('删除条目', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/knowledge')
        .send({ type: 'reference', title: 'x', content: 'y' })
        .expect(201);
      await request(app.getHttpServer()).delete(`/api/knowledge/${created.body.id}`).expect(204);
      await request(app.getHttpServer()).get(`/api/knowledge/${created.body.id}`).expect(404);
    });
  });

  describe('过滤 / 搜索 / 分页', () => {
    beforeEach(async () => {
      const server = app.getHttpServer();
      const projectId = new Types.ObjectId().toString();
      const taskId = new Types.ObjectId().toString();
      await request(server)
        .post('/api/knowledge')
        .send({
          type: 'decision',
          title: '技术选型',
          content: 'Nuxt 3',
          projectId,
          tags: ['架构'],
        });
      await request(server)
        .post('/api/knowledge')
        .send({ type: 'issue', title: '性能问题', content: '首页加载慢', taskId, tags: ['性能'] });
      await request(server)
        .post('/api/knowledge')
        .send({ type: 'reference', title: '官方文档', content: '参考链接', tags: ['文档'] });
    });

    it('按类型过滤', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/knowledge')
        .query({ type: 'decision' })
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].title).toBe('技术选型');
    });

    it('按关联项目/任务过滤', async () => {
      const all = await request(app.getHttpServer()).get('/api/knowledge').expect(200);
      const projectId = all.body.items.find(
        (k: { title: string }) => k.title === '技术选型',
      ).projectId;
      const byProject = await request(app.getHttpServer())
        .get('/api/knowledge')
        .query({ projectId })
        .expect(200);
      expect(byProject.body.total).toBe(1);

      const taskId = all.body.items.find((k: { title: string }) => k.title === '性能问题').taskId;
      const byTask = await request(app.getHttpServer())
        .get('/api/knowledge')
        .query({ taskId })
        .expect(200);
      expect(byTask.body.total).toBe(1);
    });

    it('按标签过滤（任一命中）', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/knowledge')
        .query({ tags: ['架构'] })
        .expect(200);
      expect(res.body.total).toBe(1);
    });

    it('search 匹配标题/正文/标签', async () => {
      const byTitle = await request(app.getHttpServer())
        .get('/api/knowledge')
        .query({ search: '技术选型' })
        .expect(200);
      expect(byTitle.body.total).toBe(1);
      const byContent = await request(app.getHttpServer())
        .get('/api/knowledge')
        .query({ search: '加载慢' })
        .expect(200);
      expect(byContent.body.total).toBe(1);
      const byTag = await request(app.getHttpServer())
        .get('/api/knowledge')
        .query({ search: '文档' })
        .expect(200);
      expect(byTag.body.total).toBe(1);
    });

    it('分页与排序', async () => {
      const paged = await request(app.getHttpServer())
        .get('/api/knowledge')
        .query({ pageSize: 2 })
        .expect(200);
      expect(paged.body.total).toBe(3);
      expect(paged.body.items.length).toBe(2);

      const sorted = await request(app.getHttpServer())
        .get('/api/knowledge')
        .query({ sortBy: 'title', sortOrder: 'asc' })
        .expect(200);
      expect(sorted.body.items.map((k: { title: string }) => k.title)).toEqual([
        '官方文档',
        '技术选型',
        '性能问题',
      ]);
    });
  });
});
