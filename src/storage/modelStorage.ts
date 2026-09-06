import { ModelDownloadState } from '../types/models';
import { storage, STORAGE_KEYS } from './mmkv';

function getKeyState(modelId: string): string {
  return `${STORAGE_KEYS.MODEL_STATE_PREFIX}${modelId}`;
}

export function getModelDownloadState(
  modelId: string
): ModelDownloadState | null {
  try {
    const raw = storage.getString(getKeyState(modelId));
    if (!raw) return null;
    return JSON.parse(raw) as ModelDownloadState;
  } catch (error) {
    console.error(`Failed to parse download state for ${modelId}:`, error);
    return null;
  }
}

export function setModelDownloadState(
  modelId: string,
  state: ModelDownloadState
): void {
  try {
    storage.set(getKeyState(modelId), JSON.stringify(state));
  } catch (error) {
    console.error(`Failed to set download state for ${modelId}:`, error);
  }
}

export function removeModelDownloadState(modelId: string): void {
  storage.remove(getKeyState(modelId));
}

export function getAllModelDownloadStates(): Record<string, ModelDownloadState> {
  const result: Record<string, ModelDownloadState> = {};
  const allKeys = storage.getAllKeys();

  for (const key of allKeys) {
    if (key.startsWith(STORAGE_KEYS.MODEL_STATE_PREFIX)) {
      const modelId = key.substring(STORAGE_KEYS.MODEL_STATE_PREFIX.length);
      const state = getModelDownloadState(modelId);
      if (state) {
        result[modelId] = state;
      }
    }
  }

  return result;
}

export function isModelDownloaded(modelId: string): boolean {
  const state = getModelDownloadState(modelId);
  return state?.status === 'downloaded' && !!state.localPath;
}

export function getModelLocalPath(modelId: string): string | null {
  const state = getModelDownloadState(modelId);
  if (state?.status === 'downloaded' && state.localPath) {
    return state.localPath;
  }
  return null;
}

export function getSelectedModelId(): string | null {
  return storage.getString(STORAGE_KEYS.SELECTED_MODEL_ID) ?? null;
}

export function setSelectedModelId(modelId: string): void {
  storage.set(STORAGE_KEYS.SELECTED_MODEL_ID, modelId);
}
