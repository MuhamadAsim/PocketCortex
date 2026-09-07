import {
  initLlama,
  LlamaContext,
  NativeCompletionResultTimings,
} from 'llama.rn';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { ChatMessage, ModelDefinition } from '../types/models';
import { getModelById, MODEL_CATALOG } from '../constants/modelCatalog';
import { getModelLocalPath } from '../storage/modelStorage';
import { formatChatPrompt, DEFAULT_SYSTEM_PROMPT } from '../utils/promptTemplates';
import { getModelFilePath } from './downloadManager';

export interface LlamaServiceState {
  activeModelId: string | null;
  isLoading: boolean;
  loadProgress: number; // 0 to 100
  isGenerating: boolean;
  error: string | null;
}

export interface GenerateCompletionParams {
  modelId?: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  onToken?: (token: string) => void;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopTokens?: string[];
}

export interface GenerateCompletionResult {
  text: string;
  timings?: NativeCompletionResultTimings;
}

type StateListener = (state: LlamaServiceState) => void;

class LlamaService {
  private activeContext: LlamaContext | null = null;
  private state: LlamaServiceState = {
    activeModelId: null,
    isLoading: false,
    loadProgress: 0,
    isGenerating: false,
    error: null,
  };
  private listeners: Set<StateListener> = new Set();

  /**
   * Subscribe to state updates (loading status, progress, generation status).
   * Returns an unsubscribe callback.
   */
  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): LlamaServiceState {
    return { ...this.state };
  }

  private updateState(partial: Partial<LlamaServiceState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (err) {
        console.error('[LlamaService] Error in state listener:', err);
      }
    });
  }

  public isModelLoaded(modelId?: string): boolean {
    if (!this.activeContext || !this.state.activeModelId) {
      return false;
    }
    if (modelId) {
      return this.state.activeModelId === modelId;
    }
    return true;
  }

  public getActiveModelId(): string | null {
    return this.state.activeModelId;
  }

  public getActiveContext(): LlamaContext | null {
    return this.activeContext;
  }

  /**
   * Load a GGUF model into memory using llama.rn.
   * If another model is already loaded, it will be cleanly released first.
   */
  public async loadModel(
    modelId: string,
    onProgress?: (progressPercent: number) => void
  ): Promise<LlamaContext> {
    // If the requested model is already active, return the existing context
    if (this.activeContext && this.state.activeModelId === modelId) {
      return this.activeContext;
    }

    const model = getModelById(modelId);
    if (!model) {
      const err = `Model '${modelId}' not found in catalog.`;
      this.updateState({ error: err });
      throw new Error(err);
    }

    // Locate the local GGUF file
    let filePath = getModelLocalPath(modelId);
    if (!filePath) {
      filePath = getModelFilePath(model.filename);
    }

    const fileExists = await RNFS.exists(filePath);
    if (!fileExists) {
      const err = `Model file for '${model.name}' not found on device at ${filePath}. Please download it first.`;
      this.updateState({ error: err });
      throw new Error(err);
    }

    // Release any currently loaded model context
    if (this.activeContext) {
      await this.unloadModel();
    }

    this.updateState({
      activeModelId: modelId,
      isLoading: true,
      loadProgress: 0,
      error: null,
    });

    try {
      console.log(`[LlamaService] Initializing model context from: ${filePath}`);

      const context = await initLlama(
        {
          model: filePath,
          n_ctx: 2048,
          n_threads: 4,
          flash_attn_type: 'auto',
          use_progress_callback: true,
        },
        (progress: number) => {
          const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));
          this.updateState({ loadProgress: percent });
          onProgress?.(percent);
        }
      );

      this.activeContext = context;
      this.updateState({
        isLoading: false,
        loadProgress: 100,
        error: null,
      });

      console.log(`[LlamaService] Model '${model.name}' successfully loaded into memory.`);
      return context;
    } catch (error: any) {
      console.error(`[LlamaService] Failed to load model '${model.name}':`, error);
      const errorMessage = error?.message || 'Failed to initialize model context';
      this.activeContext = null;
      this.updateState({
        activeModelId: null,
        isLoading: false,
        loadProgress: 0,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Unload the current model from memory and release native context resources.
   */
  public async unloadModel(): Promise<void> {
    if (this.state.isGenerating) {
      await this.stopGeneration();
    }

    if (this.activeContext) {
      try {
        console.log(`[LlamaService] Releasing context for model '${this.state.activeModelId}'...`);
        await this.activeContext.release();
      } catch (err) {
        console.warn('[LlamaService] Error releasing active context:', err);
      }
      this.activeContext = null;
    }

    this.updateState({
      activeModelId: null,
      isLoading: false,
      loadProgress: 0,
      isGenerating: false,
      error: null,
    });
  }

  /**
   * Generate completion with streaming token callback.
   */
  public async generateCompletion(
    params: GenerateCompletionParams
  ): Promise<GenerateCompletionResult> {
    const targetModelId = params.modelId || this.state.activeModelId;

    if (!targetModelId) {
      throw new Error('No model specified and no model is currently active.');
    }

    const model = getModelById(targetModelId);
    if (!model) {
      throw new Error(`Model '${targetModelId}' not found in catalog.`);
    }

    // Ensure model is loaded
    let context = this.activeContext;
    if (!context || this.state.activeModelId !== targetModelId) {
      context = await this.loadModel(targetModelId);
    }

    const formattedPrompt = formatChatPrompt(
      params.messages,
      model.chatTemplate,
      params.systemPrompt || DEFAULT_SYSTEM_PROMPT
    );

    const stopTokens = Array.from(
      new Set([...model.stopTokens, ...(params.stopTokens || [])])
    );

    this.updateState({ isGenerating: true, error: null });

    let accumulatedText = '';

    try {
      const result = await context.completion(
        {
          prompt: formattedPrompt,
          n_predict: params.maxTokens ?? 1024,
          temperature: params.temperature ?? 0.7,
          top_p: params.topP ?? 0.9,
          stop: stopTokens,
        },
        tokenData => {
          accumulatedText += tokenData.token;
          params.onToken?.(tokenData.token);
        }
      );

      this.updateState({ isGenerating: false });

      return {
        text: result.text || accumulatedText,
        timings: result.timings,
      };
    } catch (error: any) {
      this.updateState({ isGenerating: false });
      // If stopped intentionally, return whatever was accumulated
      if (error?.message?.includes('aborted') || error?.message?.includes('stop')) {
        return { text: accumulatedText };
      }
      console.error('[LlamaService] Inference error:', error);
      throw error;
    }
  }

  /**
   * Stop an ongoing text generation.
   */
  public async stopGeneration(): Promise<void> {
    if (this.activeContext && this.state.isGenerating) {
      try {
        console.log('[LlamaService] Stopping completion...');
        await this.activeContext.stopCompletion();
      } catch (err) {
        console.warn('[LlamaService] Error stopping completion:', err);
      } finally {
        this.updateState({ isGenerating: false });
      }
    }
  }
}

export const llamaService = new LlamaService();

// Export convenience functions
export const loadModel = (
  modelId: string,
  onProgress?: (progressPercent: number) => void
) => llamaService.loadModel(modelId, onProgress);

export const unloadModel = () => llamaService.unloadModel();

export const generateCompletion = (params: GenerateCompletionParams) =>
  llamaService.generateCompletion(params);

export const stopGeneration = () => llamaService.stopGeneration();

export const isModelLoaded = (modelId?: string) =>
  llamaService.isModelLoaded(modelId);

export const getActiveModelId = () => llamaService.getActiveModelId();

export const getLlamaState = () => llamaService.getState();

export const subscribeLlamaState = (listener: StateListener) =>
  llamaService.subscribe(listener);
