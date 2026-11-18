import { useRef } from 'react';
import { gsap, useGSAP, MQ } from '../lib/gsap';
import { scrollToId } from '../lib/scroll';
import { PORTAL_URL } from '../config';
import { useIsDesktop, useReducedMotionPref } from '../hooks/useMedia';
import { ArrowRight } from './Icons';

const MARKERS = [
  { t: '09:00', x: 12 },
  { t: '11:00', x: 31 },
  { t: '13:00', x: 50 },
  { t: '15:00', x: 69 },
  { t: '17:30', x: 88 },
];

const CURVED = 'M120 330 C 320 250, 680 390, 880 330';
const STRAIGHT = 'M120 330 C 320 330, 680 330, 880 330';

export default function CombinedScene() {
  const root = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const att = useRef<HTMLDivElement>(null);
  const def = useRef<HTMLDivElement>(null);
  const trackPath = useRef<SVGPathElement>(null);
  const fillPath = useRef<SVGPathElement>(null);
  const marker = useRef<SVGCircleElement>(null);
  const veilIn = useRef<HTMLDivElement>(null);
  const veilOut = useRef<HTMLDivElement>(null);
  const glowL = useRef<HTMLDivElement>(null);
  const glowR = useRef<HTMLDivElement>(null);
  const shapes = useRef<HTMLDivElement>(null);
  const titleBlock = useRef<HTMLDivElement>(null);
  const t1 = useRef<HTMLHeadingElement>(null);
  const t2 = useRef<HTMLParagraphElement>(null);
  const msg = useRef<HTMLDivElement>(null);
  const link = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLDivElement>(null);

  const desktop = useIsDesktop();
  const reduced = useReducedMotionPref();
  const staticMode = !desktop || reduced;

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();

    mm.add(MQ.desktop, () => {
      const sw = () => stage.current!.offsetWidth;
      const pw = () => att.current!.offsetWidth;

      gsap.set([att.current, def.current], { xPercent: -50, yPercent: -50, top: '44%', left: '50%', transformPerspective: 1300, opacity: 0 });
      gsap.set(att.current, { x: () => -(sw() / 2 + pw() * 0.1), rotateY: 40 });
      gsap.set(def.current, { x: () => sw() / 2 + pw() * 0.1, rotateY: -40 });
      gsap.set(fillPath.current, { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.set([trackPath.current, fillPath.current], { attr: { d: CURVED } });
      gsap.set(marker.current, { opacity: 0 });
      gsap.set(q('.combo__marker'), { opacity: 0, y: 14 });
      gsap.set(q('.t1-line'), { yPercent: 115 });
      gsap.set(t2.current, { opacity: 0, y: 24 });
      gsap.set(msg.current, { opacity: 0, y: 28 });
      gsap.set(link.current, { opacity: 0, scaleX: 0 });
      gsap.set(q('.cp-ind'), { scale: 0.3, opacity: 0.25 });
      gsap.set(q('.state-b'), { opacity: 0 });
      gsap.set(tail.current, { scaleY: 0, transformOrigin: 'top' });
      gsap.set(veilIn.current, { opacity: 1 });
      gsap.set(veilOut.current, { opacity: 0 });
      gsap.set([glowL.current, glowR.current], { opacity: 0 });

      const ring = q('.cp-ring');

      // One master timeline: 100 units == 100% of the scroll distance, labelled by stage.
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: root.current, start: 'top top', end: '+=360%', pin: pin.current, scrub: 1, anticipatePin: 1, invalidateOnRefresh: true },
      });
      tl.addLabel('enter', 0).addLabel('depth', 15).addLabel('connect', 35).addLabel('converge', 55).addLabel('reveal', 75).addLabel('exit', 90);

      // 0–15 · enter the cinematic world
      tl.to(veilIn.current, { opacity: 0, duration: 13 }, 'enter')
        .to(q('.t1-line'), { yPercent: 0, duration: 10, stagger: 2, ease: 'power3.out' }, 'enter+=2')
        .to([att.current, def.current], { opacity: 0.6, duration: 8 }, 'enter+=2')
        .to(att.current, { x: () => -(sw() / 2 - pw() / 2) , rotateY: 32, duration: 13, ease: 'power2.out' }, 'enter+=1')
        .to(def.current, { x: () => sw() / 2 - pw() / 2, rotateY: -32, duration: 13, ease: 'power2.out' }, 'enter+=1')
        .to([glowL.current, glowR.current], { opacity: 0.5, duration: 14 }, 'enter')
        // 15–35 · establish depth
        .to(att.current, { x: () => -(sw() * 0.27), rotateY: 20, opacity: 1, duration: 20, ease: 'power2.inOut' }, 'depth')
        .to(def.current, { x: () => sw() * 0.27, rotateY: -20, opacity: 1, duration: 20, ease: 'power2.inOut' }, 'depth')
        .to(stage.current, { scale: 1.06, duration: 20 }, 'depth')
        .to([glowL.current, glowR.current], { opacity: 0.9, duration: 20 }, 'depth')
        // 35–55 · connect the systems
        .to(fillPath.current, { strokeDashoffset: 0, duration: 20 }, 'connect')
        .to(marker.current, { opacity: 1, duration: 1 }, 'connect')
        .to(marker.current, { motionPath: { path: fillPath.current!, align: fillPath.current!, alignOrigin: [0.5, 0.5] }, duration: 20 }, 'connect')
        .to(q('.combo__marker'), { opacity: 1, y: 0, duration: 4, stagger: 3.5, ease: 'power2.out' }, 'connect+=1')
        .to(q('.cp-ind'), { scale: 1, opacity: 1, duration: 4, stagger: 2.2, ease: 'back.out(2)' }, 'connect+=2')
        .to(q('.state-a'), { opacity: 0, duration: 4 }, 'connect+=9')
        .to(q('.state-b'), { opacity: 1, duration: 4 }, 'connect+=10')
        .to(ring, { strokeDashoffset: 18, duration: 10 }, 'connect+=4')
        // 55–75 · converge
        .to(att.current, { x: () => -(pw() / 2 + 18), rotateY: 5, duration: 20, ease: 'power2.inOut' }, 'converge')
        .to(def.current, { x: () => pw() / 2 + 18, rotateY: -5, duration: 20, ease: 'power2.inOut' }, 'converge')
        .to([trackPath.current, fillPath.current], { attr: { d: STRAIGHT }, duration: 20, ease: 'power2.inOut' }, 'converge')
        .to(shapes.current, { scale: 0.7, duration: 20 }, 'converge')
        .to(titleBlock.current, { y: -26, scale: 0.94, duration: 20 }, 'converge')
        .to(t1.current, { opacity: 0, y: -16, duration: 8, ease: 'power2.in' }, 'converge+=12')
        .to(t2.current, { opacity: 1, y: 0, duration: 10, ease: 'power2.out' }, 'converge+=17')
        // 75–90 · reveal the message (motion deliberately slows)
        .to(att.current, { rotateY: 0, duration: 15, ease: 'sine.out' }, 'reveal')
        .to(def.current, { rotateY: 0, duration: 15, ease: 'sine.out' }, 'reveal')
        .to(link.current, { opacity: 1, scaleX: 1, duration: 8, ease: 'power2.out' }, 'reveal+=2')
        .to(q('.cpanel li:first-child'), { backgroundColor: 'rgba(185, 243, 106, 0.16)', boxShadow: 'inset 0 0 0 1px rgba(185, 243, 106, 0.5)', duration: 8 }, 'reveal+=3')
        .to(msg.current, { opacity: 1, y: 0, duration: 11, ease: 'power2.out' }, 'reveal+=3')
        // 90–100 · exit, handing the line to the next section
        .to([att.current, def.current], { y: -70, scale: 0.9, duration: 10, ease: 'power2.in' }, 'exit')
        .to(tail.current, { scaleY: 1, duration: 10 }, 'exit')
        .to(veilOut.current, { opacity: 1, duration: 10 }, 'exit');
    });

    // Phones and tablets: no pinning, a lighter story that still reads top to bottom.
    mm.add(MQ.mobile, () => {
      gsap.from(q('.t1-line'), { yPercent: 115, duration: 0.9, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: titleBlock.current, start: 'top 85%' } });
      [att.current, def.current].forEach((el, i) => {
        gsap.from(el, { x: i ? 40 : -40, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' } });
      });
      gsap.from(msg.current, { y: 24, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: msg.current, start: 'top 90%' } });
    });

    mm.add(MQ.reduced, () => { /* the final composition is shown directly */ });
  }, { scope: root, dependencies: [staticMode] });

  return (
    <section id="combined" ref={root} className={`combo ${staticMode ? 'combo--static' : ''}`} aria-labelledby="combo-title">
      <div ref={pin} className="combo__pin">
        <div className="combo__bg" aria-hidden>
          <div ref={glowL} className="combo__glow combo__glow--l" />
          <div ref={glowR} className="combo__glow combo__glow--r" />
          <div ref={shapes} className="combo__shapes">
            <span style={{ left: '7%', top: '14%', width: 70, height: 70 }} />
            <span style={{ right: '9%', top: '70%', width: 48, height: 48 }} />
            <span style={{ left: '48%', top: '6%', width: 28, height: 28 }} />
            <span style={{ left: '16%', top: '78%', width: 36, height: 36 }} />
          </div>
        </div>
        <div ref={veilIn} className="combo__veil" aria-hidden />

        <div className="container combo__content">
          <div ref={titleBlock} className="center combo__titleblock">
            <p className="eyebrow" style={{ color: 'var(--lime)' }}>The full picture</p>
            <div className="combo__titlewrap">
              <h2 id="combo-title" ref={t1} className="h2 combo__title1">
                <span className="mask"><span className="t1-line">Two products.</span></span>
                <span className="mask"><span className="t1-line">One clearer workday.</span></span>
              </h2>
              <p ref={t2} className="h2 combo__title2" aria-hidden>See the full picture, with the <span>right context.</span></p>
            </div>
          </div>

          <div ref={stage} className="combo__stage">
            {!staticMode && (
              <svg className="combo__svg" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id="cg2" gradientUnits="userSpaceOnUse" x1="120" x2="880" y1="0" y2="0"><stop offset="0" stopColor="#6F8DF0" /><stop offset="1" stopColor="#B9F36A" /></linearGradient>
                </defs>
                <path ref={trackPath} d={CURVED} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3" strokeLinecap="round" />
                <path ref={fillPath} pathLength={1} d={CURVED} fill="none" stroke="url(#cg2)" strokeWidth="3.5" strokeLinecap="round" />
                <circle ref={marker} cx="120" cy="330" r="8" fill="#B9F36A" stroke="#fff" strokeWidth="2" />
              </svg>
            )}

            <div ref={att} className="cpanel cpanel--att">
              <span className="tag">Attendance</span>
              <h3>When was everyone present?</h3>
              <div className="cp-top">
                <svg viewBox="0 0 60 60" width="54" height="54" aria-hidden>
                  <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="7" />
                  <circle className="cp-ring" cx="30" cy="30" r="24" fill="none" stroke="#6F8DF0" strokeWidth="7" strokeLinecap="round" strokeDasharray="151" strokeDashoffset={staticMode ? 18 : 80} transform="rotate(-90 30 30)" />
                </svg>
                <div className="cp-state">
                  <span className="state-a">Awaiting check-in</span>
                  <span className="state-b">Checked in 09:00 (illustrative)</span>
                </div>
              </div>
              <ul>
                <li><span><i className="cp-ind" />Check-in</span><b>09:00</b></li>
                <li><span><i className="cp-ind" />Working hours</span><b>8h 05m</b></li>
                <li><span><i className="cp-ind" />Check-out</span><b>17:30</b></li>
              </ul>
            </div>

            <div ref={def} className="cpanel cpanel--def">
              <span className="tag">Defender</span>
              <h3>What was recorded in that time?</h3>
              <div className="cp-top">
                <div className="cp-strip"><i style={{ left: '4%', width: '24%' }} /><i style={{ left: '30%', width: '40%' }} /><i style={{ left: '74%', width: '18%' }} /></div>
                <div className="cp-state">
                  <span className="state-a">Waiting for activity</span>
                  <span className="state-b">Context: development tools (illustrative)</span>
                </div>
              </div>
              <ul>
                <li><span><i className="cp-ind" />Collaboration</span><b>1h 05m</b></li>
                <li><span><i className="cp-ind" />Development tools</span><b>2h 10m</b></li>
                <li><span><i className="cp-ind" />Browser</span><b>40m</b></li>
              </ul>
            </div>

            {!staticMode && (
              <>
                <div ref={link} className="combo__link" aria-hidden />
                {MARKERS.map((m) => (
                  <div key={m.t} className="combo__marker" style={{ left: `${m.x}%` }}><i />{m.t}</div>
                ))}
              </>
            )}
          </div>

          <div ref={msg} className="combo__msg">
            {staticMode && <p className="combo__final">See the full picture, with the <span>right context.</span></p>}
            <p className="combo__sub">Attendance shows when. Defender shows what was recorded. Read the two together.</p>
            <div className="combo__ctas">
              <a href={PORTAL_URL} className="btn btn--lime">Sign in to the portal <ArrowRight /></a>
              <button type="button" className="btn btn--ghost btn--on-dark" onClick={() => scrollToId('how')}>See how it works <ArrowRight /></button>
            </div>
            <p className="combo__demo">Illustrative times and categories.</p>
          </div>
        </div>

        <div ref={tail} className="combo__tail" aria-hidden />
        <div ref={veilOut} className="combo__veilout" aria-hidden />
      </div>
    </section>
  );
}
