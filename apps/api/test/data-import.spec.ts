import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createMockModel,
  replicaSetMockConnection,
} from '../src/modules/_shared/testing/mock-model.js';
import { createTestApp } from '../src/modules/_shared/testing/test-app.js';
import { DataImportModule } from '../src/modules/data-import/data-import.module.js';
import { IMPORT_VERSION } from '../src/modules/data-import/data-import.dto.js';

/** 可读的合法 ObjectId（24 hex） */
const P1 = '64b000000000000000000001';
const P2 = '64b000000000000000000002';
const T1 = '64b000000000000000000011';
const T2 = '64b000000000000000000012';
const T3 = '64b000000000000000000013';
const M1 = '64b000000000000000000021';
const R1 = '64b000000000000000000031';
const K1 = '64b000000000000000000041';
const F1 = '64b000000000000000000051';
const S1 = '64b000000000000000000061';
const W1 = '64b000000000000000000071';

function validImportPayload() {
  return {
    version: IMPORT_VERSION,
    projects: [{ id: P1, name: '项目1', status: 'active', tags: ['web'] }],
    tasks: [
      { id: T1, projectId: P1, title: '任务1', priority: 'high' },
      { id: T2, projectId: P1, title: '任务2', dependencies: [T1] },
      { id: T3, title: '收件箱任务' },
    ],
    milestones: [{ id: M1, projectId: P1, name: '里程碑1' }],
    releases: [
      {
        id: R1,
        version: '1.0.0',
        summary: '首个发布',
        projectId: P1,
        taskIds: [T1],
        milestoneIds: [M1],
        checklist: [{ title: '测试通过', done: true }],
      },
    ],
    knowledge: [
      {
        id: K1,
        type: 'decision',
        title: '技术选型',
        content: '使用 Nuxt',
        projectId: P1,
        taskId: T1,
      },
    ],
    focus: {
      plans: [
        { id: F1, date: '2026-08-13', note: '专注日', items: [{ taskId: T1, title: '写代码' }] },
      ],
      sessions: [{ id: S1, date: '2026-08-13', startedAt: '2026-08-13T09:00:00.000Z', taskId: T1 }],
      weeklyGoals: [
        { id: W1, weekStart: '2026-08-10', items: [{ taskId: T2, title: '完成目标' }] },
      ],
    },
  };
}

describe('Data Import API（localStorage 数据导入）', () => {
  let app: INestApplication;
  const Project = createMockModel();
  const Task = createMockModel();
  const Milestone = createMockModel();
  const Release = createMockModel();
  const Knowledge = createMockModel();
  const FocusPlan = createMockModel();
  const FocusSession = createMockModel();
  const WeeklyGoal = createMockModel();

  const allModels = [
    Project,
    Task,
    Milestone,
    Release,
    Knowledge,
    FocusPlan,
    FocusSession,
    WeeklyGoal,
  ];

  async function setup(connection: unknown = undefined): Promise<void> {
    app = await createTestApp([DataImportModule], {
      models: {
        Project,
        Task,
        Milestone,
        Release,
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

  describe('版本与数量上限', () => {
    it('不支持的版本返回 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send({ ...validImportPayload(), version: 99 })
        .expect(400);
      expect(res.body.message).toBeTruthy();
    });

    it('缺失 version 返回 400', async () => {
      const { version: _version, ...rest } = validImportPayload();
      void _version;
      await request(app.getHttpServer()).post('/api/data/import').send(rest).expect(400);
    });

    it('单集合数量超上限返回 400（projects > 500）', async () => {
      const projects = Array.from({ length: 501 }, (_, i) => ({
        id: new Types.ObjectId().toString(),
        name: `p${i}`,
      }));
      await request(app.getHttpServer())
        .post('/api/data/import')
        .send({ version: IMPORT_VERSION, projects })
        .expect(400);
    });

    it('未知字段被拒绝（whitelist），导入数据必须符合 API 契约', async () => {
      const payload = validImportPayload();
      (payload.tasks[0] as Record<string, unknown>).ownerId = 'me';
      await request(app.getHttpServer()).post('/api/data/import').send(payload).expect(400);
    });
  });

  describe('重复 ID 与引用完整性', () => {
    it('集合内重复 ID 返回 400', async () => {
      const payload = validImportPayload();
      (payload.projects as Array<Record<string, unknown>>).push({ id: P1, name: '重复项目' });
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send(payload)
        .expect(400);
      expect(res.body.message).toContain('重复 ID');
    });

    it('任务引用的项目不存在返回 400（引用必须自包含）', async () => {
      const payload = validImportPayload();
      payload.projects = [];
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send(payload)
        .expect(400);
      expect(res.body.message).toContain('自包含');
    });

    it('任务依赖不存在返回 400', async () => {
      const payload = validImportPayload();
      (payload.tasks as Array<Record<string, unknown>>)[0].dependencies = [
        '64b0000000000000000000ff',
      ];
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send(payload)
        .expect(400);
      expect(res.body.message).toContain('不存在');
    });

    it('任务自依赖返回 400', async () => {
      const payload = validImportPayload();
      (payload.tasks as Array<Record<string, unknown>>)[0].dependencies = [T1];
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send(payload)
        .expect(400);
      expect(res.body.message).toContain('自身');
    });

    it('任务循环依赖返回 400（A→B→A）', async () => {
      const payload = validImportPayload();
      (payload.tasks as Array<Record<string, unknown>>)[0].dependencies = [T2];
      // T1 依赖 T2 且 T2 依赖 T1 → 环
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send(payload)
        .expect(400);
      expect(res.body.message).toContain('循环');
    });

    it('跨项目任务依赖返回 400', async () => {
      const payload = validImportPayload();
      (payload.projects as Array<Record<string, unknown>>).push({ id: P2, name: '项目2' });
      (payload.tasks as Array<Record<string, unknown>>)[0].projectId = P1;
      (payload.tasks as Array<Record<string, unknown>>)[2] = {
        id: T3,
        projectId: P2,
        title: '其他项目任务',
      };
      (payload.tasks as Array<Record<string, unknown>>)[0].dependencies = [T3];
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send(payload)
        .expect(400);
      expect(res.body.message).toContain('跨项目');
    });

    it('发布引用的里程碑不存在返回 400', async () => {
      const payload = validImportPayload();
      payload.milestones = [];
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send(payload)
        .expect(400);
      expect(res.body.message).toContain('里程碑不存在');
    });

    it('知识条目任务与项目不一致返回 400', async () => {
      const payload = validImportPayload();
      (payload.projects as Array<Record<string, unknown>>).push({ id: P2, name: '项目2' });
      // K1 的 taskId 换成属于 P2 的任务，但 projectId 仍是 P1
      (payload.knowledge as Array<Record<string, unknown>>)[0].taskId = T3;
      (payload.tasks as Array<Record<string, unknown>>)[2] = {
        id: T3,
        projectId: P2,
        title: 'P2任务',
      };
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send(payload)
        .expect(400);
      expect(res.body.message).toContain('不一致');
    });

    it('专注记录引用的任务不存在返回 400', async () => {
      const payload = validImportPayload();
      (payload.focus.sessions as Array<Record<string, unknown>>)[0].taskId =
        '64b0000000000000000000ee';
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send(payload)
        .expect(400);
      expect(res.body.message).toContain('任务不存在');
    });
  });

  describe('成功导入与幂等性', () => {
    it('合法快照整体导入成功并返回计数', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send(validImportPayload())
        .expect(200);
      expect(res.body.imported).toEqual({
        projects: 1,
        tasks: 3,
        milestones: 1,
        releases: 1,
        knowledge: 1,
        plans: 1,
        sessions: 1,
        weeklyGoals: 1,
      });
      expect(res.body.total).toBe(10);

      // 数据真实落库且 id 保持导入值
      expect(Project.collection).toHaveLength(1);
      expect(Project.collection[0]?._id?.toString()).toBe(P1);
      expect(Task.collection).toHaveLength(3);
      expect(
        Task.collection
          .find((t) => (t._id as Types.ObjectId).toString() === T2)
          ?.dependencies?.map(String),
      ).toEqual([T1]);
      expect(Release.collection[0]?.milestoneIds?.map(String)).toEqual([M1]);
      expect(FocusPlan.collection[0]?.items?.[0]?.taskId?.toString()).toBe(T1);
    });

    it('重复导入幂等：不报错、不产生重复文档', async () => {
      await request(app.getHttpServer())
        .post('/api/data/import')
        .send(validImportPayload())
        .expect(200);
      // 修改一处数据验证 upsert 覆盖
      const changed = validImportPayload();
      (changed.projects as Array<Record<string, unknown>>)[0].name = '项目1-改名';
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send(changed)
        .expect(200);
      expect(res.body.total).toBe(10);

      expect(Project.collection).toHaveLength(1);
      expect(Project.collection[0]?.name).toBe('项目1-改名');
      expect(Task.collection).toHaveLength(3);
      expect(Release.collection).toHaveLength(1);
    });

    it('部分导入（仅任务+引用项目）允许', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/data/import')
        .send({
          version: IMPORT_VERSION,
          projects: [{ id: P1, name: '项目1' }],
          tasks: [{ id: T1, projectId: P1, title: '任务1' }],
        })
        .expect(200);
      expect(res.body.imported.projects).toBe(1);
      expect(res.body.imported.tasks).toBe(1);
      expect(res.body.imported.releases).toBe(0);
      expect(res.body.total).toBe(2);
    });
  });

  describe('事务路径（replica set 连接）', () => {
    it('导入在支持事务的连接上使用真实事务', async () => {
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
      app = await createTestApp([DataImportModule], {
        models: {
          Project,
          Task,
          Milestone,
          Release,
          Knowledge,
          FocusPlan,
          FocusSession,
          WeeklyGoal,
        },
        connection: replicaConnection,
      });

      await request(app.getHttpServer())
        .post('/api/data/import')
        .send(validImportPayload())
        .expect(200);
      expect(transactionCalled).toBe(true);
      expect(Task.collection).toHaveLength(3);
    });
  });
});
