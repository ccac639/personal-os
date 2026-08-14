/**
 * Workflow REST API（全局前缀 /api）
 *
 * - /api/workflows：CRUD / 复制 / 模板 / 版本 / 导入导出 / 运行创建与历史
 * - /api/runs：运行详情 / 取消 / 日志
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { WorkflowService, type WorkflowPayloadInput } from './workflow.service.js';
import { WorkflowRunService, type CreateRunInput } from './workflow-run.service.js';

/* ---------- 查询参数解析 ---------- */

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new BadRequestException(`无效的布尔参数：${value}`);
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException('limit 必须是正整数');
  }
  return n;
}

function parseOffset(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new BadRequestException('offset 必须是非负整数');
  }
  return n;
}

@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly service: WorkflowService,
    private readonly runService: WorkflowRunService,
  ) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('tag') tag?: string,
    @Query('favorite') favorite?: string,
    @Query('archived') archived?: string,
    @Query('isTemplate') isTemplate?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const validSort = ['updatedAt', 'name', 'createdAt'];
    if (sort && !validSort.includes(sort)) {
      throw new BadRequestException(`sort 必须是 ${validSort.join(' / ')}`);
    }
    if (order && order !== 'asc' && order !== 'desc') {
      throw new BadRequestException('order 必须是 asc 或 desc');
    }
    return this.service.list({
      q,
      tag,
      favorite: parseBool(favorite),
      archived: parseBool(archived),
      isTemplate: parseBool(isTemplate),
      sort: sort as 'updatedAt' | 'name' | 'createdAt' | undefined,
      order: order as 'asc' | 'desc' | undefined,
      limit: parseLimit(limit),
      offset: parseOffset(offset),
    });
  }

  @Post()
  create(@Body() body: WorkflowPayloadInput) {
    return this.service.create(body);
  }

  /** 导入：body 为导出的 JSON 结构（严格校验） */
  @Post('import')
  import(@Body() body: WorkflowPayloadInput) {
    return this.service.importWorkflow(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: WorkflowPayloadInput) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.service.duplicate(id);
  }

  /** 模板标记 */
  @Post(':id/template')
  setTemplate(@Param('id') id: string, @Body() body: { isTemplate?: unknown }) {
    if (typeof body.isTemplate !== 'boolean') {
      throw new BadRequestException('isTemplate 必须是布尔值');
    }
    return this.service.setTemplate(id, body.isTemplate);
  }

  /** 创建版本快照 */
  @Post(':id/versions')
  createVersion(@Param('id') id: string, @Body() body: { summary?: unknown }) {
    const summary = typeof body.summary === 'string' ? body.summary : '';
    return this.service.createVersion(id, summary);
  }

  /** 恢复版本快照 */
  @Post(':id/versions/:versionId/restore')
  restoreVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    return this.service.restoreVersion(id, versionId);
  }

  /** 导出（返回可导入的 JSON 结构） */
  @Get(':id/export')
  exportWorkflow(@Param('id') id: string) {
    return this.service.exportWorkflow(id);
  }

  /** 运行历史 */
  @Get(':id/runs')
  listRuns(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.runService.listRuns(id, {
      limit: parseLimit(limit),
      offset: parseOffset(offset),
    });
  }

  /** 创建运行（入队 workflow-runs） */
  @Post(':id/runs')
  createRun(@Param('id') id: string, @Body() body: CreateRunInput) {
    if (
      body &&
      typeof body === 'object' &&
      body.mode !== undefined &&
      !['full', 'from', 'single'].includes(body.mode)
    ) {
      throw new BadRequestException('mode 必须是 full / from / single');
    }
    return this.runService.createRun(id, body ?? {});
  }
}

@Controller('runs')
export class RunsController {
  constructor(private readonly runService: WorkflowRunService) {}

  @Get(':runId')
  getRun(@Param('runId') runId: string) {
    return this.runService.getRun(runId);
  }

  @Post(':runId/cancel')
  @HttpCode(200)
  cancelRun(@Param('runId') runId: string) {
    return this.runService.cancelRun(runId);
  }

  @Get(':runId/logs')
  getLogs(
    @Param('runId') runId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.runService.getLogs(runId, {
      limit: parseLimit(limit),
      offset: parseOffset(offset),
    });
  }
}
