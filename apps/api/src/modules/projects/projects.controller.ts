import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { ApiPaginatedResponse } from '../_shared/pagination.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { ProjectDto } from './dto/project-response.dto.js';
import { QueryProjectsDto } from './dto/query-projects.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { type ProjectJson, ProjectsService } from './projects.service.js';
import { type TaskDisposalStrategy } from '../tasks/tasks.schema.js';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: '创建项目' })
  create(@Body() dto: CreateProjectDto): Promise<ProjectJson> {
    return this.projectsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '查询项目列表（分页/搜索/筛选/排序）' })
  @ApiQuery({ name: 'page', required: false, description: '页码，从 1 开始' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数' })
  @ApiQuery({ name: 'search', required: false, description: '关键词（名称/描述/标签）' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['planning', 'active', 'paused', 'completed'],
  })
  @ApiQuery({ name: 'favorite', required: false, description: '仅收藏' })
  @ApiQuery({ name: 'archived', required: false, description: '仅已归档' })
  @ApiQuery({ name: 'includeArchived', required: false, description: '包含已归档（默认排除）' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'updatedAt', 'name', 'targetDate', 'progress'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiPaginatedResponse(ProjectDto)
  findAll(@Query() query: QueryProjectsDto) {
    return this.projectsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取项目详情' })
  findOne(@Param('id') id: string): Promise<ProjectJson> {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新项目' })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto): Promise<ProjectJson> {
    return this.projectsService.update(id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '归档项目（软删除，保留数据）' })
  archive(@Param('id') id: string): Promise<ProjectJson> {
    return this.projectsService.archive(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复已归档项目' })
  restore(@Param('id') id: string): Promise<ProjectJson> {
    return this.projectsService.restore(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '删除项目',
    description:
      '默认归档（软删除，数据保留）。permanent=true 时永久删除并级联处置关联数据：' +
      '任务按 taskStrategy（cascade 删除 / inbox 转入收件箱），知识条目删除，里程碑删除并清理发布引用，' +
      '发布记录解除项目关联，focus 清空对已删任务的引用。',
  })
  @ApiQuery({ name: 'permanent', required: false, description: 'true 为永久删除', type: Boolean })
  @ApiQuery({
    name: 'taskStrategy',
    required: false,
    enum: ['cascade', 'inbox'],
    description: '永久删除时任务处置策略（默认 cascade）',
  })
  async remove(
    @Param('id') id: string,
    @Query('permanent') permanent?: string,
    @Query('taskStrategy') taskStrategy?: TaskDisposalStrategy,
  ): Promise<void> {
    await this.projectsService.remove(id, {
      permanent: permanent === 'true',
      taskStrategy: taskStrategy ?? 'cascade',
    });
  }
}
