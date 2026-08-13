import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ProjectName, ProjectSchema } from '../projects/projects.schema.js';
import { TasksController } from './tasks.controller.js';
import { TaskName, TaskSchema } from './tasks.schema.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaskName, schema: TaskSchema },
      { name: ProjectName, schema: ProjectSchema },
    ]),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
