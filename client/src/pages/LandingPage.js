import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowLeft, Eye, EyeOff, Lock, Users, ScanFace, MapPin, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AnuvadiniLogo from '../assets/anuvadini_logo.png';
import FaceScan from './FaceScan';
import './login.css';

const EASE = [0.22, 1, 0.36, 1];

/** Sign-in screen. Same visual language as the Anuvadini website. */
const LandingPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState(null); // 'email' | 'password' | null
  const [outcome, setOutcome] = useState(null); // 'loading' | 'error' | 'success' | null
  const [formData, setFormData] = useState({ email: '', password: '' });
  const { login } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setOutcome('loading');
    const clearLater = () => setTimeout(() => setOutcome(null), 2400);
    try {
      const result = await login(formData.email, formData.password);
      if (result.success) {
        setOutcome('success');
        // let the robot celebrate for a moment before moving on
        if (!reduce) await new Promise((r) => setTimeout(r, 1300));
        navigate(result.redirect || '/dashboard');
      } else {
        setOutcome('error');
        clearLater();
      }
    } catch (err) {
      console.error('Auth error:', err);
      setOutcome('error');
      clearLater();
    } finally {
      setLoading(false);
    }
  };

  const mood = outcome || (focus === 'password' ? (showPassword ? 'peek' : 'password') : focus === 'email' ? 'email' : 'idle');

  // soft light that follows the pointer
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  const fade = (delay = 0, y = 24) => ({
    initial: reduce ? false : { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, delay, ease: EASE },
  });

  return (
    <div className="lg" onMouseMove={onMove}>
      <div className="lg__bg" aria-hidden>
        <div className="lg__glow" />
        <div className="lg__grid" />
        <span className="lg__shape lg__shape--a" />
        <span className="lg__shape lg__shape--b" />
      </div>

      <motion.header className="lg__nav" {...fade(0.05, -16)}>
        <a href="/" className="lg__brand" aria-label="Anuvadini, back to the website">
          <img src={AnuvadiniLogo} alt="" />
          <span>Anuvadini<small>Attendance + Defender</small></span>
        </a>
        <a href="/" className="lg__back"><ArrowLeft size={16} /> Back to website</a>
      </motion.header>

      <main className="lg__main">
        {/* ── story side ── */}
        <section className="lg__story" aria-label="About">
          <motion.p className="lg__eyebrow" {...fade(0.1, 10)}>Welcome back</motion.p>
          <h1 className="lg__title">
            <span className="lg__mask"><motion.span initial={reduce ? false : { y: '110%' }} animate={{ y: 0 }} transition={{ duration: 0.9, delay: 0.2, ease: EASE }}>Every workday.</motion.span></span>
            <span className="lg__mask"><motion.span className="lg__accent" initial={reduce ? false : { y: '110%' }} animate={{ y: 0 }} transition={{ duration: 0.9, delay: 0.34, ease: EASE }}>In focus.</motion.span></span>
          </h1>
          <motion.p className="lg__lead" {...fade(0.6)}>Sign in to see attendance, leave and the day&apos;s summary in one clear view.</motion.p>

          <FaceScan reduce={reduce} mood={mood} />
        </section>

        {/* ── sign-in card ── */}
        <motion.section className="lg__panel" aria-label="Sign in" {...fade(0.35, 36)}>
          <div className="lg__panel-bar" />
          <h2>Sign in</h2>
          <p className="lg__sub">Access your Faculty or Admin dashboard</p>

          <form onSubmit={handleSubmit} className="lg__form">
            <label htmlFor="email">Email or Faculty UID</label>
            <div className="lg__field">
              <Users size={17} className="lg__ico" />
              <input id="email" name="email" type="text" value={formData.email} onChange={handleInputChange} onFocus={() => setFocus('email')} onBlur={() => setFocus(null)} required autoComplete="username" placeholder="Enter Email or Staff ID" />
            </div>

            <label htmlFor="password">Password</label>
            <div className="lg__field">
              <Lock size={17} className="lg__ico" />
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={formData.password} onChange={handleInputChange} onFocus={() => setFocus('password')} onBlur={() => setFocus(null)} required autoComplete="current-password" placeholder="••••••••" style={{ paddingRight: 44 }} />
              <button type="button" className="lg__eye" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <motion.button type="submit" className="lg__submit" disabled={loading} whileHover={loading ? undefined : { scale: 1.02 }} whileTap={loading ? undefined : { scale: 0.97 }}>
              {loading ? (<><span className="lg__spin" /> Signing in…</>) : (<>Sign in <ArrowRight size={18} /></>)}
            </motion.button>
          </form>

          <div className="lg__tags">
            <span><ScanFace size={14} /> Face + liveness</span>
            <span><MapPin size={14} /> Geofenced</span>
            <span><ShieldCheck size={14} /> Device-bound</span>
          </div>
        </motion.section>
      </main>

      <footer className="lg__foot">© {new Date().getFullYear()} Anuvadini · Confidential · Product visuals use illustrative sample data</footer>
    </div>
  );
};

export default LandingPage;
