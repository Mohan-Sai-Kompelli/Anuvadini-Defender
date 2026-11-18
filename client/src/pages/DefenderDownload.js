import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Apple, Archive, ArrowRight, Check, Copy, Download, Laptop, MonitorSmartphone } from 'lucide-react';
import AnuvadiniLogo from '../assets/anuvadini_logo.png';

/* Palette mirrors the marketing landing page (website/src/styles). */
const C = { bg: '#FAFAF7', paper: '#FFFFFF', ink: '#17191C', ink2: '#666D76', ink3: '#9AA0A8', midnight: '#101827', forest: '#385D27', line: '#E5E7E3', cobalt: '#315CE8', cobalt600: '#2748C4', cobaltSoft: '#EAF0FF', lime: '#B9F36A', limeSoft: '#F1FBD9' };
const FILES = '/api/public/defender/files';
const EASE = [0.22, 1, 0.36, 1];

const copy = async (text, setDone) => {
  try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch (_) { /* clipboard unavailable */ }
};

const Eyebrow = ({ children }) => (
  <p className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: C.cobalt }}>
    <span className="h-px w-6" style={{ background: C.cobalt }} aria-hidden="true" />{children}
  </p>
);

const PillButton = ({ href, children, primary, download }) => (
  <a href={href} download={download}
    className="inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-[15px] font-semibold transition duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    style={primary
      ? { background: C.cobalt, color: '#fff', boxShadow: '0 12px 28px -10px rgba(49,92,232,0.65)', outlineColor: C.cobalt }
      : { background: C.paper, color: C.ink, border: `1px solid ${C.line}`, outlineColor: C.cobalt }}>
    {children}
  </a>
);

const CopyLine = ({ label, text }) => {
  const [done, setDone] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.ink3 }}>{label}</p>
      <div className="flex items-center gap-2 rounded-2xl py-2 pl-4 pr-2" style={{ background: C.midnight }}>
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px] text-slate-100">{text}</code>
        <button type="button" onClick={() => copy(text, setDone)} aria-label={`Copy ${label}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B9F36A]">
          {done ? <Check className="h-3.5 w-3.5" style={{ color: C.lime }} /> : <Copy className="h-3.5 w-3.5" />}{done ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

const OsCard = ({ icon: Icon, title, hint, href, recommended }) => (
  <a href={href} download
    className="group relative flex flex-col rounded-[20px] p-6 transition duration-200 hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    style={{ background: C.paper, border: `1px solid ${recommended ? C.cobalt : C.line}`, boxShadow: recommended ? '0 2px 4px rgba(23,25,28,0.05), 0 30px 60px -28px rgba(49,92,232,0.35)' : '0 1px 2px rgba(23,25,28,0.05), 0 8px 24px -12px rgba(23,25,28,0.12)', outlineColor: C.cobalt }}>
    {recommended && <span className="absolute right-4 top-4 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: C.cobaltSoft, color: C.cobalt }}>Recommended for you</span>}
    <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl transition group-hover:scale-105" style={{ background: C.limeSoft, color: C.forest }}><Icon className="h-6 w-6" aria-hidden="true" /></span>
    <span className="text-[18px] font-semibold" style={{ color: C.ink }}>{title}</span>
    <span className="mt-1 flex-1 text-[13.5px] leading-relaxed" style={{ color: C.ink2 }}>{hint}</span>
    <span className="mt-5 inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: C.cobalt }}><Download className="h-4 w-4" aria-hidden="true" />Download<ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" /></span>
  </a>
);

const Step = ({ n, title, children, last }) => (
  <li className="relative flex gap-5 pb-9 last:pb-0">
    {!last && <span className="absolute left-[19px] top-11 h-[calc(100%-2.75rem)] w-px" style={{ background: C.line }} aria-hidden="true" />}
    <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white" style={{ background: C.cobalt, boxShadow: '0 8px 18px -8px rgba(49,92,232,0.7)' }}>{n}</span>
    <div className="min-w-0 flex-1 pt-1.5">
      <h3 className="text-[17px] font-semibold" style={{ color: C.ink }}>{title}</h3>
      <div className="mt-1.5 text-[14px] leading-relaxed" style={{ color: C.ink2 }}>{children}</div>
    </div>
  </li>
);

const Chip = ({ children, lime }) => (
  <span className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium" style={{ background: lime ? C.limeSoft : C.paper, border: `1px solid ${lime ? '#dcefb6' : C.line}`, color: C.ink }}>
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: lime ? C.forest : C.cobalt }} aria-hidden="true" />{children}
  </span>
);

const DefenderDownload = () => {
  const reduce = useReducedMotion();
  const [info, setInfo] = useState(null);
  const [failed, setFailed] = useState(false);
  const isMac = useMemo(() => /Mac|iPhone|iPad/i.test(navigator.userAgent || '') && !/Windows/i.test(navigator.userAgent || ''), []);

  useEffect(() => {
    axios.get('/api/public/defender/info').then((r) => setInfo(r.data)).catch(() => setFailed(true));
  }, []);

  const url = info?.serverUrl || 'http://SERVER-IP:8055';
  const winHref = info?.hasWindowsApp ? `${FILES}/windows-app` : `${FILES}/windows`;
  const primary = isMac ? { href: `${FILES}/mac`, label: 'Download for macOS' } : { href: winHref, label: 'Download for Windows' };
  const rise = (i = 0) => (reduce ? {} : { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-40px' }, transition: { duration: 0.5, delay: 0.05 * i, ease: EASE } });

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.ink }}>
      {/* Header (same structure as the landing page nav) */}
      <header className="sticky top-0 z-30 backdrop-blur-md" style={{ background: 'rgba(250,250,247,0.82)', borderBottom: `1px solid ${C.line}` }}>
        <div className="mx-auto flex h-[76px] w-full max-w-[1280px] items-center justify-between px-5 sm:px-8">
          <a href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" style={{ outlineColor: C.cobalt }} aria-label="Anuvadini home">
            <span className="flex h-10 w-[58px] items-center justify-center rounded-xl bg-white p-1" style={{ border: `1px solid ${C.line}` }}><img src={AnuvadiniLogo} alt="" className="h-full w-full object-contain" /></span>
            <span className="leading-tight"><span className="block text-[17px] font-semibold">Anuvadini</span><span className="block text-[10.5px] font-medium uppercase tracking-[0.16em]" style={{ color: C.ink3 }}>Attendance + Defender</span></span>
          </a>
          <nav aria-label="Primary" className="hidden items-center gap-9 md:flex">
            <a href="/#products" className="text-[15px] transition hover:opacity-70" style={{ color: C.ink2 }}>Products</a>
            <a href="#install" className="text-[15px] transition hover:opacity-70" style={{ color: C.ink2 }}>How It Works</a>
            <a href="#privacy" className="text-[15px] transition hover:opacity-70" style={{ color: C.ink2 }}>Privacy</a>
          </nav>
          <a href="/login" className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14.5px] font-semibold text-white transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: C.cobalt, boxShadow: '0 10px 24px -10px rgba(49,92,232,0.7)', outlineColor: C.cobalt }}>Sign in<ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <span className="pointer-events-none absolute inset-0 opacity-[0.55]" aria-hidden="true" style={{ backgroundImage: `linear-gradient(to right, ${C.line} 1px, transparent 1px), linear-gradient(to bottom, ${C.line} 1px, transparent 1px)`, backgroundSize: '56px 56px', WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 20%, #000 35%, transparent 100%)', maskImage: 'radial-gradient(ellipse 80% 70% at 50% 20%, #000 35%, transparent 100%)' }} />
          <span className="pointer-events-none absolute -left-32 top-10 h-[420px] w-[420px] rounded-full opacity-60" style={{ background: 'radial-gradient(circle, rgba(49,92,232,0.14), transparent 65%)' }} aria-hidden="true" />
          <span className="pointer-events-none absolute -right-24 bottom-0 h-[420px] w-[420px] rounded-full opacity-70" style={{ background: 'radial-gradient(circle, rgba(185,243,106,0.28), transparent 65%)' }} aria-hidden="true" />

          <div className="relative mx-auto grid w-full max-w-[1280px] items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
            <motion.div initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE }}>
              <Eyebrow>Defender · Employee PC</Eyebrow>
              <h1 className="mt-6 text-[44px] font-semibold leading-[0.98] tracking-[-0.035em] sm:text-[64px] lg:text-[72px]">
                Install Defender.<br /><span style={{ color: C.cobalt }}>In two minutes.</span>
              </h1>
              <p className="mt-6 max-w-lg text-[19px] leading-[1.6]" style={{ color: C.ink2 }}>A small background app that supports workday visibility on your work PC. Download it, open it, and scan the code with your attendance app — like WhatsApp Web. No passwords to type.</p>
              <div className="mt-6 flex flex-wrap gap-2.5"><Chip>Windows and macOS</Chip><Chip lime>Office hours only</Chip></div>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <PillButton primary download href={primary.href}><Download className="h-[18px] w-[18px]" aria-hidden="true" />{primary.label}</PillButton>
                <PillButton href="#install">See how it works<ArrowRight className="h-4 w-4" aria-hidden="true" /></PillButton>
              </div>
              <p className="mt-5 text-[13px]" style={{ color: C.ink3 }}>You need permission to install software on this PC.</p>
            </motion.div>

            <motion.div className="relative mx-auto w-full max-w-[460px]" initial={reduce ? false : { opacity: 0, y: 24, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: reduce ? 0 : -1.5 }} transition={{ duration: 0.7, delay: 0.1, ease: EASE }} aria-hidden="true">
              <div className="rounded-[26px] p-6" style={{ background: C.paper, border: `1px solid ${C.line}`, boxShadow: '0 2px 4px rgba(23,25,28,0.05), 0 40px 80px -30px rgba(49,92,232,0.35)' }}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.14em]" style={{ color: C.ink2 }}><span className="h-2 w-2 rounded-full" style={{ background: C.forest }} />Defender</span>
                  <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ border: `1px dashed ${C.ink3}`, color: C.ink3 }}>Illustration</span>
                </div>
                <div className="mt-5 flex items-center gap-4">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full" style={{ border: `5px solid ${C.cobalt}`, borderRightColor: C.cobaltSoft }}><Check className="h-7 w-7" style={{ color: C.cobalt }} /></span>
                  <div><p className="text-[22px] font-semibold leading-tight">Defender is active</p><p className="mt-0.5 text-[13px]" style={{ color: C.ink2 }}>Running quietly in the background</p></div>
                </div>
                <div className="mt-6 space-y-2.5">
                  {['Work applications are never flagged', 'Active only during office hours', 'Linked to your employee ID'].map((t, i) => (
                    <div key={t} className="flex items-center gap-3 rounded-xl px-4 py-3 text-[13.5px]" style={{ background: i === 1 ? C.limeSoft : '#F6F7F4' }}>
                      <Check className="h-4 w-4 shrink-0" style={{ color: i === 1 ? C.forest : C.cobalt }} />{t}
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute -bottom-8 -left-8 hidden h-24 w-24 items-center justify-center rounded-full sm:flex" style={{ background: C.paper, border: `1px solid ${C.line}`, boxShadow: '0 20px 40px -16px rgba(23,25,28,0.25)' }}>
                <MonitorSmartphone className="h-9 w-9" style={{ color: C.forest }} />
              </div>
            </motion.div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-[1280px] space-y-20 px-5 pb-20 pt-6 sm:px-8 sm:pb-28">
          {(failed || (info && !info.online)) && (
            <div className="flex items-start gap-3 rounded-2xl p-4 text-[14px]" style={{ background: '#FFF7E6', border: '1px solid #f5d9a0', color: '#7a4b00' }} role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {failed ? 'The download service could not be reached. Please try again in a moment or contact your administrator.' : 'The Defender engine is not running right now, so the installers cannot be downloaded yet. Ask your administrator to start it.'}
            </div>
          )}

          <motion.section {...rise()} aria-labelledby="dl-files">
            <Eyebrow>Downloads</Eyebrow>
            <h2 id="dl-files" className="mt-4 text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[44px]">Choose your computer.</h2>
            <p className="mt-3 max-w-xl text-[16px] leading-relaxed" style={{ color: C.ink2 }}>The same agent for every platform. Windows gives the full feature set.</p>
            <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <OsCard icon={Laptop} title="Windows" hint="Windows 10 or 11. One-click app — open it and scan the QR to link. Recommended for office PCs." href={winHref} recommended={!isMac} />
              <OsCard icon={Apple} title="macOS" hint="MacBook and iMac, Intel or Apple Silicon. Some protections are limited on macOS." href={`${FILES}/mac`} recommended={isMac} />
              <OsCard icon={Archive} title="Client bundle (.zip)" hint="For IT teams that roll the agent out by script across many PCs." href={`${FILES}/bundle`} />
            </div>
          </motion.section>

          <motion.section {...rise()} id="install" aria-labelledby="dl-steps" className="scroll-mt-28 rounded-[28px] p-6 sm:p-12" style={{ background: C.paper, border: `1px solid ${C.line}`, boxShadow: '0 1px 2px rgba(23,25,28,0.05), 0 8px 24px -12px rgba(23,25,28,0.12)' }}>
            <Eyebrow>How it works</Eyebrow>
            <h2 id="dl-steps" className="mt-4 text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[44px]">Three steps. <span style={{ color: C.cobalt }}>That is all.</span></h2>
            <ol className="mt-10">
              <Step n="1" title="Check that Python is installed">
                Defender needs Python 3.10 or newer. If you do not have it, install it from python.org and tick <b style={{ color: C.ink }}>Add Python to PATH</b> on the first screen.
              </Step>
              <Step n="2" title="Run the installer with your company server address">
                <p className="mb-4">Open a terminal in the folder where the file was saved and run the command for your computer.</p>
                <div className="space-y-4">
                  <CopyLine label="Server address" text={url} />
                  <CopyLine label="Windows" text={`Anuvadini_Installer.bat ${url}`} />
                  <CopyLine label="macOS" text={`bash Anuvadini_Installer_Mac.sh ${url}`} />
                </div>
                {info?.loopbackOnly && (
                  <p className="mt-4 rounded-2xl p-4 text-[13.5px]" style={{ background: '#FFF7E6', border: '1px solid #f5d9a0', color: '#7a4b00' }}>You opened this page on the server itself, so the address says localhost. On an employee PC, open this page using the server's network address, or replace localhost with the server's IP.</p>
                )}
              </Step>
              <Step n="3" title="Sign in with your employee ID and password" last>
                The installer asks for them once and links this PC to you. After that Defender runs quietly in the background and starts with your PC.
              </Step>
            </ol>
          </motion.section>

          <motion.section {...rise()} id="privacy" aria-labelledby="dl-privacy" className="scroll-mt-28">
            <Eyebrow>Privacy</Eyebrow>
            <h2 id="dl-privacy" className="mt-4 text-[34px] font-semibold leading-tight tracking-[-0.03em] sm:text-[44px]">What Defender does on your PC.</h2>
            <ul className="mt-9 grid gap-4 sm:grid-cols-2">
              {[
                'During office hours it notes which application and window is active, and how long the PC has been idle.',
                'It flags games, gambling and similar non-work sites, and may capture a screenshot as evidence when it does.',
                'Your administrator can see a live preview of the screen while Defender is on and during office hours.',
                'Listed non-work websites are closed automatically in your browser.',
                'Work applications such as office suites and developer tools are never flagged.',
              ].map((t) => (
                <li key={t} className="flex gap-4 rounded-[20px] p-5 text-[14.5px] leading-relaxed" style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.ink2 }}>
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: C.limeSoft, color: C.forest }}><Check className="h-3.5 w-3.5" aria-hidden="true" /></span>{t}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[14px]" style={{ color: C.ink3 }}>Questions about this policy? Contact your administrator before installing.</p>
          </motion.section>
        </div>
      </main>

      <footer style={{ borderTop: `1px solid ${C.line}`, background: C.paper }}>
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-start justify-between gap-3 px-5 py-8 text-[13.5px] sm:flex-row sm:items-center sm:px-8" style={{ color: C.ink2 }}>
          <span>Anuvadini Foundation. All rights reserved.</span>
          <span className="flex gap-6"><a href="/" className="hover:opacity-70">Website</a><a href="/login" className="hover:opacity-70">Sign in</a><a href="/register" className="hover:opacity-70">Register</a></span>
        </div>
      </footer>
    </div>
  );
};

export default DefenderDownload;
