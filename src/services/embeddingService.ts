import { initLlama, LlamaContext } from 'llama.rn';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { EMBEDDING_MODEL } from '../constants/modelCatalog';
import { getModelFilePath } from './downloadManager';
import { getModelLocalPath } from '../storage/modelStorage';

class EmbeddingService {
  private activeContext: LlamaContext | null = null;
  private isLoading = false;

  public async isEmbeddingModelDownloaded(): Promise<boolean> {
    const savedPath = getModelLocalPath(EMBEDDING_MODEL.id);
    const targetPath = savedPath || getModelFilePath(EMBEDDING_MODEL.filename);
    return await RNFS.exists(targetPath);
  }

  public getEmbeddingModelPath(): string {
    const savedPath = getModelLocalPath(EMBEDDING_MODEL.id);
    return savedPath || getModelFilePath(EMBEDDING_MODEL.filename);
  }

  /**
   * Load the embedding context on demand.
   * Optimized with 512 context and mean pooling for minimal RAM.
   */
  public async getContext(): Promise<LlamaContext> {
    if (this.activeContext) {
      return this.activeContext;
    }

    if (this.isLoading) {
      // Wait for any concurrent loader
      while (this.isLoading) {
        await new Promise<void>(resolve => setTimeout(() => resolve(), 50));
      }
      if (this.activeContext) return this.activeContext;
    }

    const modelPath = this.getEmbeddingModelPath();
    const exists = await RNFS.exists(modelPath);
    if (!exists) {
      throw new Error(
        `Embedding model '${EMBEDDING_MODEL.name}' is not downloaded. Please download it from Settings or the Knowledge Base tab.`
      );
    }

    this.isLoading = true;
    try {
      console.log(`[EmbeddingService] Initializing embedding context from ${modelPath}`);
      const context = await initLlama({
        model: modelPath,
        n_ctx: 512,
        n_threads: 4,
        pooling_type: 'mean',
      });
      this.activeContext = context;
      return context;
    } catch (error) {
      console.error('[EmbeddingService] Failed to load embedding context:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Compute a 384-dimensional vector embedding for a snippet of text.
   */
  public async computeEmbedding(text: string): Promise<number[]> {
    const cleanText = text.trim();
    if (!cleanText) return [];

    const context = await this.getContext();
    try {
      const result = await context.embedding(cleanText);
      return result.embedding;
    } catch (error) {
      console.error('[EmbeddingService] Embedding computation error:', error);
      throw error;
    }
  }

  /**
   * Release context from memory when indexing finishes.
   */
  public async releaseContext(): Promise<void> {
    if (this.activeContext) {
      try {
        console.log('[EmbeddingService] Releasing embedding context to free RAM...');
        await this.activeContext.release();
      } catch (err) {
        console.warn('[EmbeddingService] Error releasing context:', err);
      }
      this.activeContext = null;
    }
  }

  /**
   * Calculate cosine similarity between two float vectors.
   */
  public cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
      return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      const a = vecA[i];
      const b = vecB[i];
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

export const embeddingService = new EmbeddingService();
