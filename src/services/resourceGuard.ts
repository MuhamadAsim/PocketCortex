import { llamaService } from './llamaService';

export type AppResourceMode = 'IDLE' | 'INDEXING' | 'INFERENCE';

export interface IndexingProgress {
  percent: number; // 0 to 100
  statusText: string;
  currentChunk?: number;
  totalChunks?: number;
}

export interface ResourceGuardState {
  mode: AppResourceMode;
  activeTaskName: string | null;
  indexingProgress: IndexingProgress | null;
  error: string | null;
}

type StateListener = (state: ResourceGuardState) => void;

class ResourceGuard {
  private state: ResourceGuardState = {
    mode: 'IDLE',
    activeTaskName: null,
    indexingProgress: null,
    error: null,
  };

  private listeners: Set<StateListener> = new Set();

  public getState(): ResourceGuardState {
    return { ...this.state };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (err) {
        console.error('[ResourceGuard] Error in listener:', err);
      }
    });
  }

  public isIndexing(): boolean {
    return this.state.mode === 'INDEXING';
  }

  public isInference(): boolean {
    return this.state.mode === 'INFERENCE';
  }

  /**
   * Acquire lock for file indexing.
   * If a chat model is loaded or generating, it stops generation and unloads
   * the model context to maximize available RAM for the embedding pipeline.
   */
  public async acquireIndexingLock(taskName: string): Promise<void> {
    if (this.state.mode === 'INDEXING') {
      throw new Error('Another indexing task is already running.');
    }

    console.log(`[ResourceGuard] Acquiring INDEXING lock for: ${taskName}`);

    // If an inference model is in memory, unload it to prevent OOM
    if (llamaService.isModelLoaded()) {
      console.log('[ResourceGuard] Unloading active chat model to free memory for indexing...');
      await llamaService.unloadModel();
    }

    this.state = {
      mode: 'INDEXING',
      activeTaskName: taskName,
      indexingProgress: { percent: 0, statusText: 'Preparing...' },
      error: null,
    };
    this.notify();
  }

  public updateIndexingProgress(progress: Partial<IndexingProgress>) {
    if (this.state.mode !== 'INDEXING') return;

    this.state.indexingProgress = {
      percent: progress.percent ?? this.state.indexingProgress?.percent ?? 0,
      statusText: progress.statusText ?? this.state.indexingProgress?.statusText ?? '',
      currentChunk: progress.currentChunk,
      totalChunks: progress.totalChunks,
    };
    this.notify();
  }

  public releaseIndexingLock() {
    console.log('[ResourceGuard] Releasing INDEXING lock.');
    this.state = {
      mode: 'IDLE',
      activeTaskName: null,
      indexingProgress: null,
      error: null,
    };
    this.notify();
  }

  /**
   * Check if chat inference is allowed.
   */
  public canStartInference(): boolean {
    return this.state.mode !== 'INDEXING';
  }

  public acquireInferenceLock(): void {
    if (this.state.mode === 'INDEXING') {
      throw new Error(
        'Document indexing is currently active. Inference is paused to preserve device memory.'
      );
    }
    this.state.mode = 'INFERENCE';
    this.notify();
  }

  public releaseInferenceLock(): void {
    if (this.state.mode === 'INFERENCE') {
      this.state.mode = 'IDLE';
      this.notify();
    }
  }
}

export const resourceGuard = new ResourceGuard();
