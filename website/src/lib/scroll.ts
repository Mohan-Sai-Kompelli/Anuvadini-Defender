/** Native, predictable smooth scrolling to a section (no scroll hijacking). */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const y = id === 'home' ? 0 : el.getBoundingClientRect().top + window.scrollY - 72;
  window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
  el.setAttribute('tabindex', '-1');
  (el as HTMLElement).focus({ preventScroll: true });
}
