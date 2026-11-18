import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY = 'saacms.theme';
const VALID_THEMES = ['light', 'dark', 'system'];

const ThemeContext = createContext({ theme: 'system', setTheme: () => {} });

function getStoredTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.includes(stored) ? stored : 'system';
  } catch (e) {
    return 'system';
  }
}

function systemPrefersDark() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function applyTheme(theme) {
  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', isDark);
}

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(getStoredTheme);

  // Apply/remove the 'dark' class whenever the theme changes.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Follow OS preference changes while in 'system' mode.
  useEffect(() => {
    if (theme !== 'system' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [theme]);

  const setTheme = useCallback((next) => {
    const value = VALID_THEMES.includes(next) ? next : 'system';
    setThemeState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {
      // localStorage unavailable (private mode etc.) — theme still applies in-memory.
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;
