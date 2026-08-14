import type { ModuleManifest } from '../../platform/module-manifest.js';

import { ChatModule } from './chat.module.js';

/** Chat 模块注册描述（会话/消息/生成任务；投递前经 AiSettingsService 校验 key） */
export const chatManifest: ModuleManifest = {
  id: 'chat',
  module: ChatModule,
  dependsOn: ['ai'],
};
