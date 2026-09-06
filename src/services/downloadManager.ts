import * as RNFS from '@dr.pogodin/react-native-fs';
import { ModelDefinition, ModelDownloadState } from '../types/models';
import {
  getModelDownloadState,
  setModelDownloadState,
  removeModelDownloadState,
} from '../storage/modelStorage';

// Active in-memory jobs
interface ActiveJob {
  jobId: number;
  modelId: string;
  model: ModelDefinition;
  promise: Promise<RNFS.DownloadResultT>;
}

const activeJobs = new Map<string, ActiveJob>();
type StateListener = (state: ModelDownloadState) => void;
const listeners = new Map<string, Set<StateListener>>();

export function subscribeDownload(
  modelId: string,
  listener: StateListener
): () => void {
  if (!listeners.has(modelId)) {
    listeners.set(modelId, new Set());
  }
  listeners.get(modelId)!.add(listener);

  // Immediately notify with current state
  const current = getDownloadState(modelId);
  listener(current);

  return () => {
    listeners.get(modelId)?.delete(listener);
  };
}

function notifyListeners(modelId: string, state: ModelDownloadState) {
  const modelListeners = listeners.get(modelId);
  if (modelListeners) {
    modelListeners.forEach(listener => {
      try {
        listener(state);
      } catch (err) {
        console.error('Error in download listener:', err);
      }
    });
  }
}

export function getModelDirectory(): string {
  return `${RNFS.DocumentDirectoryPath}/models`;
}

export function getModelFilePath(filename: string): string {
  return `${getModelDirectory()}/${filename}`;
}

export async function ensureModelDirectory(): Promise<string> {
  const dir = getModelDirectory();
  const dirExists = await RNFS.exists(dir);
  if (!dirExists) {
    await RNFS.mkdir(dir);
  }
  return dir;
}

export function getDownloadState(modelId: string): ModelDownloadState {
  const saved = getModelDownloadState(modelId);
  if (saved) {
    return saved;
  }
  return {
    modelId,
    status: 'not_downloaded',
    bytesDownloaded: 0,
    totalBytes: 0,
    updatedAt: Date.now(),
  };
}

/**
 * Start or restart download of a model
 */
export async function startDownload(model: ModelDefinition): Promise<void> {
  return executeDownload(model, false);
}

/**
 * Resume download of a model using HTTP Range header from existing byte count
 */
export async function resumeDownload(model: ModelDefinition): Promise<void> {
  return executeDownload(model, true);
}

async function executeDownload(
  model: ModelDefinition,
  isResume: boolean
): Promise<void> {
  const { id: modelId, downloadUrl, filename, sizeBytes } = model;

  // If already actively downloading, ignore
  if (activeJobs.has(modelId)) {
    console.warn(`Model ${modelId} is already downloading.`);
    return;
  }

  await ensureModelDirectory();
  const destPath = getModelFilePath(filename);

  let existingBytes = 0;
  const fileExists = await RNFS.exists(destPath);

  if (fileExists) {
    if (isResume) {
      try {
        const fileStat = await RNFS.stat(destPath);
        existingBytes = Number(fileStat.size) || 0;
      } catch {
        existingBytes = 0;
      }
    } else {
      // Clean start: remove previous incomplete file
      await RNFS.unlink(destPath).catch(() => {});
      existingBytes = 0;
    }
  }

  // If already fully downloaded
  if (existingBytes >= sizeBytes && sizeBytes > 0) {
    const completedState: ModelDownloadState = {
      modelId,
      status: 'downloaded',
      bytesDownloaded: sizeBytes,
      totalBytes: sizeBytes,
      localPath: destPath,
      updatedAt: Date.now(),
    };
    setModelDownloadState(modelId, completedState);
    notifyListeners(modelId, completedState);
    return;
  }

  const headers: Record<string, string> = {
    'User-Agent': 'LocalMindRN-App/1.0',
    Accept: '*/*',
  };

  if (isResume && existingBytes > 0) {
    headers.Range = `bytes=${existingBytes}-`;
  }

  const initialDownloadingState: ModelDownloadState = {
    modelId,
    status: 'downloading',
    bytesDownloaded: existingBytes,
    totalBytes: sizeBytes,
    localPath: destPath,
    updatedAt: Date.now(),
  };
  setModelDownloadState(modelId, initialDownloadingState);
  notifyListeners(modelId, initialDownloadingState);

  let lastSavedBytes = existingBytes;
  let lastSavedTimestamp = Date.now();

  const downloadJob = RNFS.downloadFile({
    fromUrl: downloadUrl,
    toFile: destPath,
    headers,
    progressInterval: 250, // update progress every 250ms
    progressDivider: 0,
    begin: res => {
      console.log(
        `[DownloadManager] Download started for ${model.name}. Status: ${res.statusCode}`
      );
    },
    progress: res => {
      const currentBytes = existingBytes + res.bytesWritten;
      const total = sizeBytes > 0 ? sizeBytes : res.contentLength;

      const state: ModelDownloadState = {
        modelId,
        status: 'downloading',
        bytesDownloaded: currentBytes,
        totalBytes: total,
        localPath: destPath,
        jobId: downloadJob.jobId,
        updatedAt: Date.now(),
      };

      // Throttle persistent MMKV writes to every 1.5 seconds to preserve flash longevity
      const now = Date.now();
      if (now - lastSavedTimestamp > 1500 || currentBytes >= total) {
        lastSavedTimestamp = now;
        lastSavedBytes = currentBytes;
        setModelDownloadState(modelId, state);
      }

      notifyListeners(modelId, state);
    },
  });

  activeJobs.set(modelId, {
    jobId: downloadJob.jobId,
    modelId,
    model,
    promise: downloadJob.promise,
  });

  try {
    const result = await downloadJob.promise;
    activeJobs.delete(modelId);

    if (result.statusCode === 200 || result.statusCode === 206) {
      // Verify final file size on disk
      const finalStat = await RNFS.stat(destPath);
      const finalSize = Number(finalStat.size);

      const successState: ModelDownloadState = {
        modelId,
        status: 'downloaded',
        bytesDownloaded: finalSize,
        totalBytes: finalSize,
        localPath: destPath,
        updatedAt: Date.now(),
      };
      setModelDownloadState(modelId, successState);
      notifyListeners(modelId, successState);
    } else {
      throw new Error(`Server returned HTTP ${result.statusCode}`);
    }
  } catch (error: any) {
    activeJobs.delete(modelId);

    // If download was intentionally stopped (paused)
    const currentState = getDownloadState(modelId);
    if (currentState.status === 'paused') {
      return;
    }

    // Inspect actual bytes on disk after error
    let writtenSoFar = existingBytes;
    try {
      const partialStat = await RNFS.stat(destPath);
      writtenSoFar = Number(partialStat.size);
    } catch {}

    const errorState: ModelDownloadState = {
      modelId,
      status: 'error',
      bytesDownloaded: writtenSoFar,
      totalBytes: sizeBytes,
      localPath: destPath,
      error: error?.message || 'Download failed',
      updatedAt: Date.now(),
    };
    setModelDownloadState(modelId, errorState);
    notifyListeners(modelId, errorState);
  }
}

/**
 * Pause an active download job
 */
export async function pauseDownload(modelId: string): Promise<void> {
  const job = activeJobs.get(modelId);
  if (job) {
    try {
      RNFS.stopDownload(job.jobId);
    } catch (e) {
      console.warn(`Error stopping download job for ${modelId}:`, e);
    }
    activeJobs.delete(modelId);
  }

  const current = getDownloadState(modelId);
  let bytesOnDisk = current.bytesDownloaded;

  if (current.localPath) {
    try {
      const s = await RNFS.stat(current.localPath);
      bytesOnDisk = Number(s.size);
    } catch {}
  }

  const pausedState: ModelDownloadState = {
    ...current,
    status: 'paused',
    bytesDownloaded: bytesOnDisk,
    updatedAt: Date.now(),
  };

  setModelDownloadState(modelId, pausedState);
  notifyListeners(modelId, pausedState);
}

/**
 * Delete a downloaded or partially downloaded model file
 */
export async function deleteModel(modelId: string): Promise<void> {
  // If downloading, stop it first
  if (activeJobs.has(modelId)) {
    await pauseDownload(modelId);
  }

  const current = getDownloadState(modelId);
  if (current.localPath) {
    try {
      const exists = await RNFS.exists(current.localPath);
      if (exists) {
        await RNFS.unlink(current.localPath);
      }
    } catch (err) {
      console.warn(`Failed to unlink file for ${modelId}:`, err);
    }
  }

  removeModelDownloadState(modelId);

  const resetState: ModelDownloadState = {
    modelId,
    status: 'not_downloaded',
    bytesDownloaded: 0,
    totalBytes: 0,
    updatedAt: Date.now(),
  };
  notifyListeners(modelId, resetState);
}

/**
 * Synchronize MMKV state with physical files on disk (called on app startup)
 */
export async function syncDiskState(
  model: ModelDefinition
): Promise<ModelDownloadState> {
  const destPath = getModelFilePath(model.filename);
  const exists = await RNFS.exists(destPath);
  const savedState = getDownloadState(model.id);

  if (!exists) {
    if (savedState.status !== 'not_downloaded') {
      const resetState: ModelDownloadState = {
        modelId: model.id,
        status: 'not_downloaded',
        bytesDownloaded: 0,
        totalBytes: model.sizeBytes,
        updatedAt: Date.now(),
      };
      setModelDownloadState(model.id, resetState);
      return resetState;
    }
    return savedState;
  }

  const stat = await RNFS.stat(destPath);
  const actualSize = Number(stat.size);

  if (actualSize >= model.sizeBytes && model.sizeBytes > 0) {
    const downloadedState: ModelDownloadState = {
      modelId: model.id,
      status: 'downloaded',
      bytesDownloaded: actualSize,
      totalBytes: actualSize,
      localPath: destPath,
      updatedAt: Date.now(),
    };
    setModelDownloadState(model.id, downloadedState);
    return downloadedState;
  }

  // Partial file on disk
  const pausedState: ModelDownloadState = {
    modelId: model.id,
    status: 'paused',
    bytesDownloaded: actualSize,
    totalBytes: model.sizeBytes,
    localPath: destPath,
    updatedAt: Date.now(),
  };
  setModelDownloadState(model.id, pausedState);
  return pausedState;
}
