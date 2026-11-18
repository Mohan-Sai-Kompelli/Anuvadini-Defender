import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { gsap, useGSAP, MQ } from '../lib/gsap';
import { scrollToId } from '../lib/scroll';
import { useIsDesktop, useReducedMotionPref } from '../hooks/useMedia';
import { ArrowRight } from './Icons';

const HeroOrb = lazy(() => import('./HeroOrb'));

function MiniClock({ min, hour }: { min: React.RefObject<SVGLineElement>; hour: React.RefObject<SVGLineElement> }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      <circle cx="50" cy="50" r="44" fill="none" stroke="#E5E7E3" strokeWidth="4" />
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={i} x1="50" y1="10" x2="50" y2={i % 3 === 0 ? 17 : 14} stroke="#9AA0A8" strokeWidth={i % 3 === 0 ? 3 : 1.6} strokeLinecap="round" transform={`rotate(${i * 30} 50 50)`} />
      ))}
      <line ref={hour} x1="50" y1="50" x2="50" y2="28" stroke="#17191C" strokeWidth="4" strokeLinecap="round" />
      <line ref={min} x1="50" y1="50" x2="50" y2="18" stroke="#315CE8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="50" r="3.5" fill="#B9F36A" />
    </svg>
  );
}

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const bgLight = useRef<HTMLDivElement>(null);
  const bgGrid = useRef<HTMLDivElement>(null);
  const bgShapes = useRef<HTMLDivElement>(null);
  const path = useRef<SVGPathElement>(null);
  const path2 = useRef<SVGPathElement>(null);
  const marker = useRef<SVGCircleElement>(null);
  const hourHand = useRef<SVGLineElement>(null);
  const minHand = useRef<SVGLineElement>(null);
  const clockS = useRef<HTMLDivElement>(null);
  const clockP = useRef<HTMLDivElement>(null);
  const clockE = useRef<HTMLDivElement>(null);
  const attS = useRef<HTMLDivElement>(null);
  const attP = useRef<HTMLDivElement>(null);
  const attE = useRef<HTMLDivElement>(null);
  const defS = useRef<HTMLDivElement>(null);
  const defP = useRef<HTMLDivElement>(null);
  const defE = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLDivElement>(null);
  const extraAtt = useRef<HTMLDivElement>(null);
  const extraDef = useRef<HTMLDivElement>(null);

  const reduced = useReducedMotionPref();
  const desktop = useIsDesktop();
  const [orbOn, setOrbOn] = useState(false);

  // WebGL only renders while the hero is on screen.
  useEffect(() => {
    if (!root.current) return;
    const io = new IntersectionObserver(([e]) => setOrbOn(e.isIntersecting), { threshold: 0.02 });
    io.observe(root.current);
    return () => io.disconnect();
  }, []);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const setHands = () => {
      const d = new Date();
      const m = d.getMinutes() + d.getSeconds() / 60;
      const h = (d.getHours() % 12) + m / 60;
      gsap.set(minHand.current, { rotation: m * 6, svgOrigin: '50 50' });
      gsap.set(hourHand.current, { rotation: h * 30, svgOrigin: '50 50' });
    };
    setHands();
    gsap.set([path.current, path2.current], { strokeDasharray: 1, strokeDashoffset: 1 });

    const mm = gsap.matchMedia();

    // ───────── Initial entrance (time based, plays once on load) ─────────
    const entrance = () => {
      gsap.set(q('.h-eyebrow'), { opacity: 0, letterSpacing: '0.5em' });
      gsap.set(q('.h-line'), { yPercent: 112 });
      gsap.set(q('.h-sub'), { opacity: 0, y: 18, filter: 'blur(8px)' });
      gsap.set(q('.h-labels > *'), { opacity: 0, y: 14 });
      gsap.set(q('.h-cta-a'), { opacity: 0, x: -34 });
      gsap.set(q('.h-cta-b'), { opacity: 0, x: 34 });
      gsap.set(clockE.current, { scale: 0.3, rotation: -120, opacity: 0 });
      gsap.set(attE.current, { x: -140, opacity: 0, rotateY: 26, transformPerspective: 1100 });
      gsap.set(defE.current, { x: 140, opacity: 0, rotateY: -26, transformPerspective: 1100 });
      gsap.set(orb.current, { scale: 0.6, opacity: 0 });
      gsap.set(q('.h-ind'), { scale: 0.3, opacity: 0.2 });
      gsap.set(bgLight.current, { scale: 0.55, opacity: 0, transformOrigin: '50% 50%' });
      gsap.set(q('.hero__extra'), { opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to(bgLight.current, { scale: 1, opacity: 1, duration: 1.6, ease: 'power2.out' }, 0)
        .to(q('.h-eyebrow'), { opacity: 1, letterSpacing: '0.16em', duration: 0.8 }, 0.3)
        .to(q('.h-line'), { yPercent: 0, duration: 1.0, stagger: 0.14 }, 0.45)
        .to(q('.h-sub'), { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9 }, 0.85)
        .to(q('.h-labels > *'), { opacity: 1, y: 0, duration: 0.6, stagger: 0.1 }, 0.95)
        .to(q('.h-cta-a'), { opacity: 1, x: 0, duration: 0.8 }, 1.0)
        .to(q('.h-cta-b'), { opacity: 1, x: 0, duration: 0.8 }, 1.08)
        .to(clockE.current, { scale: 1, rotation: 0, opacity: 1, duration: 1.1, ease: 'back.out(1.5)' }, 1.1)
        .to(orb.current, { scale: 1, opacity: 1, duration: 1.3 }, 1.15)
        .to(attE.current, { x: 0, opacity: 1, rotateY: 0, duration: 1.2 }, 1.25)
        .to(defE.current, { x: 0, opacity: 1, rotateY: 0, duration: 1.2 }, 1.45)
        .to(path.current, { strokeDashoffset: 0.55, duration: 1.2, ease: 'power2.inOut' }, 1.7)
        .to(path2.current, { strokeDashoffset: 0.4, duration: 1.2, ease: 'power2.inOut' }, 1.8)
        .to(q('.h-ind'), { scale: 1, opacity: 1, duration: 0.5, stagger: 0.12, ease: 'back.out(2)' }, 2.0);
      gsap.fromTo(q('.hero__bar'), { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'power3.out', stagger: 0.1, delay: 1.7 });
    };

    mm.add(MQ.desktop, () => {
      entrance();

      // ───────── Scroll-linked choreography (~170vh, scrubbed, reversible) ─────────
      const scroll = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: root.current, start: 'top top', end: '+=170%', pin: pin.current, scrub: 1, anticipatePin: 1 },
      });
      const sw = () => stage.current!.offsetWidth;
      scroll
        .to(left.current, { y: -150, scaleY: 0.86, opacity: 0.08, transformOrigin: '0% 0%', duration: 0.8 }, 0)
        .to(clockS.current, { scale: 1.3, y: 6, duration: 1 }, 0)
        .fromTo(attS.current, { rotateY: 18, x: 0 }, { rotateY: -2, x: () => sw() * 0.07, y: -6, scale: 1.05, duration: 1 }, 0)
        .fromTo(defS.current, { rotateY: -18, x: 0 }, { rotateY: 2, x: () => -sw() * 0.09, y: 8, scale: 1.05, duration: 1 }, 0)
        .to([extraAtt.current, extraDef.current], { opacity: 1, duration: 0.4 }, 0.35)
        .to(path.current, { strokeDashoffset: 0, duration: 0.8 }, 0.2)
        .to(path2.current, { strokeDashoffset: 0, duration: 0.8 }, 0.25)
        .to(marker.current, { motionPath: { path: path.current!, align: path.current!, alignOrigin: [0.5, 0.5] }, duration: 0.9, opacity: 1 }, 0.2)
        .to(bgLight.current, { y: -90, scale: 1.18, duration: 1.2 }, 0)
        .to(bgGrid.current, { y: -160, duration: 1.2 }, 0)
        .to(bgShapes.current, { y: -300, duration: 1.2 }, 0)
        .to(content.current, { scale: 0.88, y: -34, duration: 0.45 }, 0.9);

      // Pointer parallax (fine pointers only)
      if (window.matchMedia('(pointer: fine)').matches) {
        const layers: [HTMLElement | null, number][] = [[clockP.current, 14], [attP.current, 7], [defP.current, 9], [orb.current, 22]];
        const fx = layers.map(([el, d]) => ({
          d,
          rx: gsap.quickTo(el, 'rotateX', { duration: 0.9, ease: 'power3.out' }),
          ry: gsap.quickTo(el, 'rotateY', { duration: 0.9, ease: 'power3.out' }),
          x: gsap.quickTo(el, 'x', { duration: 1, ease: 'power3.out' }),
          y: gsap.quickTo(el, 'y', { duration: 1, ease: 'power3.out' }),
        }));
        const move = (e: PointerEvent) => {
          const r = stage.current!.getBoundingClientRect();
          const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
          const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
          fx.forEach((f) => { f.ry(nx * f.d * 0.5); f.rx(-ny * f.d * 0.4); f.x(nx * f.d); f.y(ny * f.d * 0.6); });
        };
        const leave = () => fx.forEach((f) => { f.ry(0); f.rx(0); f.x(0); f.y(0); });
        const st = stage.current!;
        window.addEventListener('pointermove', move);
        st.addEventListener('pointerleave', leave);
        return () => { window.removeEventListener('pointermove', move); st.removeEventListener('pointerleave', leave); };
      }
    });

    mm.add(MQ.mobile, () => {
      entrance();
      // light parallax on phones, no pinning
      gsap.to(stage.current, { y: -30, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to([path.current, path2.current], { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true } });
    });

    mm.add(MQ.reduced, () => {
      gsap.set([path.current, path2.current], { strokeDashoffset: 0 });
      gsap.set(q('.hero__extra'), { opacity: 1 });
    });
  }, { scope: root });

  return (
    <section id="home" ref={root} className="hero" aria-labelledby="hero-title">
      <div ref={pin} className="hero__pin">
        <div className="hl" aria-hidden>
          <div ref={bgLight} className="hl-light" />
          <div ref={bgGrid} className="hl-grid" />
          <div ref={bgShapes} className="hl-shapes">
            <span style={{ right: '3%', top: '16%', width: 54, height: 54 }} />
            <span style={{ left: '47%', top: '90%', width: 40, height: 40 }} />
            <span style={{ right: '9%', top: '84%', width: 74, height: 74 }} />
          </div>
        </div>

        <div ref={content} className="container hero__grid">
          <div ref={left} className="hero__left">
            <p className="eyebrow h-eyebrow">Attendance + Defender</p>
            <h1 id="hero-title" className="hero__title">
              <span className="mask"><span className="h-line">Every workday.</span></span>
              <span className="mask"><span className="h-line accent">In focus.</span></span>
            </h1>
            <p className="hero__copy h-sub">Attendance clarity and workday visibility, designed to work together.</p>
            <div className="h-labels">
              <span className="plabel"><i className="dot" />Anuvadini Attendance</span>
              <span className="plabel plabel--lime"><i className="dot dot--lime" />Anuvadini Defender</span>
            </div>
            <div className="hero__cta">
              <button type="button" className="btn btn--primary h-cta-a" onClick={() => scrollToId('workday')}>
                Explore the experience <ArrowRight />
              </button>
              <button type="button" className="btn btn--ghost h-cta-b" onClick={() => scrollToId('how')}>
                See how it works <ArrowRight />
              </button>
            </div>
            <p className="hero__note">Product visuals on this page use illustrative sample data.</p>
          </div>

          <div ref={stage} className="hero__stage" aria-hidden="true">
            <div ref={orb} className="hero__orb">
              {desktop && !reduced && (
                <Suspense fallback={null}>
                  <HeroOrb active={orbOn} />
                </Suspense>
              )}
            </div>

            <svg className="hero__lines" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="hl-grad" x1="0" x2="1">
                  <stop offset="0" stopColor="#315CE8" />
                  <stop offset="1" stopColor="#B9F36A" />
                </linearGradient>
              </defs>
              <path ref={path} pathLength={1} d="M40 36 C 56 32, 56 56, 66 68" fill="none" stroke="url(#hl-grad)" strokeWidth="0.5" strokeLinecap="round" />
              <path ref={path2} pathLength={1} d="M52 14 C 58 26, 46 28, 40 34" fill="none" stroke="#315CE8" strokeOpacity=".45" strokeWidth="0.35" strokeLinecap="round" />
              <circle ref={marker} cx="40" cy="36" r="1.1" fill="#B9F36A" stroke="#385D27" strokeWidth="0.25" opacity="0" />
            </svg>

            <div ref={clockS} className="hs hs-clock">
              <div ref={clockP} className="hp">
                <div ref={clockE} className="hero__clock"><MiniClock min={minHand} hour={hourHand} /></div>
              </div>
            </div>

            <div ref={attS} className="hs hs-att">
              <div ref={attP} className="hp">
                <div ref={attE} className="fcard fcard--att">
                  <div className="fcard__head"><span><i className="dot" />Attendance</span><span className="demo-badge">Sample</span></div>
                  <div className="ring-row">
                    <svg width="64" height="64" viewBox="0 0 68 68">
                      <circle cx="34" cy="34" r="28" fill="none" stroke="#EAF0FF" strokeWidth="8" />
                      <circle cx="34" cy="34" r="28" fill="none" stroke="#315CE8" strokeWidth="8" strokeLinecap="round" strokeDasharray="176" strokeDashoffset="38" transform="rotate(-90 34 34)" />
                    </svg>
                    <div><strong>Present today</strong><span>Check-ins and hours at a glance</span></div>
                  </div>
                  <ul className="mini-list">
                    <li><span><i className="ind h-ind" />Check-in</span><em>09:02</em></li>
                    <li><span><i className="ind h-ind" />Working hours</span><em>7h 48m</em></li>
                    <li><span><i className="ind h-ind" />Status</span><em>On time</em></li>
                  </ul>
                  <div ref={extraAtt} className="hero__extra">
                    <p className="hero__xlabel">This week (illustrative)</p>
                    <div className="mini-bars">
                      {[0.9, 0.78, 0.95, 0.7, 0.84].map((v, i) => <i key={i} style={{ height: `${v * 100}%` }} />)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div ref={defS} className="hs hs-def">
              <div ref={defP} className="hp">
                <div ref={defE} className="fcard fcard--def">
                  <div className="fcard__head"><span><i className="dot dot--lime" />Defender</span><span className="demo-badge">Sample</span></div>
                  <div className="bars">
                    {[['Collaboration', 0.72], ['Browser', 0.45], ['Dev tools', 0.9], ['Other', 0.3]].map(([l, v]) => (
                      <div className="bar" key={String(l)}>
                        <span>{l}</span>
                        <i><b className="hero__bar" style={{ width: `${Number(v) * 100}%` }} /></i>
                      </div>
                    ))}
                  </div>
                  <div ref={extraDef} className="hero__extra">
                    <p className="hero__xlabel">Recorded timeline (sample)</p>
                    <div className="strip"><i style={{ left: '4%', width: '24%' }} /><i style={{ left: '30%', width: '38%' }} /><i style={{ left: '72%', width: '18%' }} /></div>
                    <p className="hero__ctx"><i className="ind h-ind" />Context: development tools, 10:10 to 12:20</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
