import { createMMKV, MMKV } from 'react-native-mmkv';

export const storage: MMKV = createMMKV({
  id: 'localmind-rn-storage',
});

// Storage keys
export const STORAGE_KEYS = {
  THEME_MODE: 'settings.theme_mode',
  SELECTED_MODEL_ID: 'models.selected_model_id',
  MODEL_STATE_PREFIX: 'models.state.',
  CHAT_HISTORY_PREFIX: 'chat.history.',
} as const;

export type ThemePreference = 'system' | 'light' | 'dark';

export function getThemePreference(): ThemePreference {
  const value = storage.getString(STORAGE_KEYS.THEME_MODE);
  if (value === 'light' || value === 'dark') {
    return value;
  }
  return 'system';
}

export function setThemePreference(theme: ThemePreference): void {
  storage.set(STORAGE_KEYS.THEME_MODE, theme);
}
