import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

import { AiService } from './ai.service.js';
import {
  AiChatDto,
  AiChatResponseDto,
  AiSettingsResponseDto,
  ImageGenDto,
  ImageGenResponseDto,
  SaveAiSettingsDto,
  TtsGenDto,
  VideoGenDto,
  VideoStatusResponseDto,
  VideoSubmitResponseDto,
} from './dto/ai.dto.js';

/** AI 能力路由：设置（key 管理）+ 生图 / 视频 / 语音（SiliconFlow） */
@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  // ---------- 设置（API Key 由 Web 输入，存 Redis） ----------

  @Get('settings')
  @ApiOperation({ summary: '查询 SiliconFlow 是否已配置（key 不回显）' })
  @ApiOkResponse({ type: AiSettingsResponseDto })
  getSettings(): Promise<AiSettingsResponseDto> {
    return this.ai.getSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: '保存 SiliconFlow API Key（Redis，TTL 30 天）' })
  @ApiOkResponse({ type: AiSettingsResponseDto })
  saveSettings(@Body() dto: SaveAiSettingsDto): Promise<AiSettingsResponseDto> {
    return this.ai.saveSettings(dto.apiKey);
  }

  @Delete('settings')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '清除 SiliconFlow API Key' })
  async clearSettings(): Promise<void> {
    await this.ai.clearSettings();
  }

  // ---------- 对话（AI 工作台同步对话；/chat 队列链路走 worker 适配器） ----------

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '对话补全（非流式；key 未配置时返回 400）' })
  @ApiOkResponse({ type: AiChatResponseDto })
  chat(@Body() dto: AiChatDto): Promise<AiChatResponseDto> {
    return this.ai.chat(dto);
  }

  // ---------- 生图 ----------

  @Post('images')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '文生图（图片 URL 1 小时有效，请尽快下载）' })
  @ApiOkResponse({ type: ImageGenResponseDto })
  generateImage(@Body() dto: ImageGenDto): Promise<ImageGenResponseDto> {
    return this.ai.generateImage(dto);
  }

  // ---------- 视频（submit + 轮询 status） ----------

  @Post('videos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交文生视频任务，返回 requestId 用于轮询' })
  @ApiOkResponse({ type: VideoSubmitResponseDto })
  submitVideo(@Body() dto: VideoGenDto): Promise<VideoSubmitResponseDto> {
    return this.ai.submitVideo(dto);
  }

  @Get('videos/:requestId')
  @ApiOperation({ summary: '查询视频生成状态（Succeed 后 URL 10 分钟有效）' })
  @ApiOkResponse({ type: VideoStatusResponseDto })
  getVideoStatus(@Param('requestId') requestId: string): Promise<VideoStatusResponseDto> {
    return this.ai.getVideoStatus(requestId);
  }

  // ---------- 语音（TTS，返回音频二进制） ----------

  @Post('tts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '文本转语音，返回音频二进制流' })
  async generateSpeech(@Body() dto: TtsGenDto, @Res() reply: FastifyReply): Promise<void> {
    const buffer = await this.ai.generateSpeech(dto);
    const format = dto.responseFormat ?? 'mp3';
    const mime =
      format === 'wav'
        ? 'audio/wav'
        : format === 'pcm'
          ? 'audio/pcm'
          : format === 'opus'
            ? 'audio/opus'
            : 'audio/mpeg';
    void reply.header('Content-Type', mime);
    void reply.header('Content-Length', String(buffer.length));
    void reply.header('Cache-Control', 'no-store');
    void reply.status(HttpStatus.OK);
    await reply.send(buffer);
  }
}
