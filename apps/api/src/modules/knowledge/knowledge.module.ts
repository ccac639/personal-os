import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeName, KnowledgeSchema } from './knowledge.schema.js';
import { KnowledgeService } from './knowledge.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: KnowledgeName, schema: KnowledgeSchema }])],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
