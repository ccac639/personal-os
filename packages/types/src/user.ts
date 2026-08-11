/** 用户基础类型 */
export interface User {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'user' | 'admin';
