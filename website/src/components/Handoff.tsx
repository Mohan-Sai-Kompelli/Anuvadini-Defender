import { useRef } from 'react';
import { gsap, useGSAP } from '../lib/gsap';

/**
 * A short vertical line that straddles the boundary between two sections and
 * draws with scroll. It carries the story's "timeline" from one scene into the
 * next, shifting colour from `from` to `to`.
 */
export default function Handoff({ from = '#315CE8', to = '#315CE8', x = '50%' }: { from?: string; to?: string; x?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLSpanElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const st = { trigger: root.current, start: 'top 98%', end: 'top 40%', scrub: true };
      gsap.fromTo(fill.current, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: st });
      gsap.fromTo(dot.current, { y: 0, opacity: 0 }, { y: 150, opacity: 1, ease: 'none', scrollTrigger: st });
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(fill.current, { scaleY: 1 });
      gsap.set(dot.current, { opacity: 0 });
    });
  }, { scope: root });

  return (
    <div ref={root} className="handoff" aria-hidden style={{ ['--x' as string]: x }}>
      <div ref={fill} className="handoff__fill" style={{ background: `linear-gradient(${from}, ${to})` }} />
      <span ref={dot} className="handoff__dot" style={{ background: to }} />
    </div>
  );
}
