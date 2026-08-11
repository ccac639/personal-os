/** 文档基础类型 */
export interface Document {
  id: string;
  ownerId: string;
  title: string;
  content?: string;
  mimeType: string;
  size: number;
  storageKey: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
