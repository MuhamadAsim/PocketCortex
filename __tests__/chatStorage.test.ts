import {
  getChatMessages,
  saveChatMessages,
  appendChatMessage,
  updateChatMessageContent,
  clearChatMessages,
} from '../src/storage/chatStorage';
import { ChatMessage } from '../src/types/models';

// In-memory mock for MMKV
const store: Record<string, string> = {};

jest.mock('../src/storage/mmkv', () => ({
  storage: {
    getString: jest.fn((key: string) => store[key] || null),
    set: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    remove: jest.fn((key: string) => {
      delete store[key];
    }),
  },
  STORAGE_KEYS: {
    CHAT_HISTORY_PREFIX: 'chat.history.',
  },
}));

describe('chatStorage', () => {
  const modelId = 'qwen-2.5-0.5b';

  beforeEach(() => {
    clearChatMessages(modelId);
  });

  it('appends and loads messages preserving roles', () => {
    const userMsg: ChatMessage = {
      id: `user-123`,
      role: 'user',
      content: 'Hello AI',
      timestamp: 1000,
    };
    appendChatMessage(modelId, userMsg);

    const assistantMsg: ChatMessage = {
      id: `assistant-456`,
      role: 'assistant',
      content: 'Hello human',
      timestamp: 1001,
    };
    appendChatMessage(modelId, assistantMsg);

    const loaded = getChatMessages(modelId);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].role).toBe('user');
    expect(loaded[0].content).toBe('Hello AI');
    expect(loaded[1].role).toBe('assistant');
    expect(loaded[1].content).toBe('Hello human');
  });

  it('updates message content by exact message ID', () => {
    const assistantMsg: ChatMessage = {
      id: `assistant-1`,
      role: 'assistant',
      content: 'Partial...',
      timestamp: 1000,
    };
    appendChatMessage(modelId, assistantMsg);

    updateChatMessageContent(modelId, 'assistant-1', 'Full completed response!');

    const loaded = getChatMessages(modelId);
    expect(loaded[0].content).toBe('Full completed response!');
    expect(loaded[0].role).toBe('assistant');
  });

  it('auto-heals previously corrupted roles based on ID prefixes', () => {
    // Simulate previously saved conversation where assistant had role: 'user'
    const corruptedConversation = {
      modelId,
      messages: [
        {
          id: 'user-100',
          role: 'user',
          content: 'Why is the sky blue?',
          timestamp: 1000,
        },
        {
          id: 'assistant-101',
          role: 'user', // corrupted by old updateLastChatMessage bug
          content: 'Rayleigh scattering.',
          timestamp: 1001,
        },
      ],
      updatedAt: 1002,
    };

    store[`chat.history.${modelId}`] = JSON.stringify(corruptedConversation);

    const healed = getChatMessages(modelId);
    expect(healed[0].role).toBe('user');
    expect(healed[1].role).toBe('assistant'); // Auto-healed!
  });
});
