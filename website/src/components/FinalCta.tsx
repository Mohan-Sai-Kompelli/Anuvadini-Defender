import { useRef } from 'react';
import { gsap, useGSAP } from '../lib/gsap';
import { scrollToId } from '../lib/scroll';
import { PORTAL_URL } from '../config';
import { ArrowRight } from './Icons';

const TIMES = [8, 29, 50, 71, 92];

export default function FinalCta() {
  const root = useRef<HTMLElement>(null);
  const ambient = useRef<HTMLDivElement>(null);
  const light = useRef<HTMLDivElement>(null);
  const path = useRef<SVGPathElement>(null);
  const exit = useRef<HTMLDivElement>(null);
  const magnet = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();
    gsap.set(path.current, { strokeDasharray: 1, strokeDashoffset: 1 });

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.set(q('.cta__in'), { yPercent: 115 });
      gsap.set(q('.cta__fade'), { opacity: 0, y: 18 });
      gsap.set(magnet.current, { scale: 0.88, opacity: 0 });
      gsap.set(q('.cta__tick'), { scale: 0, opacity: 0 });
      gsap.set(ambient.current, { scale: 0.4, opacity: 0 });

      // The entrance is short on purpose: the buttons must be usable straight away.
      gsap.timeline({ defaults: { ease: 'power3.out' }, scrollTrigger: { trigger: root.current, start: 'top 72%', toggleActions: 'play none none reverse' } })
        .to(q('.cta__in'), { yPercent: 0, duration: 0.85, stagger: 0.12 })
        .to(q('.cta__fade'), { opacity: 1, y: 0, duration: 0.6, stagger: 0.08 }, 0.25)
        .to(magnet.current, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.6)' }, 0.35)
        .to(q('.cta__tick'), { scale: 1, opacity: 1, duration: 0.4, stagger: 0.14, ease: 'back.out(2)' }, 0.4);

      // scroll-linked: the soft gradient expands, the timeline draws, and the section exits into the footer
      gsap.to(ambient.current, { scale: 1.1, opacity: 1, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top 90%', end: 'center 50%', scrub: 1 } });
      gsap.to(path.current, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top 75%', end: 'center 45%', scrub: 1 } });
      gsap.fromTo(exit.current, { opacity: 0 }, { opacity: 1, ease: 'none', scrollTrigger: { trigger: root.current, start: 'center 30%', end: 'bottom 70%', scrub: true } });
    });

    mm.add('(prefers-reduced-motion: reduce)', () => { gsap.set(path.current, { strokeDashoffset: 0 }); });

    // Pointer-following light field and a restrained magnetic CTA (fine pointers only)
    mm.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
      const lx = gsap.quickTo(light.current, 'x', { duration: 0.8, ease: 'power3.out' });
      const ly = gsap.quickTo(light.current, 'y', { duration: 0.8, ease: 'power3.out' });
      const mx = gsap.quickTo(magnet.current, 'x', { duration: 0.5, ease: 'power3.out' });
      const my = gsap.quickTo(magnet.current, 'y', { duration: 0.5, ease: 'power3.out' });
      const move = (e: PointerEvent) => {
        const r = root.current!.getBoundingClientRect();
        lx(e.clientX - r.left - r.width / 2);
        ly(e.clientY - r.top - r.height / 2);
        const b = magnet.current!.getBoundingClientRect();
        const dx = e.clientX - (b.left + b.width / 2);
        const dy = e.clientY - (b.top + b.height / 2);
        const dist = Math.hypot(dx, dy);
        if (dist < 140) { mx(dx * 0.12); my(dy * 0.18); } else { mx(0); my(0); }
      };
      const el = root.current!;
      el.addEventListener('pointermove', move);
      return () => el.removeEventListener('pointermove', move);
    });
  }, { scope: root });

  return (
    <section id="contact" ref={root} className="section cta" aria-labelledby="cta-title">
      <div ref={ambient} className="cta__ambient" aria-hidden />
      <div ref={light} className="cta__light" aria-hidden />
      <div className="container cta__inner">
        <h2 id="cta-title" className="h2" style={{ fontSize: 'clamp(40px, 7vw, 96px)' }}>
          <span className="mask"><span className="cta__in">Make every workday</span></span>
          <span className="mask"><span className="cta__in" style={{ color: 'var(--cobalt)' }}>clearer.</span></span>
        </h2>
        <p className="lead center cta__fade" style={{ marginTop: 22 }}>Explore a more connected approach to attendance and workday visibility.</p>

        <div className="cta__line" aria-hidden>
          <svg viewBox="0 0 1000 70" preserveAspectRatio="none">
            <defs>
              <linearGradient id="ctag" gradientUnits="userSpaceOnUse" x1="0" x2="1000" y1="0" y2="0"><stop offset="0" stopColor="#315CE8" /><stop offset="1" stopColor="#B9F36A" /></linearGradient>
            </defs>
            <path d="M0 35 H1000" stroke="#DADDD8" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path ref={path} pathLength={1} d="M0 35 H1000" stroke="url(#ctag)" strokeWidth="4" fill="none" strokeLinecap="round" />
          </svg>
          {TIMES.map((x, i) => (
            <span key={x} className="cta__tick" style={{ left: `${x}%`, background: i < 3 ? '#315CE8' : '#385D27' }} />
          ))}
        </div>

        <div className="cta__btns">
          <div ref={magnet} className="cta__magnet">
            <a href={PORTAL_URL} className="btn btn--primary">Sign in to the portal <ArrowRight /></a>
          </div>
          <button type="button" className="btn btn--ghost cta__fade" onClick={() => scrollToId('attendance')}>Explore the products <ArrowRight /></button>
        </div>
      </div>
      <div ref={exit} className="cta__exit" aria-hidden />
    </section>
  );
}
