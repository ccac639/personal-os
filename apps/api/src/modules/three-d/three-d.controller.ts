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
  Put,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ThreeDService, AssetTreeNode } from './three-d.service.js';
import {
  CharacterDto,
  CreateAssetDto,
  CreateProjectDto,
  GenerationBriefDto,
  MoveAssetDto,
  ProjectQueryDto,
  ProjectResponseDto,
  StoryboardShotDto,
  UpdateAssetDto,
  UpdateProjectDto,
  WorldRegionDto,
} from './three-d.dto.js';
import { AssetNodeData } from './three-d.schema.js';
import { Paginated } from '../chat/chat.pagination.js';

/** 3D 项目路由（仅结构化元数据，任何二进制载荷都会被拒绝） */
@ApiTags('three-d')
@Controller('three-d')
export class ThreeDController {
  constructor(private readonly threeD: ThreeDService) {}

  // ---------- 项目 ----------

  @Post('projects')
  @ApiOperation({ summary: '创建 3D 项目（可按模板实例化）' })
  @ApiOkResponse({ type: ProjectResponseDto })
  create(@Body() dto: CreateProjectDto): Promise<ProjectResponseDto> {
    return this.threeD.create(dto);
  }

  @Get('projects')
  @ApiOperation({ summary: '项目列表' })
  @ApiOkResponse({ type: ProjectResponseDto, isArray: true })
  list(@Query() query: ProjectQueryDto): Promise<Paginated<ProjectResponseDto>> {
    return this.threeD.list(query);
  }

  @Get('templates')
  @ApiOperation({ summary: '项目模板列表' })
  @ApiOkResponse({ type: Object, isArray: true })
  templates(): unknown {
    return this.threeD.templates();
  }

  @Get('projects/:id')
  @ApiOperation({ summary: '项目详情' })
  @ApiOkResponse({ type: ProjectResponseDto })
  get(@Param('id') id: string): Promise<ProjectResponseDto> {
    return this.threeD.get(id);
  }

  @Patch('projects/:id')
  @ApiOperation({ summary: '更新项目（名称/描述/标签/收藏/归档）' })
  @ApiOkResponse({ type: ProjectResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto): Promise<ProjectResponseDto> {
    return this.threeD.update(id, dto);
  }

  @Delete('projects/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除项目' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.threeD.remove(id);
  }

  // ---------- 资产树 ----------

  @Get('projects/:id/tree')
  @ApiOperation({ summary: '资产树（扁平 + 嵌套）' })
  @ApiOkResponse({ type: Object })
  tree(@Param('id') id: string): Promise<{ assets: AssetNodeData[]; tree: AssetTreeNode[] }> {
    return this.threeD.getTree(id);
  }

  @Post('projects/:id/tree')
  @ApiOperation({ summary: '新增资产节点（父节点必须存在）' })
  @ApiOkResponse({ type: Object })
  addAsset(@Param('id') id: string, @Body() dto: CreateAssetDto): Promise<AssetNodeData> {
    return this.threeD.addAsset(id, dto);
  }

  @Patch('projects/:id/tree/:nodeId')
  @ApiOperation({ summary: '更新资产节点（名称/元数据）' })
  @ApiOkResponse({ type: Object })
  updateAsset(
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateAssetDto,
  ): Promise<AssetNodeData> {
    return this.threeD.updateAsset(id, nodeId, dto);
  }

  @Post('projects/:id/tree/:nodeId/move')
  @ApiOperation({ summary: '移动资产节点（检测循环引用）' })
  @ApiOkResponse({ type: Object })
  moveAsset(
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: MoveAssetDto,
  ): Promise<AssetNodeData> {
    return this.threeD.moveAsset(id, nodeId, dto);
  }

  @Delete('projects/:id/tree/:nodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除资产节点（存在子节点时拒绝）' })
  async removeAsset(@Param('id') id: string, @Param('nodeId') nodeId: string): Promise<void> {
    await this.threeD.removeAsset(id, nodeId);
  }

  // ---------- 角色 ----------

  @Post('projects/:id/characters')
  @ApiOperation({ summary: '新增角色配置' })
  @ApiOkResponse({ type: Object })
  addCharacter(@Param('id') id: string, @Body() dto: CharacterDto): Promise<unknown> {
    return this.threeD.addCharacter(id, dto);
  }

  @Patch('projects/:id/characters/:characterId')
  @ApiOperation({ summary: '更新角色配置' })
  @ApiOkResponse({ type: Object })
  updateCharacter(
    @Param('id') id: string,
    @Param('characterId') characterId: string,
    @Body() dto: CharacterDto,
  ): Promise<unknown> {
    return this.threeD.updateCharacter(id, characterId, dto);
  }

  @Delete('projects/:id/characters/:characterId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除角色配置' })
  async removeCharacter(
    @Param('id') id: string,
    @Param('characterId') characterId: string,
  ): Promise<void> {
    await this.threeD.removeCharacter(id, characterId);
  }

  // ---------- 世界区域 ----------

  @Post('projects/:id/regions')
  @ApiOperation({ summary: '新增世界区域' })
  @ApiOkResponse({ type: Object })
  addRegion(@Param('id') id: string, @Body() dto: WorldRegionDto): Promise<unknown> {
    return this.threeD.addRegion(id, dto);
  }

  @Patch('projects/:id/regions/:regionId')
  @ApiOperation({ summary: '更新世界区域' })
  @ApiOkResponse({ type: Object })
  updateRegion(
    @Param('id') id: string,
    @Param('regionId') regionId: string,
    @Body() dto: WorldRegionDto,
  ): Promise<unknown> {
    return this.threeD.updateRegion(id, regionId, dto);
  }

  @Delete('projects/:id/regions/:regionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除世界区域' })
  async removeRegion(@Param('id') id: string, @Param('regionId') regionId: string): Promise<void> {
    await this.threeD.removeRegion(id, regionId);
  }

  // ---------- 镜头分镜 ----------

  @Post('projects/:id/shots')
  @ApiOperation({ summary: '新增镜头分镜' })
  @ApiOkResponse({ type: Object })
  addShot(@Param('id') id: string, @Body() dto: StoryboardShotDto): Promise<unknown> {
    return this.threeD.addShot(id, dto);
  }

  @Patch('projects/:id/shots/:shotId')
  @ApiOperation({ summary: '更新镜头分镜' })
  @ApiOkResponse({ type: Object })
  updateShot(
    @Param('id') id: string,
    @Param('shotId') shotId: string,
    @Body() dto: StoryboardShotDto,
  ): Promise<unknown> {
    return this.threeD.updateShot(id, shotId, dto);
  }

  @Delete('projects/:id/shots/:shotId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除镜头分镜' })
  async removeShot(@Param('id') id: string, @Param('shotId') shotId: string): Promise<void> {
    await this.threeD.removeShot(id, shotId);
  }

  // ---------- 生成简报 ----------

  @Put('projects/:id/brief')
  @ApiOperation({ summary: '写入生成简报（仅文本提示词）' })
  @ApiOkResponse({ type: Object })
  upsertBrief(@Param('id') id: string, @Body() dto: GenerationBriefDto): Promise<unknown> {
    return this.threeD.upsertBrief(id, dto);
  }

  @Delete('projects/:id/brief')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '清除生成简报' })
  async clearBrief(@Param('id') id: string): Promise<void> {
    await this.threeD.clearBrief(id);
  }
}
