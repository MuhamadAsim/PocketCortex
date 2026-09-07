import { ChatMessage, ChatTemplateType, GroundedSource } from '../types/models';

export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful, respectful, and concise AI assistant running fully on-device.';

/**
 * Builds a grounded system prompt injecting RAG document excerpts and citation instructions.
 */
export function formatRAGSystemPrompt(
  baseSystemPrompt: string = DEFAULT_SYSTEM_PROMPT,
  sources: GroundedSource[]
): string {
  if (!sources || sources.length === 0) return baseSystemPrompt;
  const excerpts = sources
    .map(
      (s, idx) =>
        `[Source ${idx + 1}: ${s.docName}]\n${s.excerpt.trim()}`
    )
    .join('\n\n');

  return `${baseSystemPrompt}\n\n--- RELEVANT KNOWLEDGE EXCERPTS ---\nUse the following excerpts to answer the question accurately. If referencing these excerpts, cite them as [Source 1], [Source 2], etc.\n\n${excerpts}\n-----------------------------------`;
}

/**
 * Formats an array of chat messages into a raw prompt string according to the
 * model's required chat template.
 */
export function formatChatPrompt(
  messages: ChatMessage[],
  template: ChatTemplateType,
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT
): string {
  switch (template) {
    case 'chatml':
      return formatChatML(messages, systemPrompt);
    case 'llama3':
      return formatLlama3(messages, systemPrompt);
    case 'gemma':
      return formatGemma(messages, systemPrompt);
    case 'moondream':
      return formatMoondream(messages, systemPrompt);
    default:
      return formatChatML(messages, systemPrompt);
  }
}

/**
 * ChatML format (Qwen 2.5, Yi, etc.)
 *
 * <|im_start|>system
 * {system_prompt}<|im_end|>
 * <|im_start|>user
 * {user_message}<|im_end|>
 * <|im_start|>assistant
 * {assistant_message}<|im_end|>
 * <|im_start|>assistant
 */
function formatChatML(messages: ChatMessage[], defaultSystem: string): string {
  let prompt = '';

  const explicitSystem = messages.find(m => m.role === 'system');
  const systemContent = explicitSystem ? explicitSystem.content : defaultSystem;

  if (systemContent.trim()) {
    prompt += `<|im_start|>system\n${systemContent.trim()}<|im_end|>\n`;
  }

  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const role = msg.role === 'user' ? 'user' : 'assistant';
    prompt += `<|im_start|>${role}\n${msg.content.trim()}<|im_end|>\n`;
  }

  // Generation prompt suffix
  prompt += '<|im_start|>assistant\n';
  return prompt;
}

/**
 * Llama 3 format (Llama 3.1, Llama 3.2, etc.)
 *
 * <|begin_of_text|><|start_header_id|>system<|end_header_id|>
 *
 * {system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>
 *
 * {user_message}<|eot_id|><|start_header_id|>assistant<|end_header_id|>
 *
 * {assistant_message}<|eot_id|><|start_header_id|>assistant<|end_header_id|>
 *
 */
function formatLlama3(messages: ChatMessage[], defaultSystem: string): string {
  let prompt = '<|begin_of_text|>';

  const explicitSystem = messages.find(m => m.role === 'system');
  const systemContent = explicitSystem ? explicitSystem.content : defaultSystem;

  if (systemContent.trim()) {
    prompt += `<|start_header_id|>system<|end_header_id|>\n\n${systemContent.trim()}<|eot_id|>`;
  }

  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const role = msg.role === 'user' ? 'user' : 'assistant';
    prompt += `<|start_header_id|>${role}<|end_header_id|>\n\n${msg.content.trim()}<|eot_id|>`;
  }

  // Generation prompt suffix
  prompt += '<|start_header_id|>assistant<|end_header_id|>\n\n';
  return prompt;
}

/**
 * Gemma format (Gemma 2, Gemma 3)
 *
 * <start_of_turn>user
 * {system_prompt_prepended}\n\n{user_message}<end_of_turn>
 * <start_of_turn>model
 * {model_message}<end_of_turn>
 * <start_of_turn>model
 */
function formatGemma(messages: ChatMessage[], defaultSystem: string): string {
  let prompt = '';

  const explicitSystem = messages.find(m => m.role === 'system');
  const systemContent = explicitSystem ? explicitSystem.content : defaultSystem;

  let isFirstUser = true;

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      let content = msg.content.trim();
      if (isFirstUser && systemContent.trim()) {
        content = `${systemContent.trim()}\n\n${content}`;
        isFirstUser = false;
      }
      prompt += `<start_of_turn>user\n${content}<end_of_turn>\n`;
    } else {
      prompt += `<start_of_turn>model\n${msg.content.trim()}<end_of_turn>\n`;
    }
  }

  // If there were no user messages yet, still format turn
  if (isFirstUser && systemContent.trim()) {
    prompt += `<start_of_turn>user\n${systemContent.trim()}<end_of_turn>\n`;
  }

  // Generation prompt suffix
  prompt += '<start_of_turn>model\n';
  return prompt;
}

/**
 * Moondream vision format
 *
 * \n\nQuestion: {user_message}\n\nAnswer:
 */
function formatMoondream(messages: ChatMessage[], defaultSystem: string): string {
  let prompt = '';
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user') {
      prompt += `\n\nQuestion: ${msg.content.trim()}\n\nAnswer:`;
    } else {
      prompt += ` ${msg.content.trim()}`;
    }
  }
  if (!prompt.endsWith('Answer:')) {
    prompt += '\n\nAnswer:';
  }
  return prompt;
}

