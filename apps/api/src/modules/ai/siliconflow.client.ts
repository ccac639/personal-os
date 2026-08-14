import { Inject, Injectable } from '@nestjs/common';

import { AI_DEFAULTS, SILICONFLOW_BASE_URL } from './ai.constants.js';
import { errProvider, errProviderUnavailable } from './ai.errors.js';
import type { AiChatDto, ImageGenDto, TtsGenDto, VideoGenDto } from './dto/ai.dto.js';

/** fetch 实现注入点（测试替换为 fake） */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export const SILICONFLOW_FETCH = Symbol('SILICONFLOW_FETCH');

export interface ImageGenResult {
  url: string;
  model: string;
}

export interface ChatResult {
  content: string;
  model: string;
}

export interface VideoSubmitResult {
  requestId: string;
  model: string;
}

export interface VideoStatusResult {
  status: 'Succeed' | 'InProgress' | 'InQueue' | 'Failed' | 'Unknown';
  url?: string;
  reason?: string;
}

interface TraceableResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * SiliconFlow REST 客户端（生图 / 视频 / TTS），OpenAI 兼容端点。
 * 对话走 worker 侧 OpenAI 兼容适配器，不经此客户端。
 */
@Injectable()
export class SiliconFlowClient {
  constructor(@Inject(SILICONFLOW_FETCH) private readonly fetchImpl: FetchLike) {}

  /** 对话：POST /chat/completions（OpenAI 兼容，非流式；AI 工作台对话 Tab 使用） */
  async chat(apiKey: string, dto: AiChatDto): Promise<ChatResult> {
    const model = dto.model ?? AI_DEFAULTS.chatModel;
    const data = (await this.request(apiKey, '/chat/completions', {
      model,
      messages: dto.messages,
      temperature: dto.temperature ?? 0.7,
      max_tokens: Math.min(dto.maxTokens ?? 500, 2_000),
      stream: false,
    })) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string')
      throw errProvider(200, 'SiliconFlow 返回缺少 choices[0].message.content');
    return { content, model };
  }

  /** 生图：POST /images/generations → { images: [{ url }] } */
  async generateImage(apiKey: string, dto: ImageGenDto): Promise<ImageGenResult> {
    const body: Record<string, unknown> = {
      model: dto.model ?? AI_DEFAULTS.imageModel,
      prompt: dto.prompt,
      image_size: dto.imageSize ?? AI_DEFAULTS.imageSize,
    };
    if (dto.batchSize !== undefined) body.batch_size = dto.batchSize;
    if (dto.numInferenceSteps !== undefined) body.num_inference_steps = dto.numInferenceSteps;
    if (dto.guidanceScale !== undefined) body.guidance_scale = dto.guidanceScale;

    const data = await this.request(apiKey, '/images/generations', body);
    const images = (data as { images?: Array<{ url?: string }> }).images;
    const url = images?.[0]?.url;
    if (!url) throw errProvider(200, 'SiliconFlow 返回缺少 images[0].url');
    return { url, model: body.model as string };
  }

  /** 提交视频任务：POST /video/submit → { requestId } */
  async submitVideo(apiKey: string, dto: VideoGenDto): Promise<VideoSubmitResult> {
    const body: Record<string, unknown> = {
      model: dto.model ?? AI_DEFAULTS.videoModel,
      prompt: dto.prompt,
      image_size: dto.imageSize ?? AI_DEFAULTS.videoSize,
    };
    const data = await this.request(apiKey, '/video/submit', body);
    const requestId = (data as { requestId?: string }).requestId;
    if (!requestId) throw errProvider(200, 'SiliconFlow 返回缺少 requestId');
    return { requestId, model: body.model as string };
  }

  /** 查询视频任务：POST /video/status body { requestId } */
  async getVideoStatus(apiKey: string, requestId: string): Promise<VideoStatusResult> {
    const data = (await this.request(apiKey, '/video/status', { requestId })) as {
      status?: string;
      results?: { videos?: Array<{ url?: string }> };
      reason?: string;
    };
    const status = data.status ?? 'Unknown';
    const url = data.results?.videos?.[0]?.url;
    return { status: status as VideoStatusResult['status'], url, reason: data.reason };
  }

  /** TTS：POST /audio/speech → 音频二进制 */
  async generateSpeech(apiKey: string, dto: TtsGenDto): Promise<Buffer> {
    const body: Record<string, unknown> = {
      model: dto.model ?? AI_DEFAULTS.ttsModel,
      input: dto.input,
      voice: dto.voice ?? AI_DEFAULTS.ttsVoice,
      response_format: dto.responseFormat ?? 'mp3',
    };
    const response = await this.raw(apiKey, '/audio/speech', body);
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  }

  /** JSON 请求 + 统一错误透传 */
  private async request(
    apiKey: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.raw(apiKey, path, body);
    return response.json();
  }

  private async raw(
    apiKey: string,
    path: string,
    body: Record<string, unknown>,
  ): Promise<TraceableResponse> {
    let response: TraceableResponse;
    try {
      response = (await this.fetchImpl(`${SILICONFLOW_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })) as TraceableResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : '网络错误';
      throw errProviderUnavailable(`SiliconFlow 请求失败: ${message}`);
    }

    if (!response.ok) {
      const traceId = response.headers.get('x-siliconcloud-trace-id') ?? undefined;
      let message = `SiliconFlow HTTP ${response.status}`;
      try {
        const payload = (await response.json()) as { error?: { message?: string } };
        if (payload.error?.message) message = payload.error.message;
      } catch {
        // 非 JSON 错误体：保留状态码描述
      }
      throw errProvider(response.status, message, traceId);
    }
    return response;
  }
}
