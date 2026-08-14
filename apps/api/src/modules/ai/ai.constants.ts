/** SiliconFlow 接入常量（官方文档 docs.siliconflow.cn，Base https://api.siliconflow.cn/v1） */

/** API Key 在 Redis 中的键名（worker 侧 ChatWorker 读取同一键） */
export const SILICONFLOW_API_KEY_REDIS_KEY = 'siliconflow:api_key';

/** Key 有效期：30 天（Web 输入后写入，过期需重新输入） */
export const SILICONFLOW_KEY_TTL_SECONDS = 60 * 60 * 24 * 30;

export const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';

/** 四类能力的默认模型（模型广场可查；Web 端可覆盖） */
export const AI_DEFAULTS = {
  chatModel: 'Qwen/Qwen2.5-72B-Instruct',
  imageModel: 'Kwai-Kolors/Kolors',
  videoModel: 'Wan-AI/Wan2.2-T2V-A14B',
  ttsModel: 'fnlp/MOSS-TTSD-v0.5',
  /** 官方示例音色 */
  ttsVoice: 'fnlp/MOSS-TTSD-v0.5:alex',
  imageSize: '1024x1024',
  videoSize: '1280x720',
} as const;

/** 生图参数上限（与官方 API 对齐） */
export const IMAGE_LIMITS = {
  PROMPT_MAX: 2_000,
  BATCH_MAX: 4,
  STEPS_MAX: 50,
} as const;

export const VIDEO_LIMITS = {
  PROMPT_MAX: 2_000,
} as const;

export const TTS_LIMITS = {
  INPUT_MAX: 2_000,
} as const;
