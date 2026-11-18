import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { gsap, useGSAP, MQ } from '../lib/gsap';
import { scrollToId } from '../lib/scroll';
import { SHOW_REVIEW_SIGNALS } from '../config';
import { ACTIVITIES, type Activity } from '../data';
import { ArrowRight, Chat, Code, Globe, Grid, Shield } from './Icons';

const ease = [0.22, 1, 0.36, 1] as const;

type Filter = 'All' | Activity['category'];
const FILTERS: Filter[] = ['All', 'Collaboration', 'Browser', 'Development tools', 'Other'];
const ICON: Record<Activity['category'], typeof Chat> = { Collaboration: Chat, Browser: Globe, 'Development tools': Code, Other: Grid };

// Position of an HH:MM time on the 09:00 - 15:00 axis, in 0..100.
const pos = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return ((h * 60 + m - 9 * 60) / (6 * 60)) * 100;
};

export default function DefenderShowcase() {
  const root = useRef<HTMLElement>(null);
  const win = useRef<HTMLDivElement>(null);
  const axis = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const baseLine = useRef<HTMLSpanElement>(null);

  const [filter, setFilter] = useState<Filter>('All');
  const [open, setOpen] = useState<string | null>('a2');
  const [hover, setHover] = useState<string | null>(null);
  const [scrollFocus, setScrollFocus] = useState<string | null>(null);
  const [picked, setPicked] = useState(false); // once the visitor chooses, scroll stops driving the highlight
  const [review, setReview] = useState(false);
  const pickedRef = useRef(false);
  const focusRef = useRef<string | null>(null);

  const visible = ACTIVITIES.filter((a) => filter === 'All' || a.category === filter);
  const selected = ACTIVITIES.find((a) => a.id === open) ?? null;
  const fg = hover ?? (picked ? open : scrollFocus ?? open);

  const choose = (id: string | null) => {
    pickedRef.current = true;
    setPicked(true);
    setOpen(id);
  };
  const pickFilter = (f: Filter) => {
    setFilter(f);
    if (open && f !== 'All' && !ACTIVITIES.find((a) => a.id === open && a.category === f)) setOpen(null);
  };

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();

    const track = (p: number) => {
      // playhead position (0..100) → the segment it is currently inside
      const at = p * 100;
      const hit = ACTIVITIES.find((a) => at >= pos(a.start) && at <= pos(a.end));
      const id = hit ? hit.id : null;
      if (id !== focusRef.current) { focusRef.current = id; if (!pickedRef.current) setScrollFocus(id); }
    };

    mm.add(MQ.desktop, () => {
      gsap.set(win.current, { transformPerspective: 1400, transformOrigin: '50% 0%' });
      gsap.set(q('.seg'), { scaleX: 0, transformOrigin: 'left center' });
      gsap.set(baseLine.current, { scaleX: 0, transformOrigin: 'left center' });
      gsap.set(q('.d-row'), { opacity: 0, y: 30 });
      gsap.set(q('.cat-dot'), { scale: 0.2, opacity: 0.2 });
      gsap.set(head.current, { x: 0, opacity: 0 });

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: win.current, start: 'top 88%', end: 'bottom 10%', scrub: 1,
          onUpdate: (self) => { const p = gsap.utils.clamp(0, 1, (self.progress - 0.3) / 0.7); track(p); } },
      });
      tl.fromTo(win.current, { rotateX: 20, rotateY: -14, y: 70, scale: 0.93 }, { rotateX: 0, rotateY: 0, y: 0, scale: 1, duration: 0.3, ease: 'power2.out' }, 0)
        .to(baseLine.current, { scaleX: 1, duration: 0.25 }, 0.12)
        .to(q('.seg'), { scaleX: 1, duration: 0.12, stagger: 0.07, ease: 'power2.out' }, 0.14)
        .to(q('.cat-dot'), { scale: 1, opacity: 1, duration: 0.07, stagger: 0.06, ease: 'back.out(2)' }, 0.2)
        .to(q('.d-row'), { opacity: 1, y: 0, duration: 0.12, stagger: 0.07, ease: 'power2.out' }, 0.18)
        .to(head.current, { opacity: 1, duration: 0.05 }, 0.3)
        .to(head.current, { x: () => axis.current!.offsetWidth, duration: 0.7 }, 0.3)
        // pivot a few degrees to reveal depth
        .to(win.current, { rotateY: 5, rotateX: 2, duration: 0.35 }, 0.65);
    });

    mm.add(MQ.mobile, () => {
      gsap.set(q('.seg'), { scaleX: 0, transformOrigin: 'left center' });
      gsap.to(q('.seg'), { scaleX: 1, duration: 0.8, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: axis.current, start: 'top 85%' } });
      gsap.from(q('.d-row'), { y: 30, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out', scrollTrigger: { trigger: win.current, start: 'top 75%' } });
    });

    mm.add(MQ.reduced, () => { /* static, fully visible */ });
  }, { scope: root });

  return (
    <section id="defender" ref={root} className="section show show--def" aria-labelledby="def-title">
      <div className="container">
        <div className="show__head">
          <div>
            <p className="eyebrow eyebrow--lime">Anuvadini Defender</p>
            <h2 id="def-title" className="h2">See the workday in context.</h2>
            <p className="lead">Understand recorded activity through a clearer, contextual view of the workday.</p>
          </div>
          <button type="button" className="btn btn--lime" onClick={() => scrollToId('combined')}>Explore Defender <ArrowRight /></button>
        </div>

        <div className="def-layout">
          <div ref={win} className="win">
            <div className="win__bar">
              <i /><i /><i />
              <span className="win__title">Activity timeline · sample day</span>
              <span className="demo-badge" style={{ marginLeft: 'auto' }}>Sample data</span>
            </div>
            <div className="win__body">
              <div className="filters" role="group" aria-label="Filter by category">
                {FILTERS.map((f) => (
                  <button key={f} type="button" className="filter" aria-pressed={filter === f} onClick={() => pickFilter(f)}>
                    {f !== 'All' && <i className="cat-dot" />}{f}
                  </button>
                ))}
              </div>

              <div>
                <div ref={axis} className="axis" role="img" aria-label="Timeline of sample activity between 09:00 and 15:00">
                  <span ref={baseLine} className="axis__line" />
                  {ACTIVITIES.map((a) => {
                    const shown = visible.some((v) => v.id === a.id);
                    const on = fg === a.id;
                    return (
                      <span
                        key={a.id} className="seg" data-on={on} data-shown={shown}
                        style={{ left: `${pos(a.start)}%`, width: `${pos(a.end) - pos(a.start)}%` }}
                      />
                    );
                  })}
                  <span ref={head} className="axis__head" aria-hidden />
                </div>
                <div className="axis__ticks"><span>09:00</span><span>10:00</span><span>11:00</span><span>12:00</span><span>13:00</span><span>14:00</span><span>15:00</span></div>
              </div>

              <ul className="rows">
                <AnimatePresence initial={false}>
                  {visible.map((a) => {
                    const Ico = ICON[a.category];
                    const isSel = open === a.id;
                    const isFg = fg === a.id;
                    return (
                      <motion.li
                        key={a.id} className="row d-row" data-active={isSel} data-fg={isFg} data-dim={fg !== null && !isFg}
                        exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                        onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover(null)}
                      >
                        <button type="button" className="row__btn" aria-pressed={isSel} onClick={() => choose(isSel ? null : a.id)} onFocus={() => setHover(a.id)} onBlur={() => setHover(null)}>
                          <span className="row__ico"><Ico /></span>
                          <span><span className="row__t">{a.category}</span><br /><span className="row__s">{a.app}</span></span>
                          <span className="row__d">{a.start}–{a.end}</span>
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </div>
          </div>

          <aside className="review ctx" aria-live="polite">
            <p className="eyebrow eyebrow--lime">Context</p>
            <AnimatePresence mode="wait">
              {selected ? (
                <motion.div key={selected.id} style={{ transformOrigin: 'top' }} initial={{ opacity: 0, scaleY: 0.9, y: -8 }} animate={{ opacity: 1, scaleY: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.35, ease }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginTop: 10 }}>{selected.category}</h3>
                  <p style={{ color: 'var(--ink-2)', marginTop: 6, fontSize: 14 }}>{selected.note}</p>
                  <dl className="ctx__dl">
                    <dt>Timestamp</dt><dd className="mono">{selected.start} – {selected.end}</dd>
                    <dt>Category</dt><dd>{selected.category}</dd>
                    <dt>Duration</dt><dd className="mono">{selected.duration}</dd>
                  </dl>
                </motion.div>
              ) : (
                <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ color: 'var(--ink-2)', marginTop: 10 }}>
                  Select an entry to see its context.
                </motion.p>
              )}
            </AnimatePresence>
            <p className="ctx__note">Recorded activity is context to read alongside the day. It is not a productivity score, and a single entry is never proof of intent.</p>
            {SHOW_REVIEW_SIGNALS && (
              <>
                <button type="button" className="btn btn--dark btn--sm" style={{ marginTop: 14 }} aria-expanded={review} onClick={() => setReview((r) => !r)}>
                  <Shield style={{ width: 16, height: 16 }} /> {review ? 'Close sample review' : 'Open sample review'}
                </button>
                <AnimatePresence>
                  {review && (
                    <motion.div className="review__card" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease }}>
                      <b>Sample review card</b>
                      A configured category threshold was reached between 14:00 and 14:35. A signal is a prompt to review the activity in context, not a finding.
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
            <p style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-3)' }}>Illustrative only. Actual capabilities depend on how your organisation configures Defender.</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
