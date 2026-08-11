import { z } from 'zod';

/** 基础 Zod Schema 集合：id / email / slug 等通用校验 */
export const idSchema = z.string().min(1).max(64);
export const emailSchema = z.string().email();
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
