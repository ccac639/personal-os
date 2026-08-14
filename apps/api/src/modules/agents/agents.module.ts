import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { Agent, AgentSchema, agentIndexes } from './agent.schema.js';
import { ChatModule } from '../chat/chat.module.js';

agentIndexes();

@Module({
  imports: [MongooseModule.forFeature([{ name: Agent.name, schema: AgentSchema }]), ChatModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
