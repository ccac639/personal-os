/** 认证相关基础类型 */
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
}
