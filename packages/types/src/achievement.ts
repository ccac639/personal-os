/** 成果 / Achievement 基础类型 */
export interface Achievement {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  kind: AchievementKind;
  projectId?: string;
  links: string[];
  files: string[];
  createdAt: string;
  updatedAt: string;
}

export type AchievementKind = 'project' | 'article' | 'talk' | 'award' | 'open-source' | 'other';
