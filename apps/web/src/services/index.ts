import { ofetch } from 'ofetch';

/**
 * API 客户端（ofetch 单例）
 * 开发环境通过 VITE_API_URL 指向 NestJS API；未配置时走同源 /api。
 */
export const apiFetch = ofetch.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 15_000,
});

/** WebSocket 网关地址（socket.io） */
export function getSocketUrl(): string {
  return import.meta.env.VITE_WS_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
}
