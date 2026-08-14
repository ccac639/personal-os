import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ThreeDController } from './three-d.controller.js';
import { ThreeDService } from './three-d.service.js';
import { ThreeDProject, ThreeDProjectSchema, threeDIndexes } from './three-d.schema.js';

threeDIndexes();

@Module({
  imports: [MongooseModule.forFeature([{ name: ThreeDProject.name, schema: ThreeDProjectSchema }])],
  controllers: [ThreeDController],
  providers: [ThreeDService],
  exports: [ThreeDService],
})
export class ThreeDModule {}
