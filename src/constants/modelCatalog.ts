import { ModelDefinition } from '../types/models';

export const MODEL_CATALOG: ModelDefinition[] = [
  {
    id: 'qwen-2.5-1.5b-instruct',
    name: 'Qwen2.5 1.5B Instruct',
    repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    filename: 'qwen2.5-1.5b-instruct-q5_k_m.gguf',
    sizeBytes: 1285494304,
    downloadUrl:
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q5_k_m.gguf',
    description:
      'Alibaba Cloud compact multilingual model with strong general reasoning, coding, and conversational capabilities.',
    quantLabel: 'Q5_K_M',
    parameters: '1.54B',
    chatTemplate: 'chatml',
    stopTokens: ['<|im_end|>', '<|endoftext|>'],
  },
  {
    id: 'llama-3.2-1b-instruct',
    name: 'Llama 3.2 1B Instruct',
    repo: 'bartowski/Llama-3.2-1B-Instruct-GGUF',
    filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sizeBytes: 807694464,
    downloadUrl:
      'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    description:
      'Meta AI edge model optimized for low-latency dialogue, summarization, and offline personal assistant tasks.',
    quantLabel: 'Q4_K_M',
    parameters: '1.24B',
    chatTemplate: 'llama3',
    stopTokens: ['<|eot_id|>', '<|end_of_text|>'],
  },
  {
    id: 'gemma-3-1b-instruct',
    name: 'Gemma 3 1B Instruct',
    repo: 'lm-kit/gemma-3-1b-instruct-gguf',
    filename: 'gemma-3-it-1B-Q4_K_M.gguf',
    sizeBytes: 806058336,
    downloadUrl:
      'https://huggingface.co/lm-kit/gemma-3-1b-instruct-gguf/resolve/main/gemma-3-it-1B-Q4_K_M.gguf',
    description:
      'Google lightweight model built from Gemini technology, delivering fast mobile inference and instruction precision.',
    quantLabel: 'Q4_K_M',
    parameters: '1.0B',
    chatTemplate: 'gemma',
    stopTokens: ['<end_of_turn>', '<eos>'],
  },
  {
    id: 'moondream-2-vision',
    name: 'Moondream 2 (Vision)',
    repo: 'moondream/moondream2-gguf',
    filename: 'moondream2-text-model-f16.gguf',
    sizeBytes: 2839534976,
    downloadUrl:
      'https://huggingface.co/moondream/moondream2-gguf/resolve/main/moondream2-text-model-f16.gguf',
    description:
      'Ultra-compact mobile vision model capable of visual Q&A, scene description, reading receipts, and image analysis.',
    quantLabel: 'F16',
    parameters: '1.86B',
    chatTemplate: 'moondream',
    stopTokens: ['<|endoftext|>', '\n\nQuestion:', 'Question:'],
    isMultimodal: true,
    mmprojFilename: 'moondream2-mmproj-f16.gguf',
    mmprojUrl:
      'https://huggingface.co/moondream/moondream2-gguf/resolve/main/moondream2-mmproj-f16.gguf',
    mmprojSizeBytes: 909777984,
  },
];

export const EMBEDDING_MODEL: ModelDefinition = {
  id: 'all-minilm-l6-v2',
  name: 'All-MiniLM-L6-v2 (Embedding)',
  repo: 'leliuga/all-MiniLM-L6-v2-GGUF',
  filename: 'all-MiniLM-L6-v2.Q4_K_M.gguf',
  sizeBytes: 24117248,
  downloadUrl:
    'https://huggingface.co/leliuga/all-MiniLM-L6-v2-GGUF/resolve/main/all-MiniLM-L6-v2.Q4_K_M.gguf',
  description:
    'Ultra-fast semantic embedding model used for local vector search and Hybrid RAG.',
  quantLabel: 'Q4_K_M',
  parameters: '22M',
  chatTemplate: 'chatml',
  stopTokens: [],
  isEmbeddingModel: true,
};

export function getModelById(id: string): ModelDefinition | undefined {
  return MODEL_CATALOG.find(model => model.id === id);
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
