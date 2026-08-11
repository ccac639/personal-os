/** Agent 基础类型 */
export interface Agent {
  id: string;
  name: string;
  description?: string;
  model: string;
  provider: AgentProvider;
  systemPrompt?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AgentProvider = 'openai' | 'anthropic' | 'google' | 'openrouter';

export type AgentStatus = 'idle' | 'running' | 'error' | 'disabled';
