/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

const store: Record<string, string> = {};

jest.mock('@dr.pogodin/react-native-fs', () => ({
  exists: jest.fn(),
  readFile: jest.fn(),
  DocumentDirectoryPath: '/mock/dir',
}));

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

jest.mock('../src/services/downloadManager', () => ({
  syncDiskState: jest.fn(async (model) => ({
    modelId: model.id,
    status: 'not_downloaded',
    bytesDownloaded: 0,
    totalBytes: model.sizeBytes,
    updatedAt: 0,
  })),
  getDownloadState: jest.fn((id) => ({
    modelId: id,
    status: 'not_downloaded',
    bytesDownloaded: 0,
    totalBytes: 1000,
    updatedAt: 0,
  })),
  subscribeDownload: jest.fn(() => () => {}),
  startDownload: jest.fn(),
  pauseDownload: jest.fn(),
  resumeDownload: jest.fn(),
  deleteModel: jest.fn(),
}));

jest.mock('../src/services/llamaService', () => ({
  llamaService: {
    subscribe: jest.fn(() => () => {}),
    getState: jest.fn(() => ({
      activeModelId: null,
      isLoading: false,
      loadProgress: 0,
      isGenerating: false,
      error: null,
    })),
    loadModel: jest.fn(),
    unloadModel: jest.fn(),
    generateCompletion: jest.fn(),
    stopGeneration: jest.fn(),
  },
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

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(async () => ({ rows: [] })),
    executeSync: jest.fn(() => ({ rows: [] })),
  })),
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
