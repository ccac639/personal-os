import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AccountInputDto,
  ApiKeyCreateDto,
  ApiKeyUpdateDto,
  ChannelInputDto,
  CompositeRouteInputDto,
  GroupInputDto,
  SaveSub2ApiSettingsDto,
} from './dto/sub2api.dto.js';
import { Sub2ApiListQueryDto } from './dto/sub2api-query.dto.js';
import { Sub2ApiService } from './sub2api.service.js';

/**
 * Sub2API 管理模块路由（Web → Personal OS API → Sub2API）。
 *
 * 安全边界：
 * - 前端不直接持有 Sub2API 管理凭据，也不直接调用 Sub2API；
 * - Base URL / 凭据由 Personal OS 后端 Redis 保存，凭据不回显；
 * - 所有上游调用路径为适配器内部白名单（禁止代理任意 URL）；
 * - id 一律 ParseIntPipe 数字校验，杜绝路径注入。
 */
@ApiTags('sub2api')
@Controller('sub2api')
export class Sub2ApiController {
  constructor(private readonly sub2api: Sub2ApiService) {}

  // ---------- 设置 ----------

  @Get('settings')
  @ApiOperation({ summary: '查询 Sub2API 连接设置（凭据永不回显）' })
  getSettings() {
    return this.sub2api.getSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: '保存 Sub2API 连接设置（Base URL 校验协议/主机/路径）' })
  saveSettings(@Body() dto: SaveSub2ApiSettingsDto) {
    return this.sub2api.saveSettings(dto);
  }

  @Delete('settings')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '清除 Sub2API 全部连接设置（危险操作区）' })
  async clearSettings(): Promise<void> {
    await this.sub2api.clearSettings();
  }

  @Post('test')
  @ApiOperation({ summary: '连接测试：读取上游版本（未配置返回 400）' })
  testConnection() {
    return this.sub2api.testConnection();
  }

  // ---------- 概览 ----------

  @Get('overview')
  @ApiOperation({ summary: '概览聚合：版本/统计/实时指标/趋势/最近错误/模型与计数（分块降级）' })
  getOverview() {
    return this.sub2api.getOverview();
  }

  // ---------- 渠道 ----------

  @Get('channels')
  @ApiOperation({ summary: '渠道列表（分页 + 搜索/状态筛选）' })
  listChannels(@Query() query: Sub2ApiListQueryDto) {
    return this.sub2api.listChannels(query);
  }

  @Post('channels')
  @ApiOperation({ summary: '创建渠道' })
  createChannel(@Body() dto: ChannelInputDto) {
    return this.sub2api.createChannel(dto as unknown as Record<string, unknown>);
  }

  @Put('channels/:id')
  @ApiOperation({ summary: '更新渠道（含启用/禁用 status）' })
  updateChannel(@Param('id', ParseIntPipe) id: number, @Body() dto: ChannelInputDto) {
    return this.sub2api.updateChannel(id, dto as unknown as Record<string, unknown>);
  }

  @Delete('channels/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除渠道（前端二次确认）' })
  async deleteChannel(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.sub2api.deleteChannel(id);
  }

  // ---------- 账号（订阅账号） ----------

  @Get('accounts')
  @ApiOperation({ summary: '账号列表（分页 + 平台/状态/搜索筛选；凭据已脱敏）' })
  listAccounts(@Query() query: Sub2ApiListQueryDto) {
    return this.sub2api.listAccounts(query);
  }

  @Post('accounts')
  @ApiOperation({ summary: '创建账号（credentials 为平台凭据 JSON，后端不透传回前端）' })
  createAccount(@Body() dto: AccountInputDto) {
    return this.sub2api.createAccount(dto as unknown as Record<string, unknown>);
  }

  @Put('accounts/:id')
  @ApiOperation({ summary: '更新账号（含启用/禁用 status）' })
  updateAccount(@Param('id', ParseIntPipe) id: number, @Body() dto: AccountInputDto) {
    return this.sub2api.updateAccount(id, dto as unknown as Record<string, unknown>);
  }

  @Delete('accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除账号（前端二次确认）' })
  async deleteAccount(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.sub2api.deleteAccount(id);
  }

  @Post('accounts/:id/test')
  @ApiOperation({ summary: '账号连接测试（前端防重复提交）' })
  testAccount(@Param('id', ParseIntPipe) id: number) {
    return this.sub2api.testAccount(id);
  }

  // ---------- 订阅 ----------

  @Get('subscriptions')
  @ApiOperation({ summary: '订阅列表（分页 + 状态筛选）' })
  listSubscriptions(@Query() query: Sub2ApiListQueryDto) {
    return this.sub2api.listSubscriptions(query);
  }

  @Post('subscriptions/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '撤销订阅（前端二次确认）' })
  revokeSubscription(@Param('id', ParseIntPipe) id: number) {
    return this.sub2api.revokeSubscription(id);
  }

  // ---------- 模型分组 / 路由 ----------

  @Get('groups/all')
  @ApiOperation({ summary: '全部分组（含停用；模型路由视图使用）' })
  listAllGroups() {
    return this.sub2api.listAllGroups();
  }

  @Get('groups')
  @ApiOperation({ summary: '分组列表（分页 + 平台/状态/搜索筛选）' })
  listGroups(@Query() query: Sub2ApiListQueryDto) {
    return this.sub2api.listGroups(query);
  }

  @Post('groups')
  @ApiOperation({ summary: '创建模型分组' })
  createGroup(@Body() dto: GroupInputDto) {
    return this.sub2api.createGroup(dto as unknown as Record<string, unknown>);
  }

  @Put('groups/:id')
  @ApiOperation({ summary: '更新模型分组（含启用/禁用 status 与 model_routing）' })
  updateGroup(@Param('id', ParseIntPipe) id: number, @Body() dto: GroupInputDto) {
    return this.sub2api.updateGroup(id, dto as unknown as Record<string, unknown>);
  }

  @Delete('groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除模型分组（前端二次确认）' })
  async deleteGroup(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.sub2api.deleteGroup(id);
  }

  @Get('groups/:id/routes')
  @ApiOperation({ summary: '分组模型路由列表（对外模型 → 上游平台/模型）' })
  listCompositeRoutes(@Param('id', ParseIntPipe) id: number) {
    return this.sub2api.listCompositeRoutes(id);
  }

  @Post('groups/:id/routes')
  @ApiOperation({ summary: '创建模型路由' })
  createCompositeRoute(@Param('id', ParseIntPipe) id: number, @Body() dto: CompositeRouteInputDto) {
    return this.sub2api.createCompositeRoute(id, dto as unknown as Record<string, unknown>);
  }

  @Put('groups/:id/routes/:routeId')
  @ApiOperation({ summary: '更新模型路由' })
  updateCompositeRoute(
    @Param('id', ParseIntPipe) id: number,
    @Param('routeId', ParseIntPipe) routeId: number,
    @Body() dto: CompositeRouteInputDto,
  ) {
    return this.sub2api.updateCompositeRoute(
      id,
      routeId,
      dto as unknown as Record<string, unknown>,
    );
  }

  @Delete('groups/:id/routes/:routeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除模型路由（前端二次确认）' })
  async deleteCompositeRoute(
    @Param('id', ParseIntPipe) id: number,
    @Param('routeId', ParseIntPipe) routeId: number,
  ): Promise<void> {
    await this.sub2api.deleteCompositeRoute(id, routeId);
  }

  // ---------- API 凭据 ----------

  @Get('keys')
  @ApiOperation({ summary: 'API 凭据列表（key 一律掩码）' })
  listApiKeys(@Query() query: Sub2ApiListQueryDto) {
    return this.sub2api.listApiKeys(query);
  }

  @Post('keys')
  @ApiOperation({ summary: '创建 API 凭据（明文 key 仅本次响应返回一次）' })
  createApiKey(@Body() dto: ApiKeyCreateDto) {
    return this.sub2api.createApiKey(dto as unknown as Record<string, unknown>);
  }

  @Put('keys/:id')
  @ApiOperation({ summary: '更新 API 凭据（启用/禁用/改名/配额；响应 key 掩码）' })
  updateApiKey(@Param('id', ParseIntPipe) id: number, @Body() dto: ApiKeyUpdateDto) {
    return this.sub2api.updateApiKey(id, dto as unknown as Record<string, unknown>);
  }

  @Delete('keys/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '撤销 API 凭据（前端二次确认）' })
  async deleteApiKey(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.sub2api.deleteApiKey(id);
  }

  // ---------- 请求日志 ----------

  @Get('usage')
  @ApiOperation({ summary: '请求日志列表（分页 + 模型/日期筛选；不含 Prompt 与密钥）' })
  listUsage(@Query() query: Sub2ApiListQueryDto) {
    return this.sub2api.listUsage(query);
  }

  @Get('usage/stats')
  @ApiOperation({ summary: '请求日志统计（总量/Token/费用/平均延迟）' })
  getUsageStats(@Query() query: Sub2ApiListQueryDto) {
    return this.sub2api.getUsageStats(query);
  }
}
