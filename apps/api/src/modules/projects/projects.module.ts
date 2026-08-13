import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FocusModule } from '../focus/focus.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { ReleasesModule } from '../releases/releases.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { TaskName, TaskSchema } from '../tasks/tasks.schema.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectName, ProjectSchema } from './projects.schema.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectName, schema: ProjectSchema },
      { name: TaskName, schema: TaskSchema },
    ]),
    TasksModule,
    FocusModule,
    ReleasesModule,
    KnowledgeModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
