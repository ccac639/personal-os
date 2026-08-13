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
import { CreateReleaseDto } from './dto/create-release.dto.js';
import { QueryReleasesDto } from './dto/query-releases.dto.js';
import { ReleaseDto } from './dto/release-response.dto.js';
import { UpdateReleaseDto } from './dto/update-release.dto.js';
import { type ReleaseJson, ReleasesService } from './releases.service.js';

@ApiTags('releases')
@Controller('releases')
export class ReleasesController {
  constructor(private readonly releasesService: ReleasesService) {}

  @Post()
  @ApiOperation({ summary: '创建发布记录（含检查单）' })
  create(@Body() dto: CreateReleaseDto): Promise<ReleaseJson> {
    return this.releasesService.createRelease(dto);
  }

  @Get()
  @ApiOperation({ summary: '查询发布记录（分页/搜索/筛选/排序）' })
  @ApiQuery({ name: 'search', required: false, description: '关键词（版本/摘要/说明）' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['planned', 'in-progress', 'ready', 'published', 'cancelled'],
  })
  @ApiQuery({ name: 'projectId', required: false, description: '按项目筛选' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'updatedAt', 'version', 'status', 'releaseDate'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiPaginatedResponse(ReleaseDto)
  findAll(@Query() query: QueryReleasesDto) {
    return this.releasesService.findAllReleases(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取发布详情' })
  findOne(@Param('id') id: string): Promise<ReleaseJson> {
    return this.releasesService.findOneRelease(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新发布记录（检查单整体替换）' })
  update(@Param('id') id: string, @Body() dto: UpdateReleaseDto): Promise<ReleaseJson> {
    return this.releasesService.updateRelease(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除发布记录' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.releasesService.removeRelease(id);
  }
}
