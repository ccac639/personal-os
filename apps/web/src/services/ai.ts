import { apiFetch } from './index';

/** SiliconFlow 设置状态（key 本身永不回传前端） */
export interface AiSettingsStatus {
  configured: boolean;
}

export interface ImageGenParams {
  prompt: string;
  model?: string;
  imageSize?: string;
  batchSize?: number;
  numInferenceSteps?: number;
  guidanceScale?: number;
}

export interface ImageGenResult {
  url: string;
  model: string;
}

export interface VideoSubmitParams {
  prompt: string;
  model?: string;
  imageSize?: string;
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

export interface TtsParams {
  input: string;
  model?: string;
  voice?: string;
  responseFormat?: string;
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatParams {
  messages: ChatTurn[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  model: string;
}

/** AI 能力客户端（SiliconFlow） */
export const aiApi = {
  async getSettings(): Promise<AiSettingsStatus> {
    return apiFetch<AiSettingsStatus>('/ai/settings');
  },
  async saveSettings(apiKey: string): Promise<AiSettingsStatus> {
    return apiFetch<AiSettingsStatus>('/ai/settings', { method: 'PUT', body: { apiKey } });
  },
  async clearSettings(): Promise<void> {
    await apiFetch('/ai/settings', { method: 'DELETE' });
  },
  async chat(params: ChatParams): Promise<ChatResult> {
    return apiFetch<ChatResult>('/ai/chat', { method: 'POST', body: params });
  },
  async generateImage(params: ImageGenParams): Promise<ImageGenResult> {
    return apiFetch<ImageGenResult>('/ai/images', { method: 'POST', body: params });
  },
  async submitVideo(params: VideoSubmitParams): Promise<VideoSubmitResult> {
    return apiFetch<VideoSubmitResult>('/ai/videos', { method: 'POST', body: params });
  },
  async getVideoStatus(requestId: string): Promise<VideoStatusResult> {
    return apiFetch<VideoStatusResult>(`/ai/videos/${encodeURIComponent(requestId)}`);
  },
  /** TTS：返回音频 Blob（后端直接回二进制流；apiFetch 类型锁定 json，用原生 fetch） */
  async tts(params: TtsParams): Promise<Blob> {
    const base = import.meta.env.VITE_API_URL ?? '/api';
    const res = await fetch(`${base}/ai/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      let message = `TTS 失败（HTTP ${res.status}）`;
      try {
        const payload = (await res.json()) as { message?: string };
        if (payload.message) message = payload.message;
      } catch {
        // 非 JSON 错误体：保留状态码描述
      }
      throw new Error(message);
    }
    return res.blob();
  },
};
