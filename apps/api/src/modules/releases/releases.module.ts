import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ProjectName, ProjectSchema } from '../projects/projects.schema.js';
import { MilestonesController } from './milestones.controller.js';
import { MilestoneName, MilestoneSchema, ReleaseName, ReleaseSchema } from './releases.schema.js';
import { ReleasesController } from './releases.controller.js';
import { ReleasesService } from './releases.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReleaseName, schema: ReleaseSchema },
      { name: MilestoneName, schema: MilestoneSchema },
      { name: ProjectName, schema: ProjectSchema },
    ]),
  ],
  controllers: [ReleasesController, MilestonesController],
  providers: [ReleasesService],
  exports: [ReleasesService],
})
export class ReleasesModule {}
