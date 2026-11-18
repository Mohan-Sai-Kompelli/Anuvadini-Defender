import { useRef } from 'react';
import { gsap, useGSAP, MQ } from '../lib/gsap';
import { Eye, Lock, File, Shield } from './Icons';

// The copy below is deliberately generic. Anuvadini must confirm each point
// against real product policy before publishing; unverified claims are flagged.
const POINTS = [
  { icon: Eye, title: 'Clear monitoring scope', text: 'What is recorded, and when, is defined up front and communicated to the people it concerns.' },
  { icon: Lock, title: 'Appropriate access controls', text: 'Only authorised reviewers should see attendance and activity records.' },
  { icon: File, title: 'Data handling and retention', text: 'How long data is kept, and how it is handled, is set out in a published policy.' },
  { icon: Shield, title: 'Contextual review of signals', text: 'Activity signals prompt a closer look in context. They are never treated as proof of misconduct.' },
];

const OUTLINE = 'M200 40 L340 90 V210 C340 280 285 335 200 365 C115 335 60 280 60 210 V90 Z';

export default function Trust() {
  const root = useRef<HTMLElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const l1 = useRef<SVGPathElement>(null);
  const l2 = useRef<SVGPathElement>(null);
  const l3 = useRef<SVGPathElement>(null);
  const tick = useRef<SVGPathElement>(null);
  const sweep = useRef<SVGPathElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();

    mm.add(MQ.desktop, () => {
      // geometry assembles from a few clean shapes as the section is scrolled through
      gsap.set(l1.current, { y: 80, x: -50, rotation: -8, opacity: 0, transformOrigin: '200px 220px' });
      gsap.set(l2.current, { y: -70, x: 60, rotation: 7, opacity: 0, transformOrigin: '200px 220px' });
      gsap.set(l3.current, { scale: 0.5, opacity: 0, transformOrigin: '200px 220px' });
      gsap.set(tick.current, { strokeDasharray: 1, strokeDashoffset: 1 });
      gsap.set(sweep.current, { strokeDasharray: '0.18 1', strokeDashoffset: 0.18, opacity: 0 });
      gsap.set(rail.current, { scaleY: 0, transformOrigin: 'top' });
      gsap.set(q('.tp'), { opacity: 0, y: 30 });
      gsap.set(head.current!.children, { opacity: 0, y: 30 });

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: root.current, start: 'top 70%', end: 'bottom 55%', scrub: 1 },
      });
      tl.to(head.current!.children, { opacity: 1, y: 0, duration: 0.12, stagger: 0.04, ease: 'power2.out' }, 0)
        .to(l1.current, { y: 0, x: 0, rotation: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }, 0.05)
        .to(l2.current, { y: 0, x: 0, rotation: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }, 0.14)
        .to(l3.current, { scale: 1, opacity: 1, duration: 0.2, ease: 'power3.out' }, 0.24)
        .to(tick.current, { strokeDashoffset: 0, duration: 0.14 }, 0.42)
        // a light sweep travels once around the outline
        .to(sweep.current, { opacity: 1, duration: 0.02 }, 0.44)
        .to(sweep.current, { strokeDashoffset: -1, duration: 0.36 }, 0.44)
        .to(sweep.current, { opacity: 0, duration: 0.04 }, 0.78)
        // supporting text arrives in two short groups; a rail links them
        .to(rail.current, { scaleY: 1, duration: 0.5 }, 0.2)
        .to(q('.tp').slice(0, 2), { opacity: 1, y: 0, duration: 0.12, stagger: 0.07, ease: 'power2.out' }, 0.22)
        .to(q('.tp').slice(2), { opacity: 1, y: 0, duration: 0.12, stagger: 0.07, ease: 'power2.out' }, 0.5);
      // subtle parallax: the shield drifts slower than the text
      gsap.fromTo(art.current, { y: 50 }, { y: -50, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    mm.add(MQ.mobile, () => {
      gsap.from([head.current!.children, art.current, ...q('.tp')], {
        y: 30, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out',
        scrollTrigger: { trigger: root.current, start: 'top 75%' },
      });
      gsap.set(sweep.current, { opacity: 0 });
    });

    mm.add(MQ.reduced, () => { gsap.set(sweep.current, { opacity: 0 }); });
  }, { scope: root });

  return (
    <section id="privacy" ref={root} className="section trust" aria-labelledby="trust-title">
      <div className="container trust__grid">
        <div>
          <div ref={head}>
            <p className="eyebrow">Trust and transparency</p>
            <h2 id="trust-title" className="h2">Visibility should come with clarity.</h2>
            <p className="lead">Seeing more of the workday carries responsibility. These are the principles this platform is meant to be used with.</p>
          </div>
          <div className="trust__wrap">
            <div className="trust__rail" aria-hidden><i ref={rail} /></div>
            <ul className="trust__list">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="tp">
                  <span className="trust__ico"><Icon width={20} height={20} /></span>
                  <div>
                    <b>{title}</b>
                    <span>{text}</span>
                    <br /><span className="pending">Placeholder: Anuvadini to verify against product policy</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div ref={art} className="trust__art">
          <svg viewBox="0 0 400 400" role="img" aria-label="Layered shield illustration">
            <path ref={l1} d={OUTLINE} fill="#EAF0FF" fillOpacity={0.9} stroke="#315CE8" strokeWidth="3" strokeLinejoin="round" />
            <path ref={l2} d="M200 80 L310 120 V210 C310 262 268 304 200 330 C132 304 90 262 90 210 V120 Z" fill="#F2FCE0" fillOpacity={0.9} stroke="#385D27" strokeWidth="3" strokeLinejoin="round" />
            <path ref={l3} d="M200 120 L280 150 V212 C280 246 250 276 200 296 C150 276 120 246 120 212 V150 Z" fill="#B9F36A" fillOpacity={0.9} stroke="#385D27" strokeWidth="3" strokeLinejoin="round" />
            <path ref={tick} pathLength={1} d="M165 215 L193 243 L240 185" fill="none" stroke="#1F3A14" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
            <path ref={sweep} pathLength={1} d={OUTLINE} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(185,243,106,0.9))' }} />
          </svg>
        </div>
      </div>
    </section>
  );
}
