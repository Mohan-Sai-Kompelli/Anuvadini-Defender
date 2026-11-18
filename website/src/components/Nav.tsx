import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { NAV_LINKS, PORTAL_URL } from '../config';
import { scrollToId } from '../lib/scroll';
import { ArrowRight } from './Icons';

export function Logo() {
  return (
    <a href="#home" className="logo" onClick={(e) => { e.preventDefault(); scrollToId('home'); }} aria-label="Anuvadini, back to top">
      <img src={`${import.meta.env.BASE_URL}anuvadini_logo.png`} alt="" height="34" />
      <span>
        Anuvadini
        <small>Attendance + Defender</small>
      </span>
    </a>
  );
}

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('home');
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const on = () => {
      setScrolled(window.scrollY > 90);
      const c = document.getElementById('combined')?.getBoundingClientRect();
      setDark(!!c && c.top < 40 && c.bottom > 80);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    const ids = NAV_LINKS.map((l) => l.id);
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [open]);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    window.setTimeout(() => scrollToId(id), open ? 250 : 0);
  };

  return (
    <>
      <motion.header
        className={`nav ${scrolled ? 'nav--scrolled' : ''} ${dark ? 'nav--dark' : ''}`}
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
      >
        <div className="container nav__inner">
          <Logo />
          <nav aria-label="Primary">
            <ul className="nav__links">
              {NAV_LINKS.map((l, i) => (
                <motion.li key={l.id} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                  <a href={`#${l.id}`} className={active === l.id ? 'is-active' : ''} aria-current={active === l.id ? 'true' : undefined} onClick={go(l.id)}>
                    {l.label}
                  </a>
                </motion.li>
              ))}
            </ul>
          </nav>
          <div className="nav__cta">
            <a href={PORTAL_URL} className="btn btn--primary btn--sm">Sign in <ArrowRight /></a>
          </div>
          <button
            type="button" className="burger" aria-expanded={open} aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}
          >
            <span />
          </button>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu" className="mobile-menu" role="dialog" aria-label="Menu"
            initial={{ opacity: 0, clipPath: 'circle(0% at 90% 4%)' }}
            animate={{ opacity: 1, clipPath: 'circle(150% at 90% 4%)' }}
            exit={{ opacity: 0, clipPath: 'circle(0% at 90% 4%)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {NAV_LINKS.map((l, i) => (
              <motion.a
                key={l.id} href={`#${l.id}`} className="m-link" onClick={go(l.id)}
                initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.12 + i * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {l.label}
              </motion.a>
            ))}
            <a href={PORTAL_URL} className="btn btn--primary" style={{ marginTop: 24 }}>Sign in <ArrowRight /></a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
