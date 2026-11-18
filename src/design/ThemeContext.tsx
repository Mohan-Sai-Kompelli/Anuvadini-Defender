/**
 * ThemeProvider + useTheme(). Resolves light/dark via useColorScheme(),
 * persists a manual override in AsyncStorage ('saacms.themeMode').
 * Safe to call useTheme() before persistence loads (sync default = light)
 * and even outside the provider (falls back to light theme).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkTheme, lightTheme } from './tokens';
import type { AppTheme } from './tokens';
import { setToastTheme } from '../utils/toast';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeScheme = 'light' | 'dark';

const STORAGE_KEY = 'saacms.themeMode';

export interface ThemeContextValue {
  theme: AppTheme;
  /** User preference ('system' follows the OS) */
  mode: ThemeMode;
  /** Resolved scheme actually rendered */
  scheme: ThemeScheme;
  setMode: (mode: ThemeMode) => void;
}

const DEFAULT_VALUE: ThemeContextValue = {
  theme: lightTheme,
  mode: 'light',
  scheme: 'light',
  setMode: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(DEFAULT_VALUE);

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Load persisted override (non-blocking; default 'system' until then).
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (alive && isThemeMode(value)) {
          setModeState(value);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const scheme: ThemeScheme =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const theme = scheme === 'dark' ? darkTheme : lightTheme;

  // Keep the module-level toast theme accessor in sync.
  useEffect(() => {
    setToastTheme(theme);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, mode, scheme, setMode }),
    [theme, mode, scheme, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
