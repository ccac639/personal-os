import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { FocusController } from './focus.controller.js';
import {
  FocusPlanName,
  FocusPlanSchema,
  FocusSessionName,
  FocusSessionSchema,
  WeeklyGoalName,
  WeeklyGoalSchema,
} from './focus.schema.js';
import { FocusService } from './focus.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FocusPlanName, schema: FocusPlanSchema },
      { name: FocusSessionName, schema: FocusSessionSchema },
      { name: WeeklyGoalName, schema: WeeklyGoalSchema },
    ]),
  ],
  controllers: [FocusController],
  providers: [FocusService],
  exports: [FocusService],
})
export class FocusModule {}
