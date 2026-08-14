import { Module } from '@nestjs/common';

import { ArticlesController } from './articles.controller.js';
import { ArticlesService } from './articles.service.js';

/** articles 模块：只读镜像 Blog 内容层（无数据库依赖）。 */
@Module({
  controllers: [ArticlesController],
  providers: [ArticlesService],
})
export class ArticlesModule {}
