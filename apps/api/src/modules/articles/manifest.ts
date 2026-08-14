import type { ModuleManifest } from '../../platform/module-manifest.js';

import { ArticlesModule } from './articles.module.js';

/** articles 模块注册描述（只读镜像 Blog 内容层，无依赖）。 */
export const articlesManifest: ModuleManifest = {
  id: 'articles',
  module: ArticlesModule,
};
