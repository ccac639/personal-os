import { Injectable } from '@nestjs/common';

import { AiSettingsService } from './ai-settings.service.js';
import {
  SiliconFlowClient,
  type ImageGenResult,
  type VideoStatusResult,
  type VideoSubmitResult,
} from './siliconflow.client.js';
import type {
  AiChatDto,
  AiSettingsResponseDto,
  ImageGenDto,
  TtsGenDto,
  VideoGenDto,
} from './dto/ai.dto.js';
import type { ChatResult } from './siliconflow.client.js';

/** AI 能力编排：先校验 key 已配置（Web 输入后可用），再调用 SiliconFlow */
@Injectable()
export class AiService {
  constructor(
    private readonly settings: AiSettingsService,
    private readonly client: SiliconFlowClient,
  ) {}

  async getSettings(): Promise<AiSettingsResponseDto> {
    return { configured: await this.settings.isConfigured() };
  }

  async saveSettings(apiKey: string): Promise<AiSettingsResponseDto> {
    await this.settings.saveKey(apiKey);
    return { configured: true };
  }

  async clearSettings(): Promise<AiSettingsResponseDto> {
    await this.settings.clearKey();
    return { configured: false };
  }

  async generateImage(dto: ImageGenDto): Promise<ImageGenResult> {
    const apiKey = await this.settings.assertConfigured();
    return this.client.generateImage(apiKey, dto);
  }

  async chat(dto: AiChatDto): Promise<ChatResult> {
    const apiKey = await this.settings.assertConfigured();
    return this.client.chat(apiKey, dto);
  }

  async submitVideo(dto: VideoGenDto): Promise<VideoSubmitResult> {
    const apiKey = await this.settings.assertConfigured();
    return this.client.submitVideo(apiKey, dto);
  }

  async getVideoStatus(requestId: string): Promise<VideoStatusResult> {
    const apiKey = await this.settings.assertConfigured();
    return this.client.getVideoStatus(apiKey, requestId);
  }

  async generateSpeech(dto: TtsGenDto): Promise<Buffer> {
    const apiKey = await this.settings.assertConfigured();
    return this.client.generateSpeech(apiKey, dto);
  }
}
