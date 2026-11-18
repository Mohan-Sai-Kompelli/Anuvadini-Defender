import { useEffect, useState } from 'react';

export function useMedia(query: string, initial = false): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window === 'undefined' ? initial : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export const useReducedMotionPref = () => useMedia('(prefers-reduced-motion: reduce)');
export const useIsDesktop = () => useMedia('(min-width: 1024px)');
