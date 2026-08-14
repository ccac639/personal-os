import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ChatController } from './chat.controller.js';
import { ChatJobQueue, BullChatJobQueue } from './chat-job-queue.js';
import { ConversationsService } from './conversations.service.js';
import { MessagesService } from './messages.service.js';
import { GenerationService } from './generation.service.js';
import { ChatMessage, ChatMessageSchema } from './schemas/message.schema.js';
import { ChatRun, ChatRunSchema } from './schemas/run.schema.js';
import { Conversation, ConversationSchema } from './schemas/conversation.schema.js';
import { registerChatIndexes } from './schemas/chat-indexes.js';

// 模块加载时注册索引（幂等）；生产环境由 Mongo 自动构建
registerChatIndexes();

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: ChatRun.name, schema: ChatRunSchema },
    ]),
  ],
  controllers: [ChatController],
  providers: [
    ConversationsService,
    MessagesService,
    GenerationService,
    { provide: ChatJobQueue, useClass: BullChatJobQueue },
  ],
  exports: [ConversationsService, MessagesService, GenerationService, ChatJobQueue],
})
export class ChatModule {}
