import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 连接设置（部分更新；apiToken 传空串 = 不修改） */
export class SaveSub2ApiSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_048, { message: 'Base URL 过长' })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512, { message: '管理端凭据过长' })
  apiToken?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'timeoutMs 必须是整数' })
  @Min(1_000, { message: '请求超时最小 1000ms' })
  @Max(60_000, { message: '请求超时最大 60000ms' })
  timeoutMs?: number;

  @IsOptional()
  @IsBoolean()
  autoRefresh?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'refreshIntervalSec 必须是整数' })
  @Min(10, { message: '自动刷新间隔最小 10 秒' })
  @Max(3_600, { message: '自动刷新间隔最大 3600 秒' })
  refreshIntervalSec?: number;
}

const ACCOUNT_PLATFORMS = ['anthropic', 'openai', 'gemini', 'antigravity', 'grok'] as const;
const ACCOUNT_TYPES = [
  'oauth',
  'setup-token',
  'apikey',
  'upstream',
  'bedrock',
  'service_account',
] as const;
const ROUTE_ENDPOINTS = [
  'any',
  'messages',
  'count_tokens',
  'responses',
  'chat_completions',
  'embeddings',
  'images',
  'gemini',
] as const;

/** 渠道创建 / 更新（字段名与上游契约一致：snake_case） */
export class ChannelInputDto {
  @IsString()
  @MaxLength(128, { message: '渠道名称过长' })
  name: string = '';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'], { message: 'status 仅支持 active / disabled' })
  status?: string;

  @IsOptional()
  @IsInt({ each: true, message: 'group_ids 必须为整数数组' })
  group_ids?: number[];

  @IsOptional()
  @IsBoolean()
  restrict_models?: boolean;

  @IsOptional()
  @IsObject()
  model_mapping?: Record<string, Record<string, string>>;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  billing_model_source?: string;
}

/** 账号（订阅账号）创建 / 更新 */
export class AccountInputDto {
  @IsString()
  @MaxLength(128, { message: '账号名称过长' })
  name: string = '';

  @IsIn(ACCOUNT_PLATFORMS as unknown as string[], { message: 'platform 不合法' })
  platform: string = 'anthropic';

  @IsOptional()
  @IsIn(ACCOUNT_TYPES as unknown as string[], { message: 'type 不合法' })
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  notes?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'], { message: 'status 仅支持 active / inactive' })
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ each: true })
  group_ids?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priority?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  concurrency?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000)
  rate_multiplier?: number;

  /** 平台凭据（anthropic access_token / openai api_key 等），自由 JSON 对象 */
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;
}

/** 模型分组创建 / 更新 */
export class GroupInputDto {
  @IsString()
  @MaxLength(128, { message: '分组名称过长' })
  name: string = '';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsIn([...ACCOUNT_PLATFORMS, 'composite'] as unknown as string[], { message: 'platform 不合法' })
  platform?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'], { message: 'status 仅支持 active / inactive' })
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  rate_multiplier?: number;

  @IsOptional()
  @IsBoolean()
  is_exclusive?: boolean;

  @IsOptional()
  @IsIn(['standard', 'subscription'], { message: 'subscription_type 不合法' })
  subscription_type?: string;

  @IsOptional()
  @IsObject()
  model_routing?: Record<string, number[]>;

  @IsOptional()
  @IsBoolean()
  model_routing_enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sort_order?: number;
}

/** 模型路由（对外模型 → 上游平台/模型）创建 / 更新 */
export class CompositeRouteInputDto {
  @IsString()
  @MaxLength(256, { message: '对外模型名过长' })
  public_model: string = '';

  @IsOptional()
  @IsIn(['exact', 'prefix'], { message: 'match_type 仅支持 exact / prefix' })
  match_type?: string;

  @IsIn([...ACCOUNT_PLATFORMS] as unknown as string[], { message: 'target_platform 不合法' })
  target_platform: string = 'anthropic';

  @IsOptional()
  @IsString()
  @MaxLength(256)
  upstream_model?: string;

  @IsOptional()
  @IsIn(ROUTE_ENDPOINTS as unknown as string[], { message: 'endpoint 不合法' })
  endpoint?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  notes?: string;
}

/** API 凭据创建（明文 key 仅创建响应返回一次） */
export class ApiKeyCreateDto {
  @IsString()
  @MaxLength(128, { message: '凭据名称过长' })
  name: string = '';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  group_id?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  custom_key?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quota?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3_650)
  expires_in_days?: number;

  @IsOptional()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ip_whitelist?: string[];

  @IsOptional()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ip_blacklist?: string[];
}

/** API 凭据更新（状态启用/禁用、改名、改分组、改配额） */
export class ApiKeyUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  group_id?: number | null;

  @IsOptional()
  @IsIn(['active', 'inactive'], { message: 'status 仅支持 active / inactive' })
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quota?: number;
}
