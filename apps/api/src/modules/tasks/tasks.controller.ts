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
import { CreateTaskDto } from './dto/create-task.dto.js';
import { QueryTasksDto } from './dto/query-tasks.dto.js';
import { TaskDto } from './dto/task-response.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { type TaskJson, TasksService } from './tasks.service.js';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: '创建任务（不传 projectId 则为收件箱任务）' })
  create(@Body() dto: CreateTaskDto): Promise<TaskJson> {
    return this.tasksService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '查询任务列表（分页/搜索/筛选/排序）' })
  @ApiQuery({
    name: 'projectId',
    required: false,
    description: '项目 ID；inbox 查收件箱；不传查全部',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['todo', 'in-progress', 'done', 'cancelled'] })
  @ApiQuery({ name: 'priority', required: false, enum: ['low', 'medium', 'high', 'urgent'] })
  @ApiQuery({ name: 'tags', required: false, isArray: true, description: '标签（任一命中）' })
  @ApiQuery({ name: 'search', required: false, description: '关键词（标题/描述/标签）' })
  @ApiQuery({ name: 'dueFrom', required: false, description: '截止日期起' })
  @ApiQuery({ name: 'dueTo', required: false, description: '截止日期止' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['sortOrder', 'createdAt', 'updatedAt', 'dueDate', 'priority', 'status'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiPaginatedResponse(TaskDto)
  findAll(@Query() query: QueryTasksDto) {
    return this.tasksService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取任务详情' })
  findOne(@Param('id') id: string): Promise<TaskJson> {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新任务（PATCH 语义，dependencies 传了才整体替换并校验）' })
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto): Promise<TaskJson> {
    return this.tasksService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除任务（同时清理其他任务对该任务的依赖引用）' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.tasksService.remove(id);
  }
}
