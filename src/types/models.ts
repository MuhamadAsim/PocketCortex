export type ChatTemplateType = 'chatml' | 'llama3' | 'gemma' | 'moondream';

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
  isMultimodal?: boolean;
  mmprojUrl?: string;
  mmprojFilename?: string;
  mmprojSizeBytes?: number;
  isEmbeddingModel?: boolean;
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

export interface GroundedSource {
  docId: string;
  docName: string;
  chunkIndex: number;
  excerpt: string;
  score?: number;
}

export interface AttachedDocumentInfo {
  name: string;
  size: number;
  snippet?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  imageUri?: string;
  sources?: GroundedSource[];
  attachedDocument?: AttachedDocumentInfo;
}

export interface ConversationHistory {
  modelId: string;
  messages: ChatMessage[];
  updatedAt: number;
}
