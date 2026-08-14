import type { ModuleManifest } from '../../platform/module-manifest.js';

import { DataImportModule } from './data-import.module.js';

/** DataImport 模块注册描述（localStorage 数据导入，跨 5 类业务集合） */
export const dataImportManifest: ModuleManifest = {
  id: 'data-import',
  module: DataImportModule,
};
