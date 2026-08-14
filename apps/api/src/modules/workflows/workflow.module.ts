/**
 * Workflows 模块：Schema 注册 / Store / Queue / Service / Controller
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  WORKFLOW_MODEL,
  WORKFLOW_RUN_MODEL,
  WorkflowRunSchema,
  WorkflowSchema,
} from './workflow.schema.js';
import { RUN_STORE, WORKFLOW_STORE, workflowStoreProviders } from './workflow.store.js';
import { RUN_QUEUE_PORT, BullMqRunQueue } from './workflow.queue.js';
import { WorkflowService } from './workflow.service.js';
import { WorkflowRunService } from './workflow-run.service.js';
import { RunsController, WorkflowsController } from './workflow.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WORKFLOW_MODEL, schema: WorkflowSchema },
      { name: WORKFLOW_RUN_MODEL, schema: WorkflowRunSchema },
    ]),
  ],
  controllers: [WorkflowsController, RunsController],
  providers: [
    ...workflowStoreProviders,
    { provide: RUN_QUEUE_PORT, useClass: BullMqRunQueue },
    WorkflowService,
    WorkflowRunService,
  ],
  exports: [WorkflowService, WorkflowRunService],
})
export class WorkflowsModule {
  // DI token 引用（保证 tree-shaking 不剔除类型）
  static readonly tokens = { WORKFLOW_STORE, RUN_STORE, RUN_QUEUE_PORT } as const;
}
