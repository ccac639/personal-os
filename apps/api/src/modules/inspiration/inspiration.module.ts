import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { InspirationsController } from './inspiration.controller.js';
import { InspirationsService } from './inspiration.service.js';
import { Inspiration, InspirationSchema, inspirationIndexes } from './inspiration.schema.js';
import { ChatModule } from '../chat/chat.module.js';

inspirationIndexes();

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Inspiration.name, schema: InspirationSchema }]),
    ChatModule,
  ],
  controllers: [InspirationsController],
  providers: [InspirationsService],
  exports: [InspirationsService],
})
export class InspirationsModule {}
