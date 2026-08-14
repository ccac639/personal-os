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
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { InspirationsService } from './inspiration.service.js';
import {
  CreateInspirationDto,
  ImportInspirationsDto,
  ImportResultDto,
  InspirationImportItemDto,
  InspirationQueryDto,
  InspirationResponseDto,
  PatchInspirationStateDto,
  UpdateInspirationDto,
} from './inspiration.dto.js';
import { Paginated } from '../chat/chat.pagination.js';

/** 灵感库路由 */
@ApiTags('inspirations')
@Controller('inspirations')
export class InspirationsController {
  constructor(private readonly inspirations: InspirationsService) {}

  @Post()
  @ApiOperation({ summary: '创建灵感' })
  @ApiOkResponse({ type: InspirationResponseDto })
  create(@Body() dto: CreateInspirationDto): Promise<InspirationResponseDto> {
    return this.inspirations.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '灵感列表（分类/标签/来源/收藏/置顶/归档/关键字筛选）' })
  @ApiOkResponse({ type: InspirationResponseDto, isArray: true })
  list(@Query() query: InspirationQueryDto): Promise<Paginated<InspirationResponseDto>> {
    return this.inspirations.list(query);
  }

  @Post('import')
  @ApiOperation({ summary: '批量导入（重复策略：skip/overwrite/keep-both，支持 dryRun）' })
  @ApiOkResponse({ type: ImportResultDto })
  import(@Body() dto: ImportInspirationsDto): Promise<ImportResultDto> {
    return this.inspirations.importItems(dto);
  }

  @Get('export')
  @ApiOperation({ summary: '导出（与导入条目同构，可按页导出）' })
  @ApiOkResponse({ type: InspirationImportItemDto, isArray: true })
  export(@Query() query: InspirationQueryDto): Promise<InspirationImportItemDto[]> {
    return this.inspirations.exportItems(query);
  }

  @Post('from-message')
  @ApiOperation({ summary: '从聊天消息保存为灵感' })
  @ApiOkResponse({ type: InspirationResponseDto })
  saveFromMessage(
    @Body('conversationId') conversationId: string,
    @Body('messageId') messageId: string,
    @Body() dto: Partial<CreateInspirationDto>,
  ): Promise<InspirationResponseDto> {
    if (!conversationId || !messageId) throw new Error('conversationId 与 messageId 必填');
    return this.inspirations.saveFromMessage(conversationId, messageId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '灵感详情' })
  @ApiOkResponse({ type: InspirationResponseDto })
  get(@Param('id') id: string): Promise<InspirationResponseDto> {
    return this.inspirations.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新灵感' })
  @ApiOkResponse({ type: InspirationResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInspirationDto,
  ): Promise<InspirationResponseDto> {
    return this.inspirations.update(id, dto);
  }

  @Patch(':id/state')
  @ApiOperation({ summary: '灵感状态（收藏/置顶/归档）' })
  @ApiOkResponse({ type: InspirationResponseDto })
  patchState(
    @Param('id') id: string,
    @Body() dto: PatchInspirationStateDto,
  ): Promise<InspirationResponseDto> {
    return this.inspirations.patchState(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除灵感' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.inspirations.remove(id);
  }
}
