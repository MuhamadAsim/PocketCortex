import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import {
  getThemePreference,
  setThemePreference as saveThemePreference,
  ThemePreference,
} from '../storage/mmkv';
import { darkColors, lightColors, ThemeColors } from './theme';

interface ThemeContextType {
  theme: ThemeColors;
  isDark: boolean;
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(() =>
    getThemePreference()
  );

  const isDark = useMemo(() => {
    if (preference === 'dark') return true;
    if (preference === 'light') return false;
    return systemScheme === 'dark';
  }, [preference, systemScheme]);

  const theme = useMemo(() => {
    return isDark ? darkColors : lightColors;
  }, [isDark]);

  const updatePreference = useCallback((newPref: ThemePreference) => {
    setPreference(newPref);
    saveThemePreference(newPref);
  }, []);

  const toggleTheme = useCallback(() => {
    const nextPref = isDark ? 'light' : 'dark';
    updatePreference(nextPref);
  }, [isDark, updatePreference]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark,
        themePreference: preference,
        setThemePreference: updatePreference,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
