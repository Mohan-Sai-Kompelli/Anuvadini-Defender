import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { gsap, useGSAP, MQ } from '../lib/gsap';
import { useIsDesktop } from '../hooks/useMedia';
import { Clock, Chart, Eye } from './Icons';

const STEPS = [
  { icon: Clock, title: 'Record attendance', text: 'Check-ins and check-outs build a clear record of who was present and for how long.' },
  { icon: Chart, title: 'Understand activity in context', text: 'Defender organises work-related activity into categories on a contextual timeline.' },
  { icon: Eye, title: 'Review the workday more clearly', text: 'Read presence and activity side by side, so the day is understood rather than guessed.' },
];

function Viz({ n, active }: { n: number; active: boolean }) {
  const on = { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const };
  if (n === 0) {
    return (
      <svg viewBox="0 0 240 96" aria-hidden>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x="20" y={16 + i * 26} width="200" height="18" rx="9" fill="#fff" stroke="#E5E7E3" />
            <circle cx="32" cy={25 + i * 26} r="5" fill={i === 1 ? '#f5a524' : '#315CE8'} />
            <motion.rect x="46" y={21 + i * 26} height="8" rx="4" fill="#CDD9FB" initial={false} animate={{ width: active ? 90 + i * 20 : 20 }} transition={{ ...on, delay: i * 0.1 }} />
          </g>
        ))}
      </svg>
    );
  }
  if (n === 1) {
    return (
      <svg viewBox="0 0 240 96" aria-hidden>
        <line x1="16" y1="48" x2="224" y2="48" stroke="#E5E7E3" strokeWidth="3" strokeLinecap="round" />
        {[[22, 60, 0], [86, 52, 1], [150, 30, 2], [190, 26, 3]].map(([x, w, i]) => (
          <motion.rect key={i} x={x} y="34" height="28" rx="5" fill="#B9F36A" initial={false} animate={{ width: active ? w : 6, opacity: active ? 1 : 0.5 }} transition={{ ...on, delay: Number(i) * 0.12 }} />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 240 96" aria-hidden>
      <rect x="18" y="16" width="92" height="64" rx="10" fill="#fff" stroke="#E5E7E3" />
      <rect x="130" y="16" width="92" height="64" rx="10" fill="#fff" stroke="#E5E7E3" />
      <rect x="28" y="28" width="46" height="8" rx="4" fill="#CDD9FB" />
      <rect x="28" y="44" width="62" height="8" rx="4" fill="#EAF0FF" />
      <rect x="140" y="28" width="52" height="8" rx="4" fill="#B9F36A" />
      <rect x="140" y="44" width="36" height="8" rx="4" fill="#f1fbd9" />
      <motion.path d="M110 48 H130" stroke="#385D27" strokeWidth="3" strokeLinecap="round" initial={false} animate={{ pathLength: active ? 1 : 0 }} transition={on} />
    </svg>
  );
}

export default function HowItWorks() {
  const root = useRef<HTMLElement>(null);
  const cards = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const activeRef = useRef(-1);
  const desktop = useIsDesktop();

  const set = (i: number) => { if (i !== activeRef.current) { activeRef.current = i; setActive(i); } };

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();
    const reveal = () => gsap.from(head.current!.children, {
      y: 34, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out',
      scrollTrigger: { trigger: head.current, start: 'top 82%', toggleActions: 'play none none reverse' },
    });

    mm.add(MQ.desktop, () => {
      reveal();
      const steps = q('.step');
      gsap.set(steps, { transformPerspective: 1200 });
      gsap.set(steps[0], { rotateY: -20, opacity: 0.55, scale: 0.94 });
      gsap.set(steps[1], { rotateY: 0, opacity: 0.55, scale: 0.94 });
      gsap.set(steps[2], { rotateY: 20, opacity: 0.55, scale: 0.94 });
      gsap.set(fill.current, { scaleX: 0, transformOrigin: 'left' });
      gsap.set(dot.current, { x: 0, opacity: 0 });
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: cards.current, start: 'top 72%', end: 'bottom 32%', scrub: 0.8,
          onUpdate: (self) => set(self.progress < 0.02 ? -1 : Math.min(2, Math.floor(self.progress * 3))),
          onLeaveBack: () => set(-1),
        },
      });
      tl.to(fill.current, { scaleX: 1, duration: 3 }, 0)
        .to(dot.current, { opacity: 1, duration: 0.1 }, 0)
        .to(dot.current, { x: () => cards.current!.offsetWidth * 0.88, duration: 3 }, 0);
      steps.forEach((s, i) => {
        tl.to(s, { rotateY: 0, opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' }, i * 1)
          .to(s, { opacity: 0.92, scale: 0.985, duration: 0.5 }, i * 1 + 1.1);
      });
    });

    mm.add(MQ.mobile, () => {
      reveal();
      gsap.set(fill.current, { scaleY: 0, transformOrigin: 'top' });
      gsap.to(fill.current, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: cards.current, start: 'top 70%', end: 'bottom 55%', scrub: 0.6 } });
      q('.step').forEach((c, i) => {
        gsap.from(c, { y: 36, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: c, start: 'top 90%', toggleActions: 'play none none reverse' } });
        gsap.timeline({ scrollTrigger: { trigger: c, start: 'top 62%', end: 'bottom 38%', onToggle: (self) => { if (self.isActive) set(i); } } });
      });
    });

    mm.add(MQ.reduced, () => { set(2); });
  }, { scope: root, dependencies: [desktop] });

  return (
    <section id="how" ref={root} className="section" aria-labelledby="how-title">
      <div className="container">
        <div ref={head} className="center" style={{ maxWidth: 720 }}>
          <p className="eyebrow">How it works</p>
          <h2 id="how-title" className="h2">Simple by design.</h2>
        </div>
        <div ref={cards} className="how__cards">
          <div className="how__line" aria-hidden><i ref={fill} /><span ref={dot} className="how__dot" /></div>
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <article key={title} className={`step ${active === i ? 'is-active' : ''} ${active > i ? 'is-done' : ''}`}>
              <span className="step__n">STEP 0{i + 1}</span>
              <div className="step__ico"><Icon width={26} height={26} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
              <div className="step__viz"><Viz n={i} active={active >= i} /></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
