import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from 'nestjs-pino';

import { configuration } from './config/configuration.js';
import { AiModule } from './modules/ai/ai.module.js';
import { WorkflowsModule } from './modules/workflows/workflow.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { AgentsModule } from './modules/agents/agents.module.js';
import { InspirationsModule } from './modules/inspiration/inspiration.module.js';
import { ThreeDModule } from './modules/three-d/three-d.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // pnpm workspace：dev 时 cwd 为 apps/api，需显式回退到仓库根 .env
      envFilePath: ['.env', '../../.env'],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
        },
      },
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongodb.uri'),
      }),
    }),
    // 业务模块：workflows（本分支注册；平台基座保持自包含）
    WorkflowsModule,
    // 平台级 AI 能力（SiliconFlow）：key 管理 + 对话/生图/视频/TTS 端点（@Global，自含 Redis）
    AiModule,
    // Chat 内容域：会话/消息/生成任务 + 智能体 + 灵感库 + 3D 项目
    ChatModule,
    AgentsModule,
    InspirationsModule,
    ThreeDModule,
  ],
})
export class AppModule {}
