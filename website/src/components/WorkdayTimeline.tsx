import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { gsap, useGSAP, MQ } from '../lib/gsap';
import { useIsDesktop } from '../hooks/useMedia';
import { TL_EVENTS } from '../data';
import { Check, Chart, Clock, File } from './Icons';

type Tab = 'attendance' | 'defender';
const STOPS = [0.1, 0.36, 0.62, 0.88]; // where each event sits along the track (0..1)
const EV_ICON = { checkin: Check, activity: Chart, break: Clock, summary: File } as const;

export default function WorkdayTimeline() {
  const root = useRef<HTMLElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const path = useRef<SVGPathElement>(null);
  const glow = useRef<HTMLSpanElement>(null);
  const vfill = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<Tab>('attendance');
  const [sel, setSel] = useState(0);
  const selRef = useRef(0);
  const lockUntil = useRef(0); // manual choice wins over scroll-driven activation for a moment
  const desktop = useIsDesktop();

  const ev = TL_EVENTS[sel];
  const view = ev[tab];
  const isDef = tab === 'defender';

  const choose = (i: number, manual = true) => {
    if (manual) lockUntil.current = Date.now() + 2800;
    selRef.current = i;
    setSel(i);
  };

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();
    const toIndex = (p: number) => {
      let idx = 0;
      STOPS.forEach((s, i) => { if (p >= s - 0.04) idx = i; });
      return idx;
    };
    const onProgress = (p: number) => {
      const idx = toIndex(p);
      if (idx !== selRef.current && Date.now() > lockUntil.current) choose(idx, false);
    };

    const reveal = () => {
      gsap.from(head.current!.children, {
        y: 34, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out',
        scrollTrigger: { trigger: head.current, start: 'top 82%', toggleActions: 'play none none reverse' },
      });
    };

    mm.add(MQ.desktop, () => {
      reveal();
      gsap.set(path.current, { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.set(q('.tl__marker'), { scale: 0, rotation: -90, opacity: 0 });
      gsap.set(q('.tl__card'), { opacity: 0, y: (i: number) => (i % 2 === 0 ? 30 : -30) });
      gsap.set(glow.current, { x: 0, opacity: 0 });

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: track.current, start: 'top 78%', end: 'bottom 38%', scrub: 0.8,
          onUpdate: (self) => onProgress(self.progress),
        },
      });
      tl.fromTo(root.current, { backgroundColor: '#FFFAF0' }, { backgroundColor: '#EAF0FF', duration: 1 }, 0)
        .to(path.current, { strokeDashoffset: 0, duration: 1 }, 0)
        .to(glow.current, { x: () => track.current!.offsetWidth, opacity: 1, duration: 1 }, 0);
      STOPS.forEach((s, i) => {
        tl.to(q('.tl__marker')[i], { scale: 1, rotation: 0, opacity: 1, duration: 0.07, ease: 'back.out(2)' }, Math.max(0, s - 0.08))
          .to(q('.tl__card')[i], { opacity: 1, y: 0, duration: 0.09, ease: 'power2.out' }, Math.max(0, s - 0.07));
      });
    });

    mm.add(MQ.mobile, () => {
      reveal();
      gsap.set(vfill.current, { scaleY: 0, transformOrigin: 'top' });
      gsap.set(q('.tl__marker'), { scale: 0, opacity: 0 });
      gsap.set(q('.tl__card'), { opacity: 0, x: 24 });
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: track.current, start: 'top 75%', end: 'bottom 55%', scrub: 0.6,
          onUpdate: (self) => onProgress(self.progress * 0.88 + 0.04),
        },
      });
      tl.fromTo(root.current, { backgroundColor: '#FFFAF0' }, { backgroundColor: '#EAF0FF', duration: 1 }, 0)
        .to(vfill.current, { scaleY: 1, duration: 1 }, 0);
      [0.08, 0.34, 0.6, 0.86].forEach((s, i) => {
        tl.to(q('.tl__marker')[i], { scale: 1, opacity: 1, duration: 0.07, ease: 'back.out(2)' }, s)
          .to(q('.tl__card')[i], { opacity: 1, x: 0, duration: 0.08, ease: 'power2.out' }, s);
      });
    });

    mm.add(MQ.reduced, () => {
      gsap.set(path.current, { strokeDasharray: 1, strokeDashoffset: 0 });
      gsap.set(vfill.current, { scaleY: 1 });
    });
  }, { scope: root, dependencies: [desktop] });

  return (
    <section id="workday" ref={root} className="section tl" aria-labelledby="tl-title" style={{ backgroundColor: '#FFFAF0' }}>
      <div className="container">
        <div ref={head} className="tl__head center">
          <p className="eyebrow">The workday</p>
          <h2 id="tl-title" className="h2">One workday. Two perspectives.</h2>
          <p className="lead">Attendance records presence. Defender helps explain the activity recorded during the workday.</p>
          <div style={{ marginTop: 28 }}>
            <div className="tabs" role="tablist" aria-label="Perspective">
              {(['attendance', 'defender'] as Tab[]).map((t) => (
                <button key={t} role="tab" type="button" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                  {tab === t && (
                    <motion.span layoutId="tl-pill" className={`tab__pill ${t === 'attendance' ? 'tab__pill--att' : 'tab__pill--def'}`} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />
                  )}
                  {t === 'attendance' ? 'Attendance' : 'Defender'}
                </button>
              ))}
            </div>
          </div>
          <p style={{ marginTop: 14 }}><span className="demo-badge">Illustrative timestamps, not real employee data</span></p>
        </div>

        <div className={isDef ? 'is-def' : ''}>
          <div ref={track} className="tl__track" role="group" aria-label="Workday timeline. Scroll to advance, or select an event.">
            {desktop ? (
              <div className="tl__desktop">
                <svg className="tl__svg" viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden>
                  <path d="M0 12 H1000" stroke="#E5E7E3" strokeWidth="4" fill="none" strokeLinecap="round" />
                  <path ref={path} pathLength={1} d="M0 12 H1000" stroke={isDef ? '#385D27' : '#315CE8'} strokeWidth="4" fill="none" strokeLinecap="round" style={{ transition: 'stroke 0.5s' }} />
                </svg>
                <span ref={glow} className="tl__glow" aria-hidden />
                <ul className="tl__stops">
                  {TL_EVENTS.map((e, i) => {
                    const I = EV_ICON[e.id as keyof typeof EV_ICON];
                    return (
                      <li key={e.id} className="tl__stop" style={{ left: `${STOPS[i] * 100}%` }}>
                        <button type="button" className="tl__marker" aria-pressed={sel === i} aria-label={`${e.time}: ${e.title}`} onClick={() => choose(i)} />
                        <button type="button" className={`tl__card ${i % 2 === 0 ? 'tl__card--up' : 'tl__card--down'}`} aria-pressed={sel === i} onClick={() => choose(i)}>
                          <span className="ico" aria-hidden><I /></span>
                          <time>{e.time}</time>
                          <h4>{e.title}</h4>
                          <p>{e.short}</p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="tl__mobilewrap">
                <div className="tl__vline" aria-hidden><div ref={vfill} className="tl__vfill" /></div>
                <ol className="tl__mobile">
                  {TL_EVENTS.map((e, i) => {
                    const I = EV_ICON[e.id as keyof typeof EV_ICON];
                    return (
                      <li key={e.id}>
                        <button type="button" className="tl__marker" aria-pressed={sel === i} aria-label={`${e.time}: ${e.title}`} onClick={() => choose(i)} />
                        <button type="button" className="tl__card" aria-pressed={sel === i} onClick={() => choose(i)}>
                          <span className="ico" aria-hidden><I /></span>
                          <time>{e.time}</time>
                          <h4>{e.title}</h4>
                          <p>{e.short}</p>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>

          <div className="tl__detail" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div key={`${tab}-${sel}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                <p className="eyebrow" style={isDef ? { color: 'var(--forest)' } : undefined}>{ev.time} · {isDef ? 'Defender' : 'Attendance'}</p>
                <h3 style={{ marginTop: 8 }}>{view.headline}</h3>
                <p style={{ marginTop: 10 }}>{view.body}</p>
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.div key={`chips-${tab}-${sel}`} className="chips" initial="h" animate="s" exit="h" variants={{ h: { opacity: 0 }, s: { opacity: 1, transition: { staggerChildren: 0.06 } } }}>
                {view.chips.map((c) => (
                  <motion.span key={c} className={`chip ${isDef ? 'chip--lime' : ''}`} variants={{ h: { opacity: 0, scale: 0.8 }, s: { opacity: 1, scale: 1 } }}>{c}</motion.span>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
