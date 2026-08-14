import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AgentsService } from './agents.service.js';
import {
  AgentQueryDto,
  AgentResponseDto,
  AgentStartResultDto,
  CreateAgentDto,
  UpdateAgentDto,
} from './agents.dto.js';
import { Paginated } from '../chat/chat.pagination.js';

/** 智能体路由 */
@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @ApiOperation({ summary: '智能体列表（内置模板 + 个人变体，含收藏/隐藏过滤）' })
  @ApiOkResponse({ type: AgentResponseDto, isArray: true })
  list(@Query() query: AgentQueryDto): Promise<Paginated<AgentResponseDto>> {
    return this.agents.list(query);
  }

  @Get('recent')
  @ApiOperation({ summary: '最近使用的智能体' })
  @ApiOkResponse({ type: AgentResponseDto, isArray: true })
  recent(@Query('limit') limit?: number): Promise<AgentResponseDto[]> {
    return this.agents.recent(limit ?? 10);
  }

  @Post()
  @ApiOperation({ summary: '创建个人智能体变体' })
  @ApiOkResponse({ type: AgentResponseDto })
  create(@Body() dto: CreateAgentDto): Promise<AgentResponseDto> {
    return this.agents.create(dto);
  }

  @Post('derive/:builtinKey')
  @ApiOperation({ summary: '从内置模板派生个人变体' })
  @ApiOkResponse({ type: AgentResponseDto })
  derive(
    @Param('builtinKey') builtinKey: string,
    @Body() dto: CreateAgentDto,
  ): Promise<AgentResponseDto> {
    return this.agents.deriveFromBuiltin(builtinKey, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '智能体详情' })
  @ApiOkResponse({ type: AgentResponseDto })
  get(@Param('id') id: string): Promise<AgentResponseDto> {
    return this.agents.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新智能体（收藏/隐藏/启用/配置）' })
  @ApiOkResponse({ type: AgentResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateAgentDto): Promise<AgentResponseDto> {
    return this.agents.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除个人智能体（内置模板不可删）' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.agents.remove(id);
  }

  @Post(':id/start')
  @ApiOperation({ summary: '启动智能体：创建 Chat 会话并记录使用' })
  @ApiOkResponse({ type: AgentStartResultDto })
  start(
    @Param('id') id: string,
    @Body('title') title?: string,
  ): Promise<{ agent: AgentResponseDto; conversationId: string }> {
    return this.agents.startConversation(id, undefined, title);
  }
}
