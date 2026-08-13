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
import { CreateKnowledgeDto } from './dto/create-knowledge.dto.js';
import { KnowledgeDto } from './dto/knowledge-response.dto.js';
import { QueryKnowledgeDto } from './dto/query-knowledge.dto.js';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto.js';
import { type KnowledgeJson, KnowledgeService } from './knowledge.service.js';

@ApiTags('knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post()
  @ApiOperation({ summary: '创建知识条目（决策/问题/参考）' })
  create(@Body() dto: CreateKnowledgeDto): Promise<KnowledgeJson> {
    return this.knowledgeService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '查询知识条目（类型/关联/标签过滤 + 分页/搜索/排序）' })
  @ApiQuery({ name: 'type', required: false, enum: ['decision', 'issue', 'reference'] })
  @ApiQuery({ name: 'projectId', required: false, description: '按关联项目筛选' })
  @ApiQuery({ name: 'taskId', required: false, description: '按关联任务筛选' })
  @ApiQuery({ name: 'milestoneId', required: false, description: '按关联里程碑筛选' })
  @ApiQuery({ name: 'tags', required: false, isArray: true, description: '标签（任一命中）' })
  @ApiQuery({ name: 'search', required: false, description: '关键词（标题/正文/标签）' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['createdAt', 'updatedAt', 'title', 'type'] })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiPaginatedResponse(KnowledgeDto)
  findAll(@Query() query: QueryKnowledgeDto) {
    return this.knowledgeService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取知识条目详情' })
  findOne(@Param('id') id: string): Promise<KnowledgeJson> {
    return this.knowledgeService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新知识条目' })
  update(@Param('id') id: string, @Body() dto: UpdateKnowledgeDto): Promise<KnowledgeJson> {
    return this.knowledgeService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除知识条目' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.knowledgeService.remove(id);
  }
}
