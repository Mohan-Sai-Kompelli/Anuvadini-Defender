import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { gsap, ScrollTrigger, useGSAP, MQ } from '../lib/gsap';
import { scrollToId } from '../lib/scroll';
import { buildMonth, type DayCell } from '../data';
import { ArrowRight, Check } from './Icons';

const ease = [0.22, 1, 0.36, 1] as const;
const view = { once: true, margin: '-60px' } as const;
const pad = (n: number) => String(n).padStart(2, '0');
const STATUS_LABEL: Record<string, string> = { present: 'Present', late: 'Late', leave: 'On leave', absent: 'Absent', off: 'Weekend' };

type DemoState = 'ontime' | 'late' | 'leave';
const STATES: Record<DemoState, { label: string; pct: number; status: string; checkIn: string; hours: string }> = {
  ontime: { label: 'On time', pct: 94, status: 'On time', checkIn: '09:02', hours: '7h 48m' },
  late: { label: 'Late', pct: 81, status: 'Late', checkIn: '09:41', hours: '7h 05m' },
  leave: { label: 'On leave', pct: 100, status: 'On leave', checkIn: '-', hours: '-' },
};
const C = 2 * Math.PI * 52;

function AnalogClock() {
  const hour = useRef<SVGLineElement>(null);
  const min = useRef<SVGLineElement>(null);
  const sec = useRef<SVGLineElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const d = new Date();
      const s = d.getSeconds() + d.getMilliseconds() / 1000;
      const m = d.getMinutes() + s / 60;
      const h = (d.getHours() % 12) + m / 60;
      hour.current?.setAttribute('transform', `rotate(${h * 30} 100 100)`);
      min.current?.setAttribute('transform', `rotate(${m * 6} 100 100)`);
      sec.current?.setAttribute('transform', `rotate(${s * 6} 100 100)`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="clock" aria-hidden>
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="92" fill="#fff" stroke="#E5E7E3" strokeWidth="6" />
        {Array.from({ length: 60 }).map((_, i) => (
          <line key={i} x1="100" y1="14" x2="100" y2={i % 5 === 0 ? 26 : 20} stroke={i % 5 === 0 ? '#17191C' : '#D3D6D0'} strokeWidth={i % 5 === 0 ? 3 : 1.4} strokeLinecap="round" transform={`rotate(${i * 6} 100 100)`} />
        ))}
        <line ref={hour} x1="100" y1="100" x2="100" y2="58" stroke="#17191C" strokeWidth="6" strokeLinecap="round" />
        <line ref={min} x1="100" y1="100" x2="100" y2="34" stroke="#315CE8" strokeWidth="4.5" strokeLinecap="round" />
        <line ref={sec} x1="100" y1="112" x2="100" y2="26" stroke="#385D27" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="100" cy="100" r="6" fill="#B9F36A" stroke="#17191C" strokeWidth="2" />
      </svg>
    </div>
  );
}

function DigitalTime({ date }: { date: Date }) {
  const parts = [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())];
  return (
    <div className="clock__time" aria-label={`Current local time ${parts.join(':')}`}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="colon" aria-hidden>:</span>}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={p} style={{ display: 'inline-block' }} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.22 }}>{p}</motion.span>
          </AnimatePresence>
        </span>
      ))}
    </div>
  );
}

function CalendarView() {
  const today = useMemo(() => new Date(), []);
  const cells = useMemo(() => buildMonth(today.getFullYear(), today.getMonth()), [today]);
  const [sel, setSel] = useState<DayCell | null>(() => cells.find((c) => c && c.d === today.getDate() && c.s !== 'off') ?? cells.find((c) => c && c.s === 'present') ?? null);
  return (
    <div>
      <motion.div className="cal__grid" initial="h" whileInView="s" viewport={view} variants={{ h: {}, s: { transition: { staggerChildren: 0.012, delayChildren: 0.15 } } }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="cal__dow">{d}</div>)}
        {cells.map((c, i) =>
          c ? (
            <motion.button
              key={i} type="button" className="cal__cell" data-s={c.s} disabled={c.s === 'off'} aria-pressed={sel?.d === c.d}
              aria-label={`${c.d}: ${STATUS_LABEL[c.s]}`} onClick={() => setSel(c)}
              variants={{ h: { opacity: 0, scale: 0.6 }, s: { opacity: 1, scale: 1 } }} whileTap={{ scale: 0.92 }}
            >{c.d}</motion.button>
          ) : <div key={i} />,
        )}
      </motion.div>
      <div className="cal__detail" aria-live="polite">
        <AnimatePresence mode="wait">
          {sel && (
            <motion.div key={sel.d} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <b>{today.toLocaleDateString([], { month: 'short' })} {sel.d} · {STATUS_LABEL[sel.s]}</b>
              <div className="mono">Hours: {sel.hours}</div>
              <div style={{ color: 'var(--ink-2)' }}>{sel.note}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function AttendanceShowcase() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const sheen = useRef<HTMLSpanElement>(null);
  const cal = useRef<HTMLDivElement>(null);
  const hist = useRef<HTMLDivElement>(null);
  const team = useRef<HTMLDivElement>(null);
  const chart = useRef<HTMLDivElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const pctEl = useRef<HTMLElement>(null);
  const counter = useRef({ v: 0 });

  const [demo, setDemo] = useState<DemoState>('ontime');
  const [check, setCheck] = useState<'idle' | 'loading' | 'done'>('idle');
  const [stamp, setStamp] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [report, setReport] = useState(false);
  const activated = useRef(false);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // animate the ring + counter to the current illustrative state (after first activation)
  useEffect(() => {
    if (!activated.current) return;
    const target = STATES[demo].pct;
    gsap.to(ring.current, { strokeDashoffset: C * (1 - target / 100), duration: 0.9, ease: 'power2.inOut' });
    gsap.to(counter.current, { v: target, duration: 0.9, ease: 'power2.out', onUpdate: () => { if (pctEl.current) pctEl.current.textContent = String(Math.round(counter.current.v)); } });
  }, [demo]);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    gsap.set(ring.current, { strokeDasharray: C, strokeDashoffset: C });

    const activate = () => {
      activated.current = true;
      const target = STATES.ontime.pct;
      gsap.to(ring.current, { strokeDashoffset: C * (1 - target / 100), duration: 1.4, ease: 'power2.inOut' });
      gsap.to(counter.current, { v: target, duration: 1.4, ease: 'power2.out', onUpdate: () => { if (pctEl.current) pctEl.current.textContent = String(Math.round(counter.current.v)); } });
    };
    // runs once when the dashboard first comes into view
    const st = { trigger: stage.current, start: 'top 70%', once: true, onEnter: activate };

    mm.add(MQ.desktop, () => {
      gsap.set(stage.current, { perspective: 1400 });
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: stage.current, start: 'top 88%', end: 'bottom 12%', scrub: 1 },
      });
      // 1) the main dashboard rotates toward the viewer
      tl.fromTo(main.current, { rotateX: 24, rotateY: -16, y: 70, scale: 0.92 }, { rotateX: 0, rotateY: 0, y: 0, scale: 1, duration: 0.34, ease: 'power2.out' }, 0)
        .fromTo(sheen.current, { xPercent: -140 }, { xPercent: 160, duration: 0.3 }, 0.24)
        // 2) smaller panels emerge from behind it
        .fromTo(cal.current, { x: 260, y: 40, scale: 0.78, opacity: 0, rotateY: 22 }, { x: 0, y: 0, scale: 1, opacity: 1, rotateY: 0, duration: 0.3, ease: 'power3.out' }, 0.1)
        .fromTo(team.current, { x: -260, y: 40, scale: 0.78, opacity: 0, rotateY: -22 }, { x: 0, y: 0, scale: 1, opacity: 1, rotateY: 0, duration: 0.3, ease: 'power3.out' }, 0.14)
        .fromTo(hist.current, { x: 220, y: 80, scale: 0.8, opacity: 0 }, { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.3, ease: 'power3.out' }, 0.2)
        .fromTo(chart.current, { x: -220, y: 80, scale: 0.8, opacity: 0, rotateY: -30 }, { x: 0, y: 0, scale: 1, opacity: 1, rotateY: 0, duration: 0.3, ease: 'power3.out' }, 0.24)
        // 3) deeper into the section: depth shifts
        .to(cal.current, { scale: 1.07, y: -16, duration: 0.3 }, 0.68)
        .to(main.current, { scale: 0.955, duration: 0.3 }, 0.68)
        .to(chart.current, { rotateY: -12, scale: 1.04, duration: 0.3 }, 0.7)
        .to([team.current, hist.current], { opacity: 0.82, scale: 0.97, duration: 0.3 }, 0.7);
      ScrollTrigger.create(st);
    });

    mm.add(MQ.mobile, () => {
      gsap.utils.toArray<HTMLElement>([main.current, cal.current, team.current, chart.current, hist.current]).forEach((el) => {
        gsap.from(el, { y: 36, opacity: 0, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none reverse' } });
      });
      ScrollTrigger.create(st);
    });

    mm.add(MQ.reduced, () => {
      activate();
    });

  }, { scope: root });

  const press = () => {
    if (check !== 'idle') { setCheck('idle'); return; }
    setCheck('loading');
    window.setTimeout(() => {
      const d = new Date();
      setStamp(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
      setCheck('done');
    }, 900);
  };

  const s = STATES[demo];
  const week: [string, number][] = [['Mon', 0.9], ['Tue', 0.78], ['Wed', 0.95], ['Thu', 0.7], ['Fri', 0.84]];

  return (
    <section id="attendance" ref={root} className="section show show--att" aria-labelledby="att-title">
      <div className="container">
        <div className="show__head">
          <div>
            <p className="eyebrow">Anuvadini Attendance</p>
            <h2 id="att-title" className="h2">Attendance, without the guesswork.</h2>
            <p className="lead">Bring check-ins, attendance records, team visibility, and summaries into a clearer workday experience.</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => scrollToId('how')}>Explore Attendance <ArrowRight /></button>
        </div>

        <div ref={stage} className="att-stage">
          <div ref={cal} className="panel a-cal">
            <div className="cal__top"><div><h3>{now.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h3><p className="panel__sub">Attendance calendar</p></div><span className="demo-badge">Illustrative</span></div>
            <CalendarView />
          </div>

          <div ref={main} className="panel a-main">
            <span ref={sheen} className="sheen" aria-hidden />
            <div className="cal__top">
              <div><h3>Today</h3><p className="panel__sub">Your attendance, at a glance</p></div>
              <span className="demo-badge">Demo</span>
            </div>
            <div className="view-tabs" role="group" aria-label="Illustrative attendance state" style={{ marginBottom: 18 }}>
              {(Object.keys(STATES) as DemoState[]).map((k) => (
                <button key={k} type="button" className="view-tab" aria-pressed={demo === k} aria-selected={demo === k} onClick={() => setDemo(k)}>
                  {demo === k && <motion.span layoutId="att-state" className="pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                  {STATES[k].label}
                </button>
              ))}
            </div>

            <div className="a-main__grid">
              <div className="a-ring">
                <svg viewBox="0 0 120 120" aria-hidden>
                  <circle cx="60" cy="60" r="52" fill="none" stroke="#EAF0FF" strokeWidth="11" />
                  <circle ref={ring} cx="60" cy="60" r="52" fill="none" stroke="#315CE8" strokeWidth="11" strokeLinecap="round" transform="rotate(-90 60 60)" />
                </svg>
                <div className="a-ring__num"><strong><span ref={pctEl}>0</span>%</strong><span>this month (demo)</span></div>
              </div>

              <div className="a-clock">
                <AnalogClock />
                <DigitalTime date={now} />
              </div>

              <div className="a-status">
                <ul className="mini-list" style={{ marginTop: 0 }}>
                  <li><span>Status</span><AnimatePresence mode="wait" initial={false}><motion.em key={demo} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{s.status}</motion.em></AnimatePresence></li>
                  <li><span>Check-in</span><em>{s.checkIn}</em></li>
                  <li><span>Working hours</span><em>{s.hours}</em></li>
                </ul>
                <button type="button" className={`btn ${check === 'done' ? 'btn--lime' : 'btn--primary'}`} style={{ width: '100%', marginTop: 14 }} onClick={press} disabled={check === 'loading'}>
                  {check === 'loading' && <><span className="spinner" /> Checking in…</>}
                  {check === 'idle' && <>Demo check-in <ArrowRight /></>}
                  {check === 'done' && <><Check /> Simulated · tap to reset</>}
                </button>
                <AnimatePresence>
                  {check === 'done' && (
                    <motion.div className="confirm" role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <b>Simulated check-in at {stamp}</b>
                      A demo interaction. No real attendance event was recorded.
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div ref={team} className="panel a-team">
            <div className="cal__top" style={{ marginBottom: 0 }}><div><h3>Team overview</h3><p className="panel__sub">Today at a glance</p></div><span className="demo-badge">Sample</span></div>
            <div className="team">
              {[['stat--b', '38', 'Present'], ['stat--a', '3', 'Late'], ['stat--l', '2', 'On leave']].map(([c, n, l], i) => (
                <motion.div key={l} className={`stat ${c}`} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={view} transition={{ delay: 0.25 + i * 0.1, duration: 0.6, ease }}>
                  <strong>{n}</strong><span>{l}</span>
                </motion.div>
              ))}
            </div>
          </div>

          <div ref={chart} className="panel a-chart">
            <div className="cal__top" style={{ marginBottom: 0 }}><div><h3>Summary</h3><p className="panel__sub">Share present, by weekday</p></div><span className="demo-badge">Illustrative</span></div>
            <div className="rbars" role="img" aria-label="Bar chart of illustrative weekly attendance">
              {week.map(([d, v], i) => (
                <div className="rbar" key={d}>
                  <motion.i style={{ height: `${v * 100}%` }} initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={view} transition={{ duration: 0.9, delay: 0.2 + i * 0.08, ease }} />
                  {d}
                </div>
              ))}
            </div>
            <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 12 }} aria-expanded={report} onClick={() => setReport((r) => !r)}>
              {report ? 'Close report' : 'Open report'}
            </button>
            <AnimatePresence initial={false}>
              {report && (
                <motion.table className="report" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease }}>
                  <tbody>
                    {week.map(([d, v]) => (<tr key={d}><td>{d}</td><td className="mono">{Math.round(v * 100)}% present</td></tr>))}
                  </tbody>
                </motion.table>
              )}
            </AnimatePresence>
          </div>

          <div ref={hist} className="panel a-hist">
            <div className="cal__top" style={{ marginBottom: 0 }}><div><h3>History</h3><p className="panel__sub">Recent days</p></div><span className="demo-badge">Sample</span></div>
            <ul className="recent">
              {[['Mon', '08:58', 'On time'], ['Tue', '09:21', 'Late'], ['Wed', '09:00', 'On time']].map(([d, t, st]) => (
                <li key={d}><span><i />{d}</span><span className="mono">{t} · {st}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
