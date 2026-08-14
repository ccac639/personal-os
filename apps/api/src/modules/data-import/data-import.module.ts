import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  FocusPlanName,
  FocusPlanSchema,
  FocusSessionName,
  FocusSessionSchema,
  WeeklyGoalName,
  WeeklyGoalSchema,
} from '../focus/focus.schema.js';
import { KnowledgeName, KnowledgeSchema } from '../knowledge/knowledge.schema.js';
import { ProjectName, ProjectSchema } from '../projects/projects.schema.js';
import {
  MilestoneName,
  MilestoneSchema,
  ReleaseName,
  ReleaseSchema,
} from '../releases/releases.schema.js';
import { TaskName, TaskSchema } from '../tasks/tasks.schema.js';
import { DataImportController } from './data-import.controller.js';
import { DataImportService } from './data-import.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectName, schema: ProjectSchema },
      { name: TaskName, schema: TaskSchema },
      { name: MilestoneName, schema: MilestoneSchema },
      { name: ReleaseName, schema: ReleaseSchema },
      { name: KnowledgeName, schema: KnowledgeSchema },
      { name: FocusPlanName, schema: FocusPlanSchema },
      { name: FocusSessionName, schema: FocusSessionSchema },
      { name: WeeklyGoalName, schema: WeeklyGoalSchema },
    ]),
  ],
  controllers: [DataImportController],
  providers: [DataImportService],
  exports: [DataImportService],
})
export class DataImportModule {}
