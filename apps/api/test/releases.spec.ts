import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMockModel } from '../src/modules/_shared/testing/mock-model.js';
import { createTestApp } from '../src/modules/_shared/testing/test-app.js';
import { ReleasesModule } from '../src/modules/releases/releases.module.js';

describe('Releases API（发布检查单/记录 + 里程碑）', () => {
  let app: INestApplication;
  const Release = createMockModel();
  const Milestone = createMockModel();
  const Project = createMockModel();

  function seedProject(name = '项目A'): string {
    const id = new Types.ObjectId();
    Project.reset({
      _id: id,
      name,
      status: 'planning',
      archived: false,
      favorite: false,
      progressMode: 'manual',
      progress: 0,
      tags: [],
      techStack: [],
      description: '',
    });
    return id.toString();
  }

  beforeEach(async () => {
    app = await createTestApp([ReleasesModule], { models: { Release, Milestone, Project } });
  });

  afterEach(async () => {
    await app.close();
    Release.reset();
    Milestone.reset();
    Project.reset();
  });

  describe('发布记录', () => {
    it('创建发布记录（版本/摘要/检查单/关联）', async () => {
      const projectId = seedProject();
      const milestone = await request(app.getHttpServer())
        .post('/api/releases/milestones')
        .send({ name: 'M1', projectId })
        .expect(201);
      const taskId = new Types.ObjectId().toString();

      const res = await request(app.getHttpServer())
        .post('/api/releases')
        .send({
          version: '1.0.0',
          summary: '首个正式版本',
          status: 'in-progress',
          projectId,
          checklist: [
            { title: '单元测试通过', done: true },
            { title: '回归测试通过', done: false, notes: '待执行' },
          ],
          taskIds: [taskId],
          milestoneIds: [milestone.body.id],
          releaseDate: '2026-08-30',
        })
        .expect(201);
      expect(res.body.version).toBe('1.0.0');
      expect(res.body.status).toBe('in-progress');
      expect(res.body.checklist).toHaveLength(2);
      expect(res.body.checklist[0].done).toBe(true);
      expect(res.body.taskIds).toEqual([taskId]);
      expect(res.body.milestoneIds).toEqual([milestone.body.id]);
      expect(res.body.projectId).toBe(projectId);
    });

    it('projectId 不存在返回 400', async () => {
      await request(app.getHttpServer())
        .post('/api/releases')
        .send({ version: '1.0.0', summary: 'x', projectId: new Types.ObjectId().toString() })
        .expect(400);
    });

    it('DTO 校验：缺 version/summary 返回 400', async () => {
      await request(app.getHttpServer()).post('/api/releases').send({ summary: 'x' }).expect(400);
      await request(app.getHttpServer())
        .post('/api/releases')
        .send({ version: '1.0.0' })
        .expect(400);
    });

    it('搜索/筛选/分页', async () => {
      const server = app.getHttpServer();
      await request(server)
        .post('/api/releases')
        .send({ version: '1.0.0', summary: '第一个版本', status: 'published' });
      await request(server)
        .post('/api/releases')
        .send({ version: '1.1.0', summary: '第二个版本', status: 'ready' });
      await request(server)
        .post('/api/releases')
        .send({ version: '2.0.0', summary: '大版本', status: 'planned' });

      const search = await request(app.getHttpServer())
        .get('/api/releases')
        .query({ search: '1.1' })
        .expect(200);
      expect(search.body.total).toBe(1);

      const status = await request(app.getHttpServer())
        .get('/api/releases')
        .query({ status: 'published' })
        .expect(200);
      expect(status.body.total).toBe(1);

      const paged = await request(app.getHttpServer())
        .get('/api/releases')
        .query({ pageSize: 2 })
        .expect(200);
      expect(paged.body.total).toBe(3);
      expect(paged.body.items.length).toBe(2);
    });

    it('PATCH 更新检查单与状态', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/releases')
        .send({ version: '1.0.0', summary: 'x', checklist: [{ title: '检查1', done: false }] })
        .expect(201);
      const res = await request(app.getHttpServer())
        .patch(`/api/releases/${created.body.id}`)
        .send({ status: 'published', checklist: [{ title: '检查1', done: true }] })
        .expect(200);
      expect(res.body.status).toBe('published');
      expect(res.body.checklist[0].done).toBe(true);
    });

    it('删除发布记录', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/releases')
        .send({ version: '1.0.0', summary: 'x' })
        .expect(201);
      await request(app.getHttpServer()).delete(`/api/releases/${created.body.id}`).expect(204);
      await request(app.getHttpServer()).get(`/api/releases/${created.body.id}`).expect(404);
    });

    it('非法 ObjectId 返回 400', async () => {
      await request(app.getHttpServer()).get('/api/releases/not-an-id').expect(400);
    });
  });

  describe('里程碑', () => {
    it('创建/查询/更新里程碑', async () => {
      const projectId = seedProject();
      const created = await request(app.getHttpServer())
        .post('/api/releases/milestones')
        .send({ name: '里程碑1', projectId, targetDate: '2026-09-01', status: 'in-progress' })
        .expect(201);
      expect(created.body.name).toBe('里程碑1');
      expect(created.body.status).toBe('in-progress');

      const byProject = await request(app.getHttpServer())
        .get('/api/releases/milestones')
        .query({ projectId })
        .expect(200);
      expect(byProject.body.total).toBe(1);

      const updated = await request(app.getHttpServer())
        .patch(`/api/releases/milestones/${created.body.id}`)
        .send({ status: 'completed' })
        .expect(200);
      expect(updated.body.status).toBe('completed');
    });

    it('projectId 不存在返回 400', async () => {
      await request(app.getHttpServer())
        .post('/api/releases/milestones')
        .send({ name: 'M', projectId: new Types.ObjectId().toString() })
        .expect(400);
    });

    it('删除里程碑时清理发布记录中的引用', async () => {
      const milestone = await request(app.getHttpServer())
        .post('/api/releases/milestones')
        .send({ name: 'M' })
        .expect(201);
      const release = await request(app.getHttpServer())
        .post('/api/releases')
        .send({ version: '1.0.0', summary: 'x', milestoneIds: [milestone.body.id] })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/releases/milestones/${milestone.body.id}`)
        .expect(204);

      const kept = await request(app.getHttpServer())
        .get(`/api/releases/${release.body.id}`)
        .expect(200);
      expect(kept.body.milestoneIds).toEqual([]);
    });

    it('发布关联任务/里程碑后按关联查询', async () => {
      const m = await request(app.getHttpServer())
        .post('/api/releases/milestones')
        .send({ name: 'M' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/releases')
        .send({ version: '1.0.0', summary: 'x', milestoneIds: [m.body.id] })
        .expect(201);
      // 里程碑删除后 release 引用被清
      await request(app.getHttpServer())
        .delete(`/api/releases/milestones/${m.body.id}`)
        .expect(204);
      const list = await request(app.getHttpServer()).get('/api/releases').expect(200);
      expect(list.body.items[0].milestoneIds).toEqual([]);
    });
  });
});
