import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createMockModel,
  replicaSetMockConnection,
} from '../src/modules/_shared/testing/mock-model.js';
import { createTestApp } from '../src/modules/_shared/testing/test-app.js';
import { ProjectsModule } from '../src/modules/projects/projects.module.js';

describe('Projects API', () => {
  let app: INestApplication;
  const Project = createMockModel();
  const Task = createMockModel();
  const Release = createMockModel();
  const Milestone = createMockModel();
  const Knowledge = createMockModel();
  const FocusPlan = createMockModel();
  const FocusSession = createMockModel();
  const WeeklyGoal = createMockModel();

  const allModels = [
    Project,
    Task,
    Release,
    Milestone,
    Knowledge,
    FocusPlan,
    FocusSession,
    WeeklyGoal,
  ];

  async function setup(connection: unknown = undefined): Promise<void> {
    app = await createTestApp([ProjectsModule], {
      models: {
        Project,
        Task,
        Release,
        Milestone,
        Knowledge,
        FocusPlan,
        FocusSession,
        WeeklyGoal,
      },
      ...(connection ? { connection } : {}),
    });
  }

  beforeEach(async () => {
    await setup();
  });

  afterEach(async () => {
    await app.close();
    for (const model of allModels) model.reset();
  });

  describe('CRUD', () => {
    it('创建项目（含全部字段）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .send({
          name: '网站重构',
          description: '将旧站迁移到 Nuxt 3',
          status: 'active',
          favorite: true,
          progressMode: 'manual',
          progress: 30,
          targetDate: '2026-12-31',
          techStack: ['Nuxt', 'TypeScript'],
          tags: ['web', '重构'],
        })
        .expect(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBe('网站重构');
      expect(res.body.description).toBe('将旧站迁移到 Nuxt 3');
      expect(res.body.status).toBe('active');
      expect(res.body.favorite).toBe(true);
      expect(res.body.progressMode).toBe('manual');
      expect(res.body.progress).toBe(30);
      expect(res.body.targetDate).toBe('2026-12-31T00:00:00.000Z');
      expect(res.body.techStack).toEqual(['Nuxt', 'TypeScript']);
      expect(res.body.tags).toEqual(['web', '重构']);
      expect(res.body.archived).toBe(false);
    });

    it('创建项目使用默认值', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '默认值项目' })
        .expect(201);
      expect(res.body.status).toBe('planning');
      expect(res.body.favorite).toBe(false);
      expect(res.body.progressMode).toBe('manual');
      expect(res.body.progress).toBe(0);
      expect(res.body.archived).toBe(false);
      expect(res.body.tags).toEqual([]);
      expect(res.body.techStack).toEqual([]);
    });

    it('DTO 校验：缺少 name 返回 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ status: 'active' })
        .expect(400);
      expect(res.body.message).toBeTruthy();
    });

    it('DTO 校验：多余字段被拒绝（forbidNonWhitelisted）', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: 'x', ownerId: 'someone' })
        .expect(400);
    });

    it('非法枚举返回 400', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: 'x', status: 'unknown' })
        .expect(400);
    });

    it('获取详情', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '详情项目' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${created.body.id}`)
        .expect(200);
      expect(res.body.name).toBe('详情项目');
    });

    it('获取不存在的项目返回 404', async () => {
      const id = new Types.ObjectId().toString();
      await request(app.getHttpServer()).get(`/api/projects/${id}`).expect(404);
    });

    it('非法 ObjectId 返回 400', async () => {
      await request(app.getHttpServer()).get('/api/projects/not-an-objectid').expect(400);
      await request(app.getHttpServer())
        .patch('/api/projects/not-an-objectid')
        .send({ name: 'x' })
        .expect(400);
      await request(app.getHttpServer()).delete('/api/projects/not-an-objectid').expect(400);
    });

    it('PATCH 更新字段', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '旧名' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .patch(`/api/projects/${created.body.id}`)
        .send({ name: '新名', favorite: true })
        .expect(200);
      expect(res.body.name).toBe('新名');
      expect(res.body.favorite).toBe(true);
    });
  });

  describe('搜索 / 分页 / 筛选 / 排序', () => {
    beforeEach(async () => {
      const server = app.getHttpServer();
      await request(server)
        .post('/api/projects')
        .send({ name: 'Alpha 项目', tags: ['web'], status: 'active' });
      await request(server)
        .post('/api/projects')
        .send({ name: 'Beta 项目', description: '包含关键词 重构', status: 'planning' });
      await request(server)
        .post('/api/projects')
        .send({ name: 'Gamma 项目', tags: ['mobile'], status: 'completed', favorite: true });
    });

    it('search 匹配名称/描述/标签', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ search: 'Beta' })
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].name).toBe('Beta 项目');

      const res2 = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ search: '重构' })
        .expect(200);
      expect(res2.body.total).toBe(1);

      const res3 = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ search: 'mobile' })
        .expect(200);
      expect(res3.body.total).toBe(1);
    });

    it('search 不区分大小写且无结果返回空', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ search: 'alpha' })
        .expect(200);
      expect(res.body.total).toBe(1);
      const empty = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ search: '不存在词' })
        .expect(200);
      expect(empty.body.total).toBe(0);
      expect(empty.body.items).toEqual([]);
    });

    it('状态筛选', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ status: 'active' })
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].name).toBe('Alpha 项目');
    });

    it('收藏筛选', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ favorite: 'true' })
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].name).toBe('Gamma 项目');

      const res2 = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ favorite: 'false' })
        .expect(200);
      expect(res2.body.total).toBe(2);
    });

    it('分页', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ page: 1, pageSize: 2 })
        .expect(200);
      expect(res.body.items.length).toBe(2);
      expect(res.body.total).toBe(3);
      expect(res.body.totalPages).toBe(2);
      const page2 = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ page: 2, pageSize: 2 })
        .expect(200);
      expect(page2.body.items.length).toBe(1);
      expect(page2.body.page).toBe(2);
    });

    it('按名称排序 asc/desc', async () => {
      const asc = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ sortBy: 'name', sortOrder: 'asc' })
        .expect(200);
      expect(asc.body.items.map((p: { name: string }) => p.name)).toEqual([
        'Alpha 项目',
        'Beta 项目',
        'Gamma 项目',
      ]);

      const desc = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ sortBy: 'name', sortOrder: 'desc' })
        .expect(200);
      expect(desc.body.items.map((p: { name: string }) => p.name)).toEqual([
        'Gamma 项目',
        'Beta 项目',
        'Alpha 项目',
      ]);
    });

    it('非法排序字段返回 400', async () => {
      await request(app.getHttpServer()).get('/api/projects').query({ sortBy: 'hack' }).expect(400);
    });
  });

  describe('归档与删除策略', () => {
    it('归档后默认列表不显示，archived=true 显示', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '将归档' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/projects/${created.body.id}/archive`)
        .expect(200);

      const list = await request(app.getHttpServer()).get('/api/projects').expect(200);
      expect(list.body.total).toBe(0);

      const archived = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ archived: 'true' })
        .expect(200);
      expect(archived.body.total).toBe(1);

      const all = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ includeArchived: 'true' })
        .expect(200);
      expect(all.body.total).toBe(1);
    });

    it('恢复归档', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '恢复我' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/projects/${created.body.id}/archive`)
        .expect(200);
      const restored = await request(app.getHttpServer())
        .post(`/api/projects/${created.body.id}/restore`)
        .expect(200);
      expect(restored.body.archived).toBe(false);
    });

    it('DELETE 默认归档（保留数据与任务）', async () => {
      const project = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '软删除' })
        .expect(201);
      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: '项目任务', projectId: project.body.id })
        .expect(201);

      await request(app.getHttpServer()).delete(`/api/projects/${project.body.id}`).expect(204);

      const archived = await request(app.getHttpServer())
        .get('/api/projects')
        .query({ archived: 'true' })
        .expect(200);
      expect(archived.body.total).toBe(1);
      // 任务保留且仍属于该项目
      const taskRes = await request(app.getHttpServer())
        .get(`/api/tasks/${task.body.id}`)
        .expect(200);
      expect(taskRes.body.projectId).toBe(project.body.id);
    });

    it('永久删除 cascade：任务/知识/里程碑删除，发布解除关联', async () => {
      const project = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '永久删除' })
        .expect(201);
      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: '将被删任务', projectId: project.body.id })
        .expect(201);
      const milestone = await request(app.getHttpServer())
        .post('/api/releases/milestones')
        .send({ name: 'M1', projectId: project.body.id })
        .expect(201);
      const release = await request(app.getHttpServer())
        .post('/api/releases')
        .send({
          version: '1.0.0',
          summary: '发布',
          projectId: project.body.id,
          milestoneIds: [milestone.body.id],
        })
        .expect(201);
      const knowledge = await request(app.getHttpServer())
        .post('/api/knowledge')
        .send({
          type: 'decision',
          title: '技术选型',
          content: '使用 Nuxt',
          projectId: project.body.id,
          taskId: task.body.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/projects/${project.body.id}`)
        .query({ permanent: 'true', taskStrategy: 'cascade' })
        .expect(204);

      await request(app.getHttpServer()).get(`/api/projects/${project.body.id}`).expect(404);
      await request(app.getHttpServer()).get(`/api/tasks/${task.body.id}`).expect(404);
      await request(app.getHttpServer())
        .get(`/api/releases/milestones/${milestone.body.id}`)
        .expect(404);
      await request(app.getHttpServer()).get(`/api/knowledge/${knowledge.body.id}`).expect(404);
      // 发布保留但解除项目/里程碑关联
      const kept = await request(app.getHttpServer())
        .get(`/api/releases/${release.body.id}`)
        .expect(200);
      expect(kept.body.projectId).toBeNull();
      expect(kept.body.milestoneIds).toEqual([]);
    });

    it('永久删除 inbox：任务转入收件箱', async () => {
      const project = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '转收件箱' })
        .expect(201);
      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: '收件箱任务', projectId: project.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/projects/${project.body.id}`)
        .query({ permanent: 'true', taskStrategy: 'inbox' })
        .expect(204);

      const inbox = await request(app.getHttpServer())
        .get('/api/tasks')
        .query({ projectId: 'inbox' })
        .expect(200);
      expect(inbox.body.total).toBe(1);
      expect(inbox.body.items[0].id).toBe(task.body.id);
      expect(inbox.body.items[0].projectId).toBeNull();
    });

    it('永久删除时清理外部任务对该项目任务的依赖引用', async () => {
      const project = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '清理依赖' })
        .expect(201);
      const projectTask = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: '被依赖', projectId: project.body.id })
        .expect(201);
      const external = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: '外部任务', dependencies: [projectTask.body.id] })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/projects/${project.body.id}`)
        .query({ permanent: 'true', taskStrategy: 'cascade' })
        .expect(204);

      const kept = await request(app.getHttpServer())
        .get(`/api/tasks/${external.body.id}`)
        .expect(200);
      expect(kept.body.dependencies).toEqual([]);
    });
  });

  describe('进度模式', () => {
    it('auto 模式按任务完成率计算进度', async () => {
      const project = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '自动进度', progressMode: 'auto' })
        .expect(201);
      const id = project.body.id;
      await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 't1', projectId: id, status: 'done' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 't2', projectId: id, status: 'todo' })
        .expect(201);

      const res = await request(app.getHttpServer()).get(`/api/projects/${id}`).expect(200);
      expect(res.body.progress).toBe(50);
    });

    it('manual 模式使用手动进度值', async () => {
      const project = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '手动进度', progressMode: 'manual', progress: 66 })
        .expect(201);
      const res = await request(app.getHttpServer())
        .get(`/api/projects/${project.body.id}`)
        .expect(200);
      expect(res.body.progress).toBe(66);
    });
  });

  describe('Mongo 错误映射', () => {
    it('CastError → 400', async () => {
      const original = Project.findById;
      Project.findById = (() => ({
        exec: async () => {
          const err = new Error('Cast to ObjectId failed');
          err.name = 'CastError';
          throw err;
        },
      })) as never;
      try {
        const id = '000000000000000000000000';
        const res = await request(app.getHttpServer()).get(`/api/projects/${id}`).expect(400);
        expect(res.body.message).toContain('ObjectId');
      } finally {
        Project.findById = original;
      }
    });

    it('DuplicateKeyError(11000) → 409', async () => {
      const original = Project.create;
      Project.create = (async () => {
        const err = new Error('E11000 duplicate key');
        (err as { code?: number }).code = 11000;
        throw err;
      }) as never;
      try {
        const res = await request(app.getHttpServer())
          .post('/api/projects')
          .send({ name: 'x' })
          .expect(409);
        expect(res.body.message).toContain('唯一键');
      } finally {
        Project.create = original;
      }
    });

    it('ValidationError → 400', async () => {
      const original = Project.create;
      Project.create = (async () => {
        const err = new Error('Project validation failed: name: required');
        err.name = 'ValidationError';
        throw err;
      }) as never;
      try {
        const res = await request(app.getHttpServer())
          .post('/api/projects')
          .send({ name: 'x' })
          .expect(400);
        expect(res.body.message).toContain('校验失败');
      } finally {
        Project.create = original;
      }
    });
  });

  describe('事务路径（replica set 连接）', () => {
    it('永久删除在支持事务的连接上使用真实事务', async () => {
      await app.close();
      for (const model of allModels) model.reset();

      let transactionCalled = false;
      const replicaConnection = {
        ...replicaSetMockConnection,
        transaction: async (fn: (session?: unknown) => Promise<unknown>): Promise<unknown> => {
          transactionCalled = true;
          return fn({ isMockSession: true });
        },
      };
      app = await createTestApp([ProjectsModule], {
        models: {
          Project,
          Task,
          Release,
          Milestone,
          Knowledge,
          FocusPlan,
          FocusSession,
          WeeklyGoal,
        },
        connection: replicaConnection,
      });

      const project = await request(app.getHttpServer())
        .post('/api/projects')
        .send({ name: '事务删除' })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/projects/${project.body.id}`)
        .query({ permanent: 'true' })
        .expect(204);
      expect(transactionCalled).toBe(true);
      await request(app.getHttpServer()).get(`/api/projects/${project.body.id}`).expect(404);
    });
  });
});
