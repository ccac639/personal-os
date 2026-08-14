import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { AI_DEFAULTS, IMAGE_LIMITS, TTS_LIMITS, VIDEO_LIMITS } from '../ai.constants.js';

export class SaveAiSettingsDto {
  @ApiProperty({
    description: 'SiliconFlow API Key（sk-...），仅写入 Redis，不回显',
    example: 'sk-xxx',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  apiKey!: string;
}

export class AiSettingsResponseDto {
  @ApiProperty({ description: '是否已配置（key 存在且未过期）' })
  configured!: boolean;
}

export class ImageGenDto {
  @ApiProperty({ description: '图像描述提示词' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(IMAGE_LIMITS.PROMPT_MAX)
  prompt!: string;

  @ApiPropertyOptional({ description: '模型', default: AI_DEFAULTS.imageModel })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional({ description: '图像尺寸', default: AI_DEFAULTS.imageSize })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  imageSize?: string;

  @ApiPropertyOptional({ description: '批量生成数量', default: 1, maximum: IMAGE_LIMITS.BATCH_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(IMAGE_LIMITS.BATCH_MAX)
  batchSize?: number;

  @ApiPropertyOptional({ description: '推理步数', default: 20, maximum: IMAGE_LIMITS.STEPS_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(IMAGE_LIMITS.STEPS_MAX)
  numInferenceSteps?: number;

  @ApiPropertyOptional({ description: '引导系数（提示词遵循度）', default: 7.5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(20)
  guidanceScale?: number;
}

export class ImageGenResponseDto {
  @ApiProperty({ description: '生成图片 URL（1 小时有效，请尽快下载）' })
  url!: string;

  @ApiProperty()
  model!: string;
}

export class VideoGenDto {
  @ApiProperty({ description: '视频描述提示词' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(VIDEO_LIMITS.PROMPT_MAX)
  prompt!: string;

  @ApiPropertyOptional({ description: '模型', default: AI_DEFAULTS.videoModel })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional({ description: '视频尺寸', default: AI_DEFAULTS.videoSize })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  imageSize?: string;
}

export class VideoSubmitResponseDto {
  @ApiProperty({ description: '视频任务 requestId（用于轮询状态）' })
  requestId!: string;

  @ApiProperty()
  model!: string;
}

export class VideoStatusResponseDto {
  @ApiProperty({ enum: ['Succeed', 'InProgress', 'InQueue', 'Failed', 'Unknown'] })
  status!: string;

  @ApiPropertyOptional({ description: '视频 URL（Succeed 后 10 分钟有效，请尽快下载）' })
  url?: string;

  @ApiPropertyOptional({ description: '失败原因' })
  reason?: string;
}

export class TtsGenDto {
  @ApiProperty({ description: '待合成语音的文本' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(TTS_LIMITS.INPUT_MAX)
  input!: string;

  @ApiPropertyOptional({ description: '模型', default: AI_DEFAULTS.ttsModel })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional({ description: '音色', default: AI_DEFAULTS.ttsVoice })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  voice?: string;

  @ApiPropertyOptional({
    description: '音频格式',
    enum: ['mp3', 'wav', 'pcm', 'opus'],
    default: 'mp3',
  })
  @IsOptional()
  @IsIn(['mp3', 'wav', 'pcm', 'opus'])
  responseFormat?: string;
}

export class ChatMessageDto {
  @ApiProperty({ enum: ['system', 'user', 'assistant'] })
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @ApiProperty()
  @IsString()
  @MaxLength(20_000)
  content!: string;
}

export class AiChatDto {
  @ApiProperty({ description: '对话消息列表（末条为 user）', type: ChatMessageDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @ApiPropertyOptional({ description: '模型', default: AI_DEFAULTS.chatModel })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional({ description: '采样温度', default: 0.7 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ description: '输出上限（字符）', default: 500, maximum: 2_000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_000)
  maxTokens?: number;
}

export class AiChatResponseDto {
  @ApiProperty({ description: '助手回复文本' })
  content!: string;

  @ApiProperty()
  model!: string;
}
