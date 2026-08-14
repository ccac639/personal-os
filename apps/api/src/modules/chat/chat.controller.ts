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

import { ConversationsService } from './conversations.service.js';
import { MessagesService } from './messages.service.js';
import { GenerationService } from './generation.service.js';
import {
  ConversationQueryDto,
  ConversationResponseDto,
  CreateConversationDto,
  PatchConversationStateDto,
  UpdateConversationDto,
} from './dto/conversation.dto.js';
import {
  AddBookmarkDto,
  AppendMessageDto,
  EditMessageDto,
  MessageQueryDto,
  MessageResponseDto,
} from './dto/message.dto.js';
import { GenerateMessageDto, RunResponseDto } from './dto/generation.dto.js';
import { Paginated } from './chat.pagination.js';
import { errBadRequest } from './chat.errors.js';

/** Chat 内容域路由（个人使用：ownerId 固定为 'me'，无鉴权依赖） */
@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly generation: GenerationService,
  ) {}

  // ---------- 会话 ----------

  @Post('conversations')
  @ApiOperation({ summary: '创建会话' })
  @ApiOkResponse({ type: ConversationResponseDto })
  createConversation(@Body() dto: CreateConversationDto): Promise<ConversationResponseDto> {
    return this.conversations.create(dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: '会话列表（固定/归档/收藏/关键字/智能体过滤）' })
  @ApiOkResponse({ type: ConversationResponseDto, isArray: true })
  listConversations(
    @Query() query: ConversationQueryDto,
  ): Promise<Paginated<ConversationResponseDto>> {
    return this.conversations.list(query);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: '会话详情' })
  @ApiOkResponse({ type: ConversationResponseDto })
  getConversation(@Param('id') id: string): Promise<ConversationResponseDto> {
    return this.conversations.get(id);
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: '更新会话（标题/系统提示词/模型设置）' })
  @ApiOkResponse({ type: ConversationResponseDto })
  updateConversation(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ): Promise<ConversationResponseDto> {
    return this.conversations.update(id, dto);
  }

  @Patch('conversations/:id/state')
  @ApiOperation({ summary: '会话状态（固定/归档/收藏）' })
  @ApiOkResponse({ type: ConversationResponseDto })
  patchConversationState(
    @Param('id') id: string,
    @Body() dto: PatchConversationStateDto,
  ): Promise<ConversationResponseDto> {
    return this.conversations.patchState(id, dto);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除会话（级联删除消息与生成任务）' })
  async deleteConversation(@Param('id') id: string): Promise<void> {
    await this.conversations.remove(id);
    await this.messages.removeAll(id);
    await this.generation.removeAll(id);
  }

  // ---------- 消息 ----------

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: '消息分页读取（按时间倒序）' })
  @ApiOkResponse({ type: MessageResponseDto, isArray: true })
  listMessages(
    @Param('id') conversationId: string,
    @Query() query: MessageQueryDto,
  ): Promise<Paginated<MessageResponseDto>> {
    return this.messages.list(conversationId, query);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: '追加消息' })
  @ApiOkResponse({ type: MessageResponseDto })
  appendMessage(
    @Param('id') conversationId: string,
    @Body() dto: AppendMessageDto,
  ): Promise<MessageResponseDto> {
    return this.messages.append(conversationId, dto);
  }

  @Get('conversations/:id/messages/bookmarks')
  @ApiOperation({ summary: '会话内全部带书签的消息' })
  @ApiOkResponse({ type: MessageResponseDto, isArray: true })
  listBookmarks(@Param('id') conversationId: string): Promise<MessageResponseDto[]> {
    return this.messages.listBookmarks(conversationId);
  }

  @Patch('conversations/:id/messages/:messageId')
  @ApiOperation({ summary: '编辑消息（清空生成信息，可配合 regenerate 重发）' })
  @ApiOkResponse({ type: MessageResponseDto })
  editMessage(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
  ): Promise<MessageResponseDto> {
    void conversationId;
    return this.messages.edit(messageId, dto);
  }

  @Post('conversations/:id/messages/:messageId/bookmarks')
  @ApiOperation({ summary: '给消息加书签' })
  @ApiOkResponse({ type: MessageResponseDto })
  addBookmark(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() dto: AddBookmarkDto,
  ): Promise<MessageResponseDto> {
    void conversationId;
    return this.messages.addBookmark(messageId, dto);
  }

  @Delete('conversations/:id/messages/:messageId/bookmarks/:bookmarkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '移除书签' })
  async removeBookmark(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Param('bookmarkId') bookmarkId: string,
  ): Promise<void> {
    void conversationId;
    await this.messages.removeBookmark(messageId, bookmarkId);
  }

  // ---------- 生成任务 ----------

  @Post('conversations/:id/generate')
  @ApiOperation({ summary: '基于已存在的用户消息创建生成任务（入队 mock 生成）' })
  @ApiOkResponse({ type: RunResponseDto })
  generate(
    @Param('id') conversationId: string,
    @Body('messageId') messageId: string,
    @Body() dto: GenerateMessageDto,
  ): Promise<RunResponseDto> {
    if (!messageId) throw errBadRequest('messageId 必填');
    return this.generation.generateFromMessage(conversationId, messageId, dto);
  }

  @Post('conversations/:id/ask')
  @ApiOperation({ summary: '追加用户消息并触发生成（一步完成）' })
  @ApiOkResponse({ type: RunResponseDto })
  async ask(
    @Param('id') conversationId: string,
    @Body() body: GenerateMessageDto & { content: string },
  ): Promise<{ userMessage: MessageResponseDto; run: RunResponseDto }> {
    if (!body.content?.trim()) throw errBadRequest('content 必填');
    return this.generation.ask(conversationId, body.content, body);
  }

  @Post('conversations/:id/messages/:messageId/regenerate')
  @ApiOperation({ summary: '编辑并重发：更新消息内容后重新入队生成' })
  @ApiOkResponse({ type: RunResponseDto })
  regenerate(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: EditMessageDto & Partial<GenerateMessageDto>,
  ): Promise<RunResponseDto> {
    return this.generation.regenerate(conversationId, messageId, body.content, body);
  }

  @Get('conversations/:id/runs')
  @ApiOperation({ summary: '会话生成任务列表' })
  @ApiOkResponse({ type: RunResponseDto, isArray: true })
  listRuns(
    @Param('id') conversationId: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ): Promise<Paginated<RunResponseDto>> {
    return this.generation.listRuns(conversationId, undefined, page, pageSize);
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: '生成任务状态查询' })
  @ApiOkResponse({ type: RunResponseDto })
  getRun(@Param('runId') runId: string): Promise<RunResponseDto> {
    return this.generation.getRun(runId);
  }

  @Delete('runs/:runId')
  @ApiOperation({ summary: '取消生成任务（协作式：worker 每段检查取消标记）' })
  @ApiOkResponse({ type: RunResponseDto })
  cancelRun(@Param('runId') runId: string): Promise<RunResponseDto> {
    return this.generation.cancel(runId);
  }
}
