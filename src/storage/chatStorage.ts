import { ChatMessage, ConversationHistory } from '../types/models';
import { storage, STORAGE_KEYS } from './mmkv';

function getChatKey(modelId: string): string {
  return `${STORAGE_KEYS.CHAT_HISTORY_PREFIX}${modelId}`;
}

export function getChatMessages(modelId: string): ChatMessage[] {
  try {
    const raw = storage.getString(getChatKey(modelId));
    if (!raw) return [];
    const conversation = JSON.parse(raw) as ConversationHistory;
    const messages = conversation.messages || [];

    // Auto-heal messages that had their role misattributed in previous versions
    return messages.map(msg => {
      let role = msg.role;
      if (msg.id && msg.id.startsWith('assistant-')) {
        role = 'assistant';
      } else if (msg.id && msg.id.startsWith('user-')) {
        role = 'user';
      }
      return {
        ...msg,
        role,
      };
    });
  } catch (error) {
    console.error(`Failed to load chat messages for ${modelId}:`, error);
    return [];
  }
}

export function saveChatMessages(
  modelId: string,
  messages: ChatMessage[]
): void {
  try {
    const conversation: ConversationHistory = {
      modelId,
      messages,
      updatedAt: Date.now(),
    };
    storage.set(getChatKey(modelId), JSON.stringify(conversation));
  } catch (error) {
    console.error(`Failed to save chat messages for ${modelId}:`, error);
  }
}

export function appendChatMessage(
  modelId: string,
  message: ChatMessage
): ChatMessage[] {
  const current = getChatMessages(modelId);
  const updated = [...current, message];
  saveChatMessages(modelId, updated);
  return updated;
}

export function updateChatMessageContent(
  modelId: string,
  messageId: string,
  content: string
): ChatMessage[] {
  const current = getChatMessages(modelId);
  const targetIndex = current.findIndex(m => m.id === messageId);
  if (targetIndex === -1) {
    return current;
  }

  const updated = [...current];
  updated[targetIndex] = {
    ...updated[targetIndex],
    content,
    timestamp: Date.now(),
  };

  saveChatMessages(modelId, updated);
  return updated;
}

export function updateLastChatMessage(
  modelId: string,
  content: string
): ChatMessage[] {
  const current = getChatMessages(modelId);
  if (current.length === 0) return current;

  const updated = [...current];
  const lastIndex = updated.length - 1;
  updated[lastIndex] = {
    ...updated[lastIndex],
    content,
    timestamp: Date.now(),
  };

  saveChatMessages(modelId, updated);
  return updated;
}

export function clearChatMessages(modelId: string): void {
  storage.remove(getChatKey(modelId));
}

