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
import { CreateMilestoneDto } from './dto/create-milestone.dto.js';
import { QueryMilestonesDto } from './dto/query-milestones.dto.js';
import { MilestoneDto } from './dto/release-response.dto.js';
import { UpdateMilestoneDto } from './dto/update-milestone.dto.js';
import { type MilestoneJson, ReleasesService } from './releases.service.js';

@ApiTags('releases')
@Controller('releases/milestones')
export class MilestonesController {
  constructor(private readonly releasesService: ReleasesService) {}

  @Post()
  @ApiOperation({ summary: '创建里程碑' })
  create(@Body() dto: CreateMilestoneDto): Promise<MilestoneJson> {
    return this.releasesService.createMilestone(dto);
  }

  @Get()
  @ApiOperation({ summary: '查询里程碑（分页/筛选/排序）' })
  @ApiQuery({ name: 'projectId', required: false, description: '按项目筛选' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['planned', 'in-progress', 'completed', 'cancelled'],
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['sortOrder', 'targetDate', 'name', 'createdAt', 'updatedAt'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiPaginatedResponse(MilestoneDto)
  findAll(@Query() query: QueryMilestonesDto) {
    return this.releasesService.findAllMilestones(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取里程碑详情' })
  findOne(@Param('id') id: string): Promise<MilestoneJson> {
    return this.releasesService.findOneMilestone(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新里程碑' })
  update(@Param('id') id: string, @Body() dto: UpdateMilestoneDto): Promise<MilestoneJson> {
    return this.releasesService.updateMilestone(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除里程碑（同时清理发布记录中的引用）' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.releasesService.removeMilestone(id);
  }
}
