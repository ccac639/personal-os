import { chatMessageIndexes, ChatMessageSchema } from './message.schema.js';
import { chatRunIndexes, ChatRunSchema } from './run.schema.js';
import { conversationIndexes, ConversationSchema } from './conversation.schema.js';

/** 注册 Chat 域全部索引（幂等，调用多次安全） */
export function registerChatIndexes(): void {
  conversationIndexes();
  chatMessageIndexes();
  chatRunIndexes();
}

export { ChatMessageSchema, ChatRunSchema, ConversationSchema };
