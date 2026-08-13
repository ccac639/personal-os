import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMockModel } from '../src/modules/_shared/testing/mock-model.js';
import { createTestApp } from '../src/modules/_shared/testing/test-app.js';
import { TasksModule } from '../src/modules/tasks/tasks.module.js';

describe('Tasks API', () => {
  let app: INestApplication;
  const Task = createMockModel();
  const Project = createMockModel();

  /** 直接向 Project mock 写入项目数据（TasksModule 不含 ProjectsController） */
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
    app = await createTestApp([TasksModule], { models: { Task, Project } });
  });

  afterEach(async () => {
    await app.close();
    Task.reset();
    Project.reset();
  });

  describe('CRUD 与收件箱', () => {
    it('创建收件箱任务（不传 projectId）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({
          title: '收件箱任务',
          description: '待整理',
          priority: 'high',
          tags: ['inbox'],
          dueDate: '2026-08-20',
          estimatedMinutes: 30,
          actualMinutes: 0,
          dod: '完成并自测',
          blocked: true,
          blockedReason: '等待依赖',
          subtasks: [{ title: '子任务1' }, { title: '子任务2', done: true }],
          sortOrder: 5,
        })
        .expect(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.projectId).toBeNull();
      expect(res.body.title).toBe('收件箱任务');
      expect(res.body.status).toBe('todo');
      expect(res.body.priority).toBe('high');
      expect(res.body.tags).toEqual(['inbox']);
      expect(res.body.estimatedMinutes).toBe(30);
      expect(res.body.blocked).toBe(true);
      expect(res.body.blockedReason).toBe('等待依赖');
      expect(res.body.subtasks).toHaveLength(2);
      expect(res.body.subtasks[1].done).toBe(true);
      expect(res.body.sortOrder).toBe(5);
      expect(res.body.dependencies).toEqual([]);
    });

    it('项目分配：projectId 有效时创建成功', async () => {
      const projectId = seedProject();
      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: '项目任务', projectId })
        .expect(201);
      expect(res.body.projectId).toBe(projectId);
    });

    it('项目分配：projectId 不存在返回 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'x', projectId: new Types.ObjectId().toString() })
        .expect(400);
      expect(res.body.message).toContain('项目不存在');
    });

    it('非法 ObjectId 返回 400', async () => {
      await request(app.getHttpServer()).get('/api/tasks/abc').expect(400);
      await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'x', projectId: 'bad-id' })
        .expect(400);
    });

    it('DTO 校验：缺 title 返回 400，多余字段被拒绝', async () => {
      await request(app.getHttpServer()).post('/api/tasks').send({ status: 'todo' }).expect(400);
      await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'x', assigneeId: 'me' })
        .expect(400);
    });

    it('PATCH 更新与清空 projectId（转入收件箱）', async () => {
      const projectId = seedProject();
      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 't', projectId })
        .expect(201);
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${task.body.id}`)
        .send({ projectId: null, status: 'done' })
        .expect(200);
      expect(res.body.projectId).toBeNull();
      expect(res.body.status).toBe('done');
    });

    it('删除任务返回 404（不存在）', async () => {
      await request(app.getHttpServer())
        .delete(`/api/tasks/${new Types.ObjectId().toString()}`)
        .expect(404);
    });
  });

  describe('筛选 / 搜索 / 排序', () => {
    beforeEach(async () => {
      const server = app.getHttpServer();
      const projectId = seedProject('P');
      await request(server)
        .post('/api/tasks')
        .send({
          title: '紧急修复',
          projectId,
          priority: 'urgent',
          status: 'todo',
          tags: ['bug'],
          dueDate: '2026-08-10',
        });
      await request(server)
        .post('/api/tasks')
        .send({
          title: '写文档',
          priority: 'low',
          status: 'in-progress',
          tags: ['docs'],
          dueDate: '2026-08-15',
        });
      await request(server)
        .post('/api/tasks')
        .send({
          title: '发布上线',
          priority: 'high',
          status: 'done',
          tags: ['release'],
          dueDate: '2026-08-20',
        });
    });

    it('projectId 筛选与 inbox', async () => {
      const all = await request(app.getHttpServer()).get('/api/tasks').expect(200);
      expect(all.body.total).toBe(3);
      const inbox = await request(app.getHttpServer())
        .get('/api/tasks')
        .query({ projectId: 'inbox' })
        .expect(200);
      expect(inbox.body.total).toBe(2);
    });

    it('状态/优先级/标签筛选', async () => {
      const done = await request(app.getHttpServer())
        .get('/api/tasks')
        .query({ status: 'done' })
        .expect(200);
      expect(done.body.total).toBe(1);
      const urgent = await request(app.getHttpServer())
        .get('/api/tasks')
        .query({ priority: 'urgent' })
        .expect(200);
      expect(urgent.body.total).toBe(1);
      const tagged = await request(app.getHttpServer())
        .get('/api/tasks')
        .query({ tags: ['bug'] })
        .expect(200);
      expect(tagged.body.total).toBe(1);
    });

    it('search 匹配标题', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .query({ search: '文档' })
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].title).toBe('写文档');
    });

    it('dueDate 范围筛选', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .query({ dueFrom: '2026-08-11', dueTo: '2026-08-19' })
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].title).toBe('写文档');
    });

    it('按优先级排序（urgent > high > low）', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .query({ sortBy: 'priority', sortOrder: 'desc' })
        .expect(200);
      expect(res.body.items.map((t: { title: string }) => t.title)).toEqual([
        '紧急修复',
        '发布上线',
        '写文档',
      ]);
    });

    it('分页', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .query({ pageSize: 2, page: 2 })
        .expect(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.total).toBe(3);
    });
  });

  describe('依赖约束', () => {
    it('禁止自依赖', async () => {
      const task = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'A' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${task.body.id}`)
        .send({ dependencies: [task.body.id] })
        .expect(400);
      expect(res.body.message).toContain('自身');
    });

    it('禁止重复依赖', async () => {
      const a = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'A' })
        .expect(201);
      const b = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'B' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${a.body.id}`)
        .send({ dependencies: [b.body.id, b.body.id] })
        .expect(400);
      expect(res.body.message.join(', ')).toContain('重复');
    });

    it('依赖不存在返回 400', async () => {
      const a = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'A' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${a.body.id}`)
        .send({ dependencies: [new Types.ObjectId().toString()] })
        .expect(400);
      expect(res.body.message).toContain('不存在');
    });

    it('创建时拦截循环依赖', async () => {
      const b = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'B' })
        .expect(201);
      const c = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'C', dependencies: [b.body.id] })
        .expect(201);
      // B 依赖 C → B→C→B 成环
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${b.body.id}`)
        .send({ dependencies: [c.body.id] })
        .expect(400);
      expect(res.body.message).toContain('循环');
    });

    it('长链路循环依赖拦截（A→B→C→A）', async () => {
      const a = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'A' })
        .expect(201);
      const b = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'B' })
        .expect(201);
      const c = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'C' })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/api/tasks/${a.body.id}`)
        .send({ dependencies: [b.body.id] })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/tasks/${b.body.id}`)
        .send({ dependencies: [c.body.id] })
        .expect(200);
      // C 依赖 A 形成 A→B→C→A 环
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${c.body.id}`)
        .send({ dependencies: [a.body.id] })
        .expect(400);
      expect(res.body.message).toContain('循环');
    });

    it('合法依赖链允许创建', async () => {
      const a = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'A' })
        .expect(201);
      const b = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'B', dependencies: [a.body.id] })
        .expect(201);
      expect(b.body.dependencies).toEqual([a.body.id]);
    });
  });

  describe('依赖引用清理', () => {
    it('删除任务时清理其他任务的依赖引用', async () => {
      const a = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'A' })
        .expect(201);
      const b = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ title: 'B', dependencies: [a.body.id] })
        .expect(201);

      await request(app.getHttpServer()).delete(`/api/tasks/${a.body.id}`).expect(204);

      const kept = await request(app.getHttpServer()).get(`/api/tasks/${b.body.id}`).expect(200);
      expect(kept.body.dependencies).toEqual([]);
    });
  });
});
