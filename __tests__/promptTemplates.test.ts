import { formatChatPrompt, DEFAULT_SYSTEM_PROMPT } from '../src/utils/promptTemplates';
import { ChatMessage } from '../src/types/models';

describe('formatChatPrompt', () => {
  const singleUserMsg: ChatMessage[] = [
    {
      id: '1',
      role: 'user',
      content: 'Hello, what is 2+2?',
      timestamp: 1000,
    },
  ];

  const multiTurnMsgs: ChatMessage[] = [
    {
      id: '1',
      role: 'user',
      content: 'What is the capital of France?',
      timestamp: 1000,
    },
    {
      id: '2',
      role: 'assistant',
      content: 'The capital of France is Paris.',
      timestamp: 1001,
    },
    {
      id: '3',
      role: 'user',
      content: 'What is its population?',
      timestamp: 1002,
    },
  ];

  describe('ChatML Template (Qwen 2.5)', () => {
    it('formats a single user message with default system prompt', () => {
      const prompt = formatChatPrompt(singleUserMsg, 'chatml');
      expect(prompt).toContain(`<|im_start|>system\n${DEFAULT_SYSTEM_PROMPT}<|im_end|>\n`);
      expect(prompt).toContain('<|im_start|>user\nHello, what is 2+2?<|im_end|>\n');
      expect(prompt.endsWith('<|im_start|>assistant\n')).toBe(true);
    });

    it('uses custom system prompt when provided', () => {
      const prompt = formatChatPrompt(singleUserMsg, 'chatml', 'Custom AI instruction.');
      expect(prompt).toContain('<|im_start|>system\nCustom AI instruction.<|im_end|>\n');
    });

    it('formats multi-turn conversation properly', () => {
      const prompt = formatChatPrompt(multiTurnMsgs, 'chatml');
      expect(prompt).toContain('<|im_start|>user\nWhat is the capital of France?<|im_end|>\n');
      expect(prompt).toContain(
        '<|im_start|>assistant\nThe capital of France is Paris.<|im_end|>\n'
      );
      expect(prompt).toContain('<|im_start|>user\nWhat is its population?<|im_end|>\n');
      expect(prompt.endsWith('<|im_start|>assistant\n')).toBe(true);
    });
  });

  describe('Llama 3 Template (Llama 3.2)', () => {
    it('formats with begin_of_text and header tags', () => {
      const prompt = formatChatPrompt(singleUserMsg, 'llama3');
      expect(prompt.startsWith('<|begin_of_text|>')).toBe(true);
      expect(prompt).toContain('<|start_header_id|>system<|end_header_id|>\n\n');
      expect(prompt).toContain('<|start_header_id|>user<|end_header_id|>\n\nHello, what is 2+2?<|eot_id|>');
      expect(prompt.endsWith('<|start_header_id|>assistant<|end_header_id|>\n\n')).toBe(true);
    });

    it('formats multi-turn conversation properly', () => {
      const prompt = formatChatPrompt(multiTurnMsgs, 'llama3');
      expect(prompt).toContain(
        '<|start_header_id|>assistant<|end_header_id|>\n\nThe capital of France is Paris.<|eot_id|>'
      );
      expect(prompt.endsWith('<|start_header_id|>assistant<|end_header_id|>\n\n')).toBe(true);
    });
  });

  describe('Gemma Template (Gemma 3)', () => {
    it('prepends system prompt to the first user turn', () => {
      const prompt = formatChatPrompt(singleUserMsg, 'gemma', 'Act as a tutor.');
      expect(prompt).toContain('<start_of_turn>user\nAct as a tutor.\n\nHello, what is 2+2?<end_of_turn>\n');
      expect(prompt.endsWith('<start_of_turn>model\n')).toBe(true);
    });

    it('formats multi-turn conversation with model tags', () => {
      const prompt = formatChatPrompt(multiTurnMsgs, 'gemma');
      expect(prompt).toContain(
        '<start_of_turn>model\nThe capital of France is Paris.<end_of_turn>\n'
      );
      expect(prompt).toContain('<start_of_turn>user\nWhat is its population?<end_of_turn>\n');
      expect(prompt.endsWith('<start_of_turn>model\n')).toBe(true);
    });
  });
});
