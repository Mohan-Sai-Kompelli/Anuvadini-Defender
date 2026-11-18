import { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/**
 * GSAP choreography for a Defender page, scoped to one container.
 *  1. Spotlight: each .app-card tracks the cursor (--mx / --my) for a soft glow.
 *  2. Parallax: any [data-parallax="n"] drifts against the cursor (hero glows).
 * Section entrance and page-by-page scrolling live in useDashboardScroll.
 * Everything is skipped under prefers-reduced-motion.
 *
 * Pass `ready` (e.g. the engine-online flag) so the entrance runs once the real content mounts.
 */
export default function useDefenderMotion(ready = true) {
  const scope = useRef(null);

  useGSAP(
    () => {
      if (!ready || !scope.current) return undefined;
      const root = scope.current;
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const onMove = (e) => {
          const t = e.target.closest ? e.target.closest('.app-card') : null;
          if (t && root.contains(t)) {
            const r = t.getBoundingClientRect();
            t.style.setProperty('--mx', `${e.clientX - r.left}px`);
            t.style.setProperty('--my', `${e.clientY - r.top}px`);
          }
          const nx = e.clientX / window.innerWidth - 0.5;
          const ny = e.clientY / window.innerHeight - 0.5;
          root.querySelectorAll('[data-parallax]').forEach((el) => {
            const k = Number(el.getAttribute('data-parallax')) || 20;
            gsap.to(el, { x: -nx * k, y: -ny * k, duration: 0.9, ease: 'power3.out', overwrite: 'auto' });
          });
        };
        root.addEventListener('pointermove', onMove, { passive: true });
        return () => root.removeEventListener('pointermove', onMove);
      });

      return () => mm.revert();
    },
    { scope, dependencies: [ready], revertOnUpdate: true },
  );

  return scope;
}
