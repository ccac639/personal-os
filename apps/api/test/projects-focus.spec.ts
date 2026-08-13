import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMockModel } from '../src/modules/_shared/testing/mock-model.js';
import { createTestApp } from '../src/modules/_shared/testing/test-app.js';
import { FocusModule } from '../src/modules/focus/focus.module.js';

describe('Focus API（个人执行数据）', () => {
  let app: INestApplication;
  const FocusPlan = createMockModel();
  const FocusSession = createMockModel();
  const WeeklyGoal = createMockModel();

  beforeEach(async () => {
    app = await createTestApp([FocusModule], {
      models: { FocusPlan, FocusSession, WeeklyGoal },
    });
  });

  afterEach(async () => {
    await app.close();
    FocusPlan.reset();
    FocusSession.reset();
    WeeklyGoal.reset();
  });

  describe('今日计划', () => {
    it('PUT 创建计划并按日期读取', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/focus/plans/2026-08-13')
        .send({
          note: '专注的一天',
          items: [{ title: '写代码', done: true }, { title: '写文档' }],
        })
        .expect(200);
      expect(res.body.date).toBe('2026-08-13');
      expect(res.body.note).toBe('专注的一天');
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].done).toBe(true);

      const got = await request(app.getHttpServer()).get('/api/focus/plans/2026-08-13').expect(200);
      expect(got.body.items[1].title).toBe('写文档');
    });

    it('PUT 整体维护（覆盖 items）', async () => {
      await request(app.getHttpServer())
        .put('/api/focus/plans/2026-08-13')
        .send({ items: [{ title: '旧计划' }] })
        .expect(200);
      await request(app.getHttpServer())
        .put('/api/focus/plans/2026-08-13')
        .send({ items: [{ title: '新计划' }] })
        .expect(200);
      const got = await request(app.getHttpServer()).get('/api/focus/plans/2026-08-13').expect(200);
      expect(got.body.items).toHaveLength(1);
      expect(got.body.items[0].title).toBe('新计划');
    });

    it('读取不存在的日期返回 404', async () => {
      await request(app.getHttpServer()).get('/api/focus/plans/2026-01-01').expect(404);
    });

    it('按范围查询计划', async () => {
      await request(app.getHttpServer())
        .put('/api/focus/plans/2026-08-10')
        .send({ items: [{ title: 'a' }] });
      await request(app.getHttpServer())
        .put('/api/focus/plans/2026-08-12')
        .send({ items: [{ title: 'b' }] });
      await request(app.getHttpServer())
        .put('/api/focus/plans/2026-08-14')
        .send({ items: [{ title: 'c' }] });

      const res = await request(app.getHttpServer())
        .get('/api/focus/plans')
        .query({ from: '2026-08-11', to: '2026-08-13' })
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].date).toBe('2026-08-12');
    });

    it('非法日期格式返回 400', async () => {
      await request(app.getHttpServer()).get('/api/focus/plans/not-a-date').expect(400);
      await request(app.getHttpServer()).put('/api/focus/plans/2026-8-13').send({}).expect(400);
      await request(app.getHttpServer()).get('/api/focus/weekly-goals/bad-week').expect(400);
    });
  });

  describe('专注记录', () => {
    it('上报并查询专注记录', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/focus/sessions')
        .send({
          date: '2026-08-13',
          startedAt: '2026-08-13T09:00:00.000Z',
          endedAt: '2026-08-13T10:00:00.000Z',
          durationMinutes: 60,
          note: '深度工作',
        })
        .expect(201);
      expect(created.body.date).toBe('2026-08-13');
      expect(created.body.durationMinutes).toBe(60);

      const list = await request(app.getHttpServer())
        .get('/api/focus/sessions')
        .query({ date: '2026-08-13' })
        .expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].id).toBe(created.body.id);
    });

    it('按范围与任务筛选', async () => {
      const taskId = new Types.ObjectId().toString();
      await request(app.getHttpServer())
        .post('/api/focus/sessions')
        .send({ date: '2026-08-13', startedAt: '2026-08-13T09:00:00.000Z' });
      await request(app.getHttpServer())
        .post('/api/focus/sessions')
        .send({ date: '2026-08-14', startedAt: '2026-08-14T09:00:00.000Z', taskId });

      const byTask = await request(app.getHttpServer())
        .get('/api/focus/sessions')
        .query({ taskId })
        .expect(200);
      expect(byTask.body).toHaveLength(1);

      const byRange = await request(app.getHttpServer())
        .get('/api/focus/sessions')
        .query({ from: '2026-08-14', to: '2026-08-15' })
        .expect(200);
      expect(byRange.body).toHaveLength(1);
    });

    it('删除专注记录', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/focus/sessions')
        .send({ date: '2026-08-13', startedAt: '2026-08-13T09:00:00.000Z' })
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/api/focus/sessions/${created.body.id}`)
        .expect(204);
      await request(app.getHttpServer())
        .delete(`/api/focus/sessions/${created.body.id}`)
        .expect(404);
    });
  });

  describe('周目标', () => {
    it('PUT 创建并读取周目标', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/focus/weekly-goals/2026-08-10')
        .send({
          review: '本周完成 3 个目标',
          items: [
            { title: '完成项目 A', target: 1, done: true },
            { title: '健身 3 次', target: 3 },
          ],
        })
        .expect(200);
      expect(res.body.weekStart).toBe('2026-08-10');
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[1].target).toBe(3);
      expect(res.body.review).toBe('本周完成 3 个目标');

      const got = await request(app.getHttpServer())
        .get('/api/focus/weekly-goals/2026-08-10')
        .expect(200);
      expect(got.body.items[0].done).toBe(true);
    });

    it('不存在的周返回 404', async () => {
      await request(app.getHttpServer()).get('/api/focus/weekly-goals/2026-09-01').expect(404);
    });

    it('按范围查询周目标', async () => {
      await request(app.getHttpServer())
        .put('/api/focus/weekly-goals/2026-08-03')
        .send({ items: [{ title: 'w1' }] });
      await request(app.getHttpServer())
        .put('/api/focus/weekly-goals/2026-08-10')
        .send({ items: [{ title: 'w2' }] });
      const res = await request(app.getHttpServer())
        .get('/api/focus/weekly-goals')
        .query({ from: '2026-08-05', to: '2026-08-12' })
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].weekStart).toBe('2026-08-10');
    });
  });
});
