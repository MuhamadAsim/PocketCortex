import { chunkText } from '../src/services/knowledgeService';
import { embeddingService } from '../src/services/embeddingService';
import {
  formatRAGSystemPrompt,
  formatChatPrompt,
  DEFAULT_SYSTEM_PROMPT,
} from '../src/utils/promptTemplates';
import { GroundedSource, ChatMessage } from '../src/types/models';

jest.mock('@dr.pogodin/react-native-fs', () => ({
  exists: jest.fn(),
  readFile: jest.fn(),
  DocumentDirectoryPath: '/mock/dir',
}));

jest.mock('react-native-document-picker', () => ({
  pickSingle: jest.fn(),
  isCancel: jest.fn(),
  types: {
    plainText: 'text/plain',
    allFiles: '*/*',
    images: 'image/*',
  },
}));

jest.mock('../src/storage/mmkv', () => ({
  storage: {
    getString: jest.fn(() => null),
    set: jest.fn(),
    remove: jest.fn(),
  },
  STORAGE_KEYS: {
    THEME_MODE: 'settings.theme_mode',
    SELECTED_MODEL_ID: 'models.selected_model_id',
    MODEL_STATE_PREFIX: 'models.state.',
    CHAT_HISTORY_PREFIX: 'chat.history.',
  },
  getThemePreference: jest.fn(() => 'dark'),
  setThemePreference: jest.fn(),
  getSelectedModelId: jest.fn(() => null),
  setSelectedModelId: jest.fn(),
  getModelDownloadState: jest.fn(() => null),
  saveModelDownloadState: jest.fn(),
}));

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(async () => ({ rows: [] })),
    executeSync: jest.fn(() => ({ rows: [] })),
  })),
}));

jest.mock('llama.rn', () => ({
  initLlama: jest.fn(),
}));

describe('Knowledge RAG & Multimodal Utilities', () => {
  describe('chunkText', () => {
    it('returns a single chunk if text is smaller than chunkSize', () => {
      const text = 'This is a short document with only a few words.';
      const chunks = chunkText(text, 100, 20);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe(text);
    });

    it('splits text into multiple chunks with correct overlap', () => {
      // Create a 25-word sentence
      const words = Array.from({ length: 25 }, (_, i) => `word${i + 1}`);
      const text = words.join(' ');

      // chunkSize = 10 words, overlap = 3 words
      const chunks = chunkText(text, 10, 3);
      expect(chunks.length).toBeGreaterThan(1);

      // Verify overlap: last 3 words of chunk 0 should be first 3 words of chunk 1
      const words0 = chunks[0].split(' ');
      const words1 = chunks[1].split(' ');
      expect(words0.slice(-3)).toEqual(words1.slice(0, 3));
    });

    it('handles empty or whitespace-only text gracefully', () => {
      expect(chunkText('')).toEqual([]);
      expect(chunkText('   \n\n  \t  ')).toEqual([]);
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1.0 for identical vectors', () => {
      const vec = [0.1, 0.5, -0.3, 0.8];
      const similarity = embeddingService.cosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('returns 0.0 for orthogonal vectors', () => {
      const vecA = [1.0, 0.0];
      const vecB = [0.0, 1.0];
      const similarity = embeddingService.cosineSimilarity(vecA, vecB);
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it('returns -1.0 for exact opposite vectors', () => {
      const vecA = [1.0, 2.0, 3.0];
      const vecB = [-1.0, -2.0, -3.0];
      const similarity = embeddingService.cosineSimilarity(vecA, vecB);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('returns 0 for mismatched lengths or empty vectors', () => {
      expect(embeddingService.cosineSimilarity([], [])).toBe(0);
      expect(embeddingService.cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });
  });

  describe('formatRAGSystemPrompt', () => {
    it('returns base prompt unchanged when no sources are provided', () => {
      const res = formatRAGSystemPrompt('Default instruction', []);
      expect(res).toBe('Default instruction');
    });

    it('formats document excerpts with numbered citations', () => {
      const sources: GroundedSource[] = [
        {
          docId: 'doc1',
          docName: 'Relativity.txt',
          chunkIndex: 0,
          excerpt: 'Einstein published special relativity in 1905.',
        },
        {
          docId: 'doc2',
          docName: 'Physics.md',
          chunkIndex: 3,
          excerpt: 'E = mc^2 explains mass-energy equivalence.',
        },
      ];

      const res = formatRAGSystemPrompt(DEFAULT_SYSTEM_PROMPT, sources);
      expect(res).toContain('--- RELEVANT KNOWLEDGE EXCERPTS ---');
      expect(res).toContain('[Source 1: Relativity.txt]');
      expect(res).toContain('Einstein published special relativity in 1905.');
      expect(res).toContain('[Source 2: Physics.md]');
      expect(res).toContain('E = mc^2 explains mass-energy equivalence.');
      expect(res).toContain('[Source 1], [Source 2]');
    });
  });

  describe('Moondream formatChatPrompt', () => {
    it('formats user messages into Moondream question-answer syntax', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'What is written on this sign?',
          timestamp: 1000,
        },
      ];

      const prompt = formatChatPrompt(messages, 'moondream');
      expect(prompt).toContain('Question: What is written on this sign?\n\nAnswer:');
    });
  });
});
