import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateSessionDto } from './dto/create-session.dto.js';
import { QueryFocusDto } from './dto/query-focus.dto.js';
import { UpsertPlanDto } from './dto/upsert-plan.dto.js';
import { UpsertWeeklyGoalDto } from './dto/upsert-weekly-goal.dto.js';
import { FocusService } from './focus.service.js';

@ApiTags('focus')
@Controller('focus')
export class FocusController {
  constructor(private readonly focusService: FocusService) {}

  // ---------- 今日计划 ----------

  @Get('plans/:date')
  @ApiOperation({ summary: '获取某日计划（404 表示尚未创建，可用 PUT 创建）' })
  getPlan(@Param('date') date: string) {
    return this.focusService.getPlan(date);
  }

  @Get('plans')
  @ApiOperation({ summary: '按日期范围查询计划（from/to 均为 YYYY-MM-DD）' })
  listPlans(@Query() query: QueryFocusDto) {
    return this.focusService.listPlans(query);
  }

  @Put('plans/:date')
  @ApiOperation({ summary: '创建或整体维护某日计划（upsert）' })
  upsertPlan(@Param('date') date: string, @Body() dto: UpsertPlanDto) {
    return this.focusService.upsertPlan(date, dto);
  }

  // ---------- 专注记录 ----------

  @Post('sessions')
  @ApiOperation({ summary: '上报一条专注记录（不提供真实定时器，由客户端计算时长）' })
  createSession(@Body() dto: CreateSessionDto) {
    return this.focusService.createSession(dto);
  }

  @Get('sessions')
  @ApiOperation({ summary: '查询专注记录（按 date 单日或 from/to 范围，按开始时间倒序）' })
  listSessions(@Query() query: QueryFocusDto) {
    return this.focusService.listSessions(query);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除专注记录' })
  async deleteSession(@Param('id') id: string): Promise<void> {
    await this.focusService.deleteSession(id);
  }

  // ---------- 周目标 ----------

  @Get('weekly-goals/:weekStart')
  @ApiOperation({ summary: '获取某周目标（weekStart 为周一日期）' })
  getWeeklyGoal(@Param('weekStart') weekStart: string) {
    return this.focusService.getWeeklyGoal(weekStart);
  }

  @Get('weekly-goals')
  @ApiOperation({ summary: '按范围查询周目标' })
  listWeeklyGoals(@Query() query: QueryFocusDto) {
    return this.focusService.listWeeklyGoals(query);
  }

  @Put('weekly-goals/:weekStart')
  @ApiOperation({ summary: '创建或整体维护某周目标（upsert）' })
  upsertWeeklyGoal(@Param('weekStart') weekStart: string, @Body() dto: UpsertWeeklyGoalDto) {
    return this.focusService.upsertWeeklyGoal(weekStart, dto);
  }
}
