/**
 * Chat 功能域统一出口
 */
export { default as ChatSidebar } from './components/chat-sidebar.vue';
export { default as ChatModelList } from './components/chat-model-list.vue';
export { default as ChatMessageList } from './components/chat-message-list.vue';
export { default as ChatComposer } from './components/chat-composer.vue';
export { default as ChatPanel } from './components/chat-panel.vue';
export { default as ChatToast } from './components/chat-toast.vue';

export { useChatStore } from './store';
export { MockChatReplyService, getChatReplyService, setChatReplyService } from './service';
export type { ChatReplyService, GenerateReplyOptions } from './service';
export { dispatchChatAction, setChatActionHandler } from './actions';
export type { ChatActionHandler } from './actions';
export { pushToast } from './toast';
export {
  CHAT_MODELS,
  MODEL_CATEGORIES,
  MODE_CATEGORY,
  modelById,
  modelLabel,
  modeCategory,
  recommendedModelForMode,
  suggestionsForCategory,
  suggestionsForDisplay,
} from './models';
export {
  BUILTIN_SYSTEM_PROMPTS,
  allSystemPromptPresets,
  createCustomPreset,
  isBuiltinPrompt,
  promptPresetName,
  removeCustomPreset,
  systemPromptPresetById,
} from './presets';
export {
  CONTEXT_DANGER_RATIO,
  CONTEXT_WARN_RATIO,
  budgetInfo,
  contextLimitOf,
  estimateSessionTokens,
  estimateTokens,
} from './budget';
export {
  downloadTextFile,
  messageToMarkdown,
  sanitizeFilename,
  sessionToJson,
  sessionToMarkdown,
} from './export';
export {
  ALLOWED_IMAGE_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE,
  formatFileSize,
  reorderAttachments,
  validateDraftFiles,
} from './draft';
export { normalizeTitle } from './utils';
export type {
  ChatActionKind,
  ChatAttachmentDraft,
  ChatDraftValidationError,
  ChatMessage,
  ChatModelCategory,
  ChatModelOption,
  ChatOutputMode,
  ChatPreferences,
  ChatQuote,
  ChatReplyLength,
  ChatResultAction,
  ChatSession,
  ChatSessionStats,
  ChatSessionSystemPrompt,
  ChatSessionTimeFilter,
  ChatSuggestion,
  ChatSystemPromptPreset,
} from './types';
