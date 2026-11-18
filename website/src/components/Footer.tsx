import { useRef } from 'react';
import { gsap, useGSAP } from '../lib/gsap';
import { CONTACT_EMAIL, PORTAL_URL } from '../config';
import { scrollToId } from '../lib/scroll';
import { Logo } from './Nav';

const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); scrollToId(id); };

export default function Footer() {
  const root = useRef<HTMLElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.set(line.current, { scaleX: 0, transformOrigin: 'left' });
      gsap.set(logo.current, { scale: 0.85, opacity: 0, y: 10 });
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, scrollTrigger: { trigger: root.current, start: 'top 92%', toggleActions: 'play none none none' } });
      tl.to(line.current, { scaleX: 1, duration: 1.1 }).to(logo.current, { scale: 1, opacity: 1, y: 0, duration: 0.7 }, 0.2);
    });
    mm.add('(prefers-reduced-motion: reduce)', () => { gsap.set(line.current, { scaleX: 1 }); });
  }, { scope: root });

  return (
    <footer ref={root} className="footer">
      <div ref={line} className="footer__line" aria-hidden />
      <div className="container">
        <div className="footer__grid">
          <div>
            <div ref={logo} style={{ display: 'inline-block' }}><Logo /></div>
            <p className="footer__note">Attendance records presence. Defender helps explain recorded activity. Together, a clearer view of the workday.</p>
          </div>
          <div>
            <h4>Products</h4>
            <ul>
              <li><a href="#attendance" onClick={go('attendance')}>Attendance</a></li>
              <li><a href="#defender" onClick={go('defender')}>Defender</a></li>
              <li><a href="#combined" onClick={go('combined')}>Together</a></li>
              <li><a href="#how" onClick={go('how')}>How it works</a></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><a href="#privacy" onClick={go('privacy')}>Privacy and transparency</a></li>
              <li><span title="To be published by Anuvadini">Privacy policy (to be published)</span></li>
              <li><span title="To be published by Anuvadini">Terms (to be published)</span></li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
              <li><a href={PORTAL_URL}>Open the attendance portal</a></li>
            </ul>
          </div>
        </div>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} Anuvadini. All rights reserved.</span>
          <span>Product visuals use illustrative sample data.</span>
        </div>
      </div>
    </footer>
  );
}
