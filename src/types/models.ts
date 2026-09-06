export type ChatTemplateType = 'chatml' | 'llama3' | 'gemma';

export interface ModelDefinition {
  id: string;
  name: string;
  repo: string;
  filename: string;
  sizeBytes: number;
  description: string;
  downloadUrl: string;
  quantLabel: string;
  parameters: string;
  chatTemplate: ChatTemplateType;
  stopTokens: string[];
}

export type DownloadStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'paused'
  | 'downloaded'
  | 'error';

export interface ModelDownloadState {
  modelId: string;
  status: DownloadStatus;
  bytesDownloaded: number;
  totalBytes: number;
  localPath?: string;
  jobId?: number;
  error?: string;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ConversationHistory {
  modelId: string;
  messages: ChatMessage[];
  updatedAt: number;
}
