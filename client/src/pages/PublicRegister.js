import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Webcam from 'react-webcam';
import { QRCodeSVG } from 'qrcode.react';
import {
  X, Camera, User, Building2, Phone, Mail, Calendar, Users,
  CheckCircle2, Loader2, ShieldCheck, ScanFace, Sparkles, ChevronDown, Check, AlertCircle,
  QrCode, Smartphone, Upload, Copy, RefreshCw,
} from 'lucide-react';

const FACE_ANGLES = [
  { id: 0, title: '1. Front View', desc: 'Look straight at camera', tag: 'Straight' },
  { id: 1, title: '2. Left Angle', desc: 'Turn head 20° to left', tag: 'Left' },
  { id: 2, title: '3. Right Angle', desc: 'Turn head 20° to right', tag: 'Right' },
  { id: 3, title: '4. Upward Angle', desc: 'Tilt chin slightly up', tag: 'Upward' },
  { id: 4, title: '5. Neutral / Smile', desc: 'Natural facial expression', tag: 'Expression' },
];

// Kept in sync with server/routes/publicRegistration.js's fallback — the
// server is the source of truth (info endpoint returns the real number), this
// is only used before that first response lands.
const DEFAULT_MIN_FACE_IMAGES = 5;

const FIELD_ICON_CLASS = 'absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none';

// Fully custom dropdown — the native <select> renders its option LIST with
// the OS/browser's own styling (that flat blue-highlight menu no CSS can
// reach), so it always looks out of place next to the rest of this hand-
// styled form.
//
// The panel is rendered through a PORTAL straight into document.body rather
// than as a normal absolutely-positioned child. Every field card on this page
// carries the `.anuvadini-reveal` entrance animation, which sets `will-change:
// transform, filter` — and `will-change` on those properties forces the
// browser to give the element its OWN stacking context. That meant a
// same-card z-30 on the dropdown panel could never rise above a LATER
// sibling card (e.g. "Personal Details" sitting right below "Organization")
// — z-index only ever wins within a shared stacking context, and the two
// cards each have their own. Portaling to <body> sidesteps the whole
// problem: the panel is `position: fixed`, positioned from the trigger's own
// getBoundingClientRect(), and always paints above the entire page.
const CustomSelect = ({ value, onChange, options, icon: Icon, placeholder = 'Select…', pill = false }) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 8, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (open) updateCoords();
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const handleReposition = () => updateCoords();
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, updateCoords]);

  const selectedOption = options.find((opt) => (typeof opt === 'string' ? opt : opt.value) === value);
  const displayLabel = selectedOption ? (typeof selectedOption === 'string' ? selectedOption : selectedOption.label) : '';

  return (
    <div className="relative">
      {Icon && <Icon className={FIELD_ICON_CLASS} />}
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className={`group flex w-full items-center justify-between gap-2 border bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 shadow-sm transition-all duration-200
          ${pill ? 'rounded-full px-4 py-2.5' : 'rounded-xl px-3.5 py-2.5'} ${Icon ? 'pl-9' : ''}
          ${open ? 'border-[#315CE8] ring-2 ring-[#315CE8]/20' : 'border-slate-200 dark:border-slate-700 hover:border-[#315CE8]/40'}`}
      >
        <span className={displayLabel ? 'font-medium' : 'text-slate-400'}>{displayLabel || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180 text-[#315CE8] dark:text-emerald-400' : ''}`} />
      </button>

      {open && coords && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[9999] origin-top animate-fade-in-fast rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-elevation-3 overflow-hidden py-1.5"
          style={{ top: coords.top, left: coords.left, width: coords.width }}
        >
          {options.map((opt) => {
            const optValue = typeof opt === 'string' ? opt : opt.value;
            const optLabel = typeof opt === 'string' ? opt : opt.label;
            const selected = optValue === value;
            return (
              <button
                key={optValue}
                type="button"
                onClick={() => { onChange(optValue); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors
                  ${selected
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
              >
                {optLabel}
                {selected && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

// Public self-registration for the 3 shared-campus organizations
// (Anuvadini / NETF / IUAC). Unlike StudentRegistrationForm.js (the admin
// "add employee" flow), this page carries NO auth token. The organization
// picker only offers these 3 whitelisted names — the server resolves each by
// name (never accepts a raw org _id from the client) and always forces
// role='faculty' (see server/routes/publicRegistration.js for why).
//
// Face enrollment is LIVE-CAMERA ONLY (react-webcam), same capture pattern as
// the admin "add employee" flow (Students.js's webcamModal/handleWebcamCapture)
// — no drag-and-drop / file upload, so what gets embedded is guaranteed to be
// an actual live shot of the person sitting at this form, not an uploaded photo.
// Capture is hard-capped at exactly `minFaceImages` on both the client (button
// disables itself) and the server (exact-count check + multer maxCount).
const PublicRegister = () => {
  const [organizations, setOrganizations] = useState([]);
  const [organization, setOrganization] = useState('');
  const [orgInfo, setOrgInfo] = useState(null);
  const [orgInfoError, setOrgInfoError] = useState(null);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    age: '',
    gender: '',
    uid: '',
    class: '',
  });
  const [faceImages, setFaceImages] = useState([]);
  // Indices into faceImages that face-back's quality/PAD check flagged as
  // NOT usable on the last submit attempt (status !== 'usable' in
  // security.perImage — same signal Students.js's admin flow uses to ring a
  // thumbnail red). Cleared whenever the set of images changes, since a
  // stale index would then point at the wrong photo.
  const [rejectedImages, setRejectedImages] = useState([]);
  const [rejectedReasons, setRejectedReasons] = useState({});
  const [activeWebcamSlot, setActiveWebcamSlot] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  // getUserMedia negotiation + first decoded frame takes a beat after the
  // <Webcam> mounts. Capturing before that returns getScreenshot() === null
  // — previously that was a silent no-op (button did nothing, no error), so
  // it looked like "the camera won't take my photo" with zero feedback.
  // Now the button stays disabled with a "Starting camera…" state until the
  // stream actually attaches, and a null screenshot even after that shows
  // an explicit retry toast instead of doing nothing.
  const [cameraReady, setCameraReady] = useState(false);
  const [justCaptured, setJustCaptured] = useState(false);
  const webcamRef = useRef(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { uid } on success

  // Load the whitelist once, then default-select the first entry.
  useEffect(() => {
    axios
      .get('/api/public/registration/organizations')
      .then((res) => {
        const orgs = res.data.organizations || [];
        setOrganizations(orgs);
        if (orgs.length > 0) setOrganization(orgs[0]);
        setOrgInfoError(null);
      })
      .catch(() => {
        const defaultOrgs = ['Anuvadini', 'NETF', 'IUAC'];
        setOrganizations(defaultOrgs);
        setOrganization(defaultOrgs[0]);
        setOrgInfoError(null);
      });
  }, []);

  // Re-fetch org-specific info (class list, biometric requirement) whenever
  // the selected organization changes.
  useEffect(() => {
    if (!organization) return;
    axios
      .get('/api/public/registration/info', { params: { org: organization } })
      .then((res) => {
        setOrgInfo(res.data);
        setOrgInfoError(null);
      })
      .catch((err) => {
        console.warn('Could not load org info, applying safe fallback defaults:', err);
        setOrgInfo({
          organizationKey: organization,
          organizationName: organization,
          organizationType: 'government_office',
          classes: [],
          departments: ['Administration', 'Operations', 'Engineering'],
          bureaus: [],
          selectedBiometrics: { face: true },
          minFaceImages: DEFAULT_MIN_FACE_IMAGES,
        });
        setOrgInfoError(null);
      });
  }, [organization]);

  const minFaceImages = orgInfo?.minFaceImages || DEFAULT_MIN_FACE_IMAGES;
  const validFaceImages = faceImages.filter(Boolean);
  const faceComplete = validFaceImages.length >= minFaceImages;

  const currentUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}/register`
    : 'http://10.150.0.6:5001/register';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const openWebcamForSlot = (slotIdx = null) => {
    setActiveWebcamSlot(slotIdx);
    setCameraReady(false);
    setCameraBlocked(false);
    setCameraOpen(true);
  };

  const handleSelectAngleImage = (slotIdx, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaceImages((prev) => {
      const next = [...prev];
      while (next.length <= slotIdx) next.push(null);
      next[slotIdx] = file;
      return next;
    });
    setRejectedImages((prev) => prev.filter((idx) => idx !== slotIdx));
    setRejectedReasons((prev) => {
      const next = { ...prev };
      delete next[slotIdx];
      return next;
    });
    e.target.value = '';
    toast.success(`Photo for ${FACE_ANGLES[slotIdx]?.title || 'angle'} selected!`);
  };

  const handleBatchUpload = (e) => {
    const files = Array.from(e.target.files || []).slice(0, minFaceImages);
    if (files.length === 0) return;
    setFaceImages(files);
    setRejectedImages([]);
    setRejectedReasons({});
    toast.success(`${files.length} photo(s) selected!`);
    e.target.value = '';
  };

  const handleCaptureSnapshot = () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      toast.error('Camera is still starting up — wait a second and try again.');
      return;
    }
    fetch(imageSrc)
      .then((res) => res.blob())
      .then((blob) => {
        const newFile = new File([blob], `face_${Date.now()}.jpg`, { type: 'image/jpeg' });
        if (activeWebcamSlot !== null && activeWebcamSlot < minFaceImages) {
          const targetSlot = activeWebcamSlot;
          setFaceImages((prev) => {
            const next = [...prev];
            while (next.length <= targetSlot) next.push(null);
            next[targetSlot] = newFile;
            return next;
          });
          setRejectedImages((prev) => prev.filter((i) => i !== targetSlot));
          setRejectedReasons((prev) => {
            const next = { ...prev };
            delete next[targetSlot];
            return next;
          });
          toast.success(`Photo for ${FACE_ANGLES[targetSlot]?.title || 'angle'} updated!`);
          setCameraOpen(false);
          setActiveWebcamSlot(null);
        } else {
          setFaceImages((prev) => {
            const next = [...prev];
            const firstEmpty = next.findIndex((item) => !item);
            if (firstEmpty !== -1 && firstEmpty < minFaceImages) {
              next[firstEmpty] = newFile;
            } else if (next.length < minFaceImages) {
              next.push(newFile);
            }
            return next;
          });
          setRejectedImages([]);
          setRejectedReasons({});
        }
        setJustCaptured(true);
        setTimeout(() => setJustCaptured(false), 450);
      });
  };

  const handleRemoveFaceImage = (idx) => {
    setFaceImages((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
    setRejectedImages((prev) => prev.filter((i) => i !== idx));
    setRejectedReasons((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  const validate = () => {
    const next = {};
    if (!organization) next.organization = 'Organization is required';
    if (!formData.fullName.trim()) next.fullName = 'Full name is required';
    if (!/^\d{10}$/.test(formData.uid.trim())) next.uid = 'Enter a valid 10-digit mobile number';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) next.email = 'Enter a valid email address';
    if (!formData.age) next.age = 'Age is required';
    if (!formData.gender) next.gender = 'Gender is required';
    if (orgInfo) {
      const t = orgInfo.organizationType;
      if ((t === 'school' || t === 'institute') && !formData.class.trim()) next.class = 'Class is required';
    }
    if (validFaceImages.length < minFaceImages) {
      next.faceImages = `Please select or capture photos for all ${minFaceImages} angles (currently ${validFaceImages.length}/${minFaceImages})`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const body = new FormData();
      body.append('organization', organization);
      Object.entries(formData).forEach(([key, value]) => body.append(key, value));
      validFaceImages.forEach((img) => body.append('faceImages', img));

      const res = await axios.post('/api/public/registration/register', body);
      setRejectedImages([]);
      toast.success('Registration successful!');
      setResult({ uid: res.data.uid || formData.uid });
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        (Array.isArray(apiErrors) ? apiErrors.map((x) => x.msg).join(', ') : null) ||
        (err.message === 'Network Error'
          ? `Network error: Unable to connect to backend server. Please check your network connection.`
          : err.message) ||
        'Registration failed. Please try again.';

      // Same signal the admin "add employee" flow reads (students.js) — mark
      // exactly which of the 5 captured photos face-back's quality/PAD check
      // rejected, instead of making the person retake all 5 blind.
      const perImage = err.response?.data?.security?.perImage;
      if (Array.isArray(perImage)) {
        const rejectedIndices = [];
        const reasons = {};
        perImage.forEach((imgData, idx) => {
          if (imgData.status !== 'usable') {
            rejectedIndices.push(idx);
            let r = 'Low confidence';
            if (imgData.reason === 'no_face') r = 'No face detected';
            else if (imgData.reason === 'low_confidence') r = 'Low confidence';
            else if (imgData.reason === 'pad_fake') r = 'Angle/liveness check failed';
            else if (imgData.reason) r = imgData.reason;
            reasons[idx] = r;
          }
        });
        setRejectedImages(rejectedIndices);
        setRejectedReasons(reasons);
        const usableCount = perImage.length - rejectedIndices.length;
        toast.error(
          `${usableCount}/${perImage.length} photos passed confidence check. Use Retake or Laptop option in the red box(es) below.`,
          { duration: 7000 }
        );
      } else {
        setRejectedImages([]);
        setRejectedReasons({});
        toast.error(message);
      }

      setErrors((prev) => ({ ...prev, submit: message }));
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────── Ambient page chrome ───────────────────────────
  // Layered mesh gradient + drifting glow orbs + a faint grid + grain, all
  // fixed behind the content so it never affects scroll/layout on mobile.
  const AmbientBackground = () => (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10 bg-slate-50 dark:bg-slate-950">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1100px 650px at 10% -10%, rgba(49, 92, 232,0.14), transparent 60%),' +
            'radial-gradient(900px 650px at 105% 0%, rgba(217,119,6,0.12), transparent 55%),' +
            'radial-gradient(1000px 700px at 50% 115%, rgba(111, 141, 240,0.10), transparent 60%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.05] dark:opacity-[0.08]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #315CE8 1px, transparent 1px), linear-gradient(to bottom, #315CE8 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)',
        }}
      />
      <div className="absolute -top-24 -left-16 w-72 h-72 sm:w-[28rem] sm:h-[28rem] rounded-full atmo-glow-gold opacity-70 float-y-anuvadini" />
      <div className="absolute top-1/3 -right-20 w-72 h-72 sm:w-[26rem] sm:h-[26rem] rounded-full atmo-glow-cyan opacity-60 float-y-anuvadini" style={{ animationDelay: '2s' }} />
      <div className="absolute bottom-0 left-1/4 w-64 h-64 sm:w-96 sm:h-96 rounded-full atmo-glow-gold opacity-40 float-y-anuvadini" style={{ animationDelay: '4s' }} />
      <div className="absolute inset-0 grain" />
    </div>
  );

  // ─────────────────────────────── Error state ───────────────────────────────
  if (orgInfoError && !orgInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <AmbientBackground />
        <div className="anuvadini-reveal max-w-md w-full glass-cream dark:glass-dark-anuvadini rounded-3xl shadow-elevation-3 p-8 text-center border border-white/60 dark:border-white/10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-50 text-danger-600 dark:bg-danger-900/30 dark:text-danger-400">
            <X className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Registration Unavailable</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{orgInfoError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary mt-4 px-6 py-2.5 text-xs inline-flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reload Form
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────── Success state ──────────────────────────────
  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-10">
        <AmbientBackground />
        <div className="anuvadini-reveal max-w-md w-full rounded-3xl shadow-elevation-4 overflow-hidden border border-white/60 dark:border-white/10">
          <div
            className="relative px-6 pt-10 pb-8 text-center text-white overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0B1220 0%, #101827 35%, #315CE8 65%, #0B1220 100%)' }}
          >
            <div className="chrome-scan" />
            <div className="absolute -top-10 left-1/3 w-40 h-40 rounded-full atmo-glow-gold opacity-70" />
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/15 num-pop">
              <CheckCircle2 className="h-9 w-9 text-emerald-300" />
            </div>
            <h2 className="text-xl font-bold mb-1">Registration Successful!</h2>
            <p className="text-sm text-white/70">Welcome aboard — your account is ready.</p>
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 text-center">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Your Login Credentials</div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 mb-5">
              <div className="text-2xl font-extrabold text-[#315CE8] dark:text-emerald-400 tracking-wide">UID: {result.uid}</div>
              <div className="text-lg font-bold text-[#315CE8] dark:text-emerald-400">Password: {result.uid}</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">(Use your mobile number as both UID and password on first login)</p>
            </div>
            <ul className="text-left text-sm text-slate-600 dark:text-slate-300 space-y-2 stagger-children">
              <li className="flex gap-2 items-start"><span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-bold flex items-center justify-center">1</span>Download the attendance app.</li>
              <li className="flex gap-2 items-start"><span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-bold flex items-center justify-center">2</span>Login using the credentials above.</li>
              <li className="flex gap-2 items-start"><span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-bold flex items-center justify-center">3</span>Mark your face attendance from office premises.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────── Main form ───────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-6 px-3 sm:py-10 sm:px-4">
      <AmbientBackground />

      <div className="mx-auto w-full max-w-2xl">
        {/* Hero header */}
        <div
          className="anuvadini-reveal relative overflow-hidden rounded-3xl mb-5 sm:mb-6 px-5 py-7 sm:px-8 sm:py-9 text-white"
          style={{ background: 'linear-gradient(135deg, #0B1220 0%, #10192e 45%, #1c3a8f 100%)' }}
        >
          <div className="chrome-scan" />
          <span className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full opacity-25" style={{ background: 'radial-gradient(circle, #B9F36A, transparent 65%)' }} />
          <span className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-56 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #315CE8, transparent 65%)' }} />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#B9F36A] backdrop-blur-sm">
              <ScanFace className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold leading-tight text-balance">Employee Self-Registration</h1>
              <p className="text-xs sm:text-sm text-white/70 flex items-center gap-1.5 mt-0.5">
                <Sparkles className="h-3.5 w-3.5" />
                Live face enrollment · Instant credentials
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          {/* Organization */}
          <div
            className="anuvadini-reveal card-hover glass dark:glass-dark-anuvadini rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/60 dark:border-white/10"
            style={{ animationDelay: '60ms' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-[#315CE8] dark:text-emerald-400" />
              <span className="section-title text-sm font-extrabold text-slate-800 dark:text-slate-100 tracking-normal normal-case">Organization</span>
              <span className="text-danger-600 text-xs font-bold">*</span>
            </div>
            <CustomSelect
              value={organization}
              onChange={setOrganization}
              options={organizations}
              pill
              placeholder="Choose organization"
            />
            {errors.organization && <p className="text-xs text-danger-600 mt-1.5">{errors.organization}</p>}
          </div>

          {/* Personal details */}
          <div
            className="anuvadini-reveal glass dark:glass-dark-anuvadini rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/60 dark:border-white/10 space-y-4"
            style={{ animationDelay: '120ms' }}
          >
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-[#315CE8] dark:text-emerald-400" />
              <span className="section-title text-sm font-extrabold text-slate-800 dark:text-slate-100 tracking-normal normal-case">Personal Details</span>
              <span className="text-danger-600 text-xs font-bold">*</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 stagger-children">
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Full Name <span className="text-danger-600">*</span>
                </label>
                <div className="relative">
                  <User className={FIELD_ICON_CLASS} />
                  <input name="fullName" value={formData.fullName} onChange={handleChange} required className="input pl-9" placeholder="e.g. Priya Sharma" />
                </div>
                {errors.fullName && <p className="text-xs text-danger-600 mt-1">{errors.fullName}</p>}
              </div>
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Mobile Number <span className="text-danger-600">*</span>
                </label>
                <div className="relative">
                  <Phone className={FIELD_ICON_CLASS} />
                  <input name="uid" value={formData.uid} onChange={handleChange} maxLength={10} inputMode="numeric" required className="input pl-9" placeholder="10-digit number" />
                </div>
                {errors.uid && <p className="text-xs text-danger-600 mt-1">{errors.uid}</p>}
              </div>

              <div className="relative sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Email Address <span className="text-danger-600">*</span>
                </label>
                <div className="relative">
                  <Mail className={FIELD_ICON_CLASS} />
                  <input type="email" name="email" value={formData.email} onChange={handleChange} required className="input pl-9" placeholder="you@example.com" />
                </div>
                {errors.email && <p className="text-xs text-danger-600 mt-1">{errors.email}</p>}
              </div>
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Age <span className="text-danger-600">*</span>
                </label>
                <div className="relative">
                  <Calendar className={FIELD_ICON_CLASS} />
                  <input type="number" name="age" min="1" max="120" value={formData.age} onChange={handleChange} required className="input pl-9" placeholder="Age" />
                </div>
                {errors.age && <p className="text-xs text-danger-600 mt-1">{errors.age}</p>}
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Gender <span className="text-danger-600">*</span>
                </label>
                <CustomSelect
                  icon={Users}
                  value={formData.gender}
                  onChange={(v) => setFormData((prev) => ({ ...prev, gender: v }))}
                  options={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                    { value: 'other', label: 'Other' },
                  ]}
                  placeholder="Select Gender"
                />
                {errors.gender && <p className="text-xs text-danger-600 mt-1">{errors.gender}</p>}
              </div>

              {orgInfo && (orgInfo.organizationType === 'school' || orgInfo.organizationType === 'institute') && (
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Class <span className="text-danger-600">*</span>
                  </label>
                  <input name="class" list="class-options" value={formData.class} onChange={handleChange} required className="input" />
                  <datalist id="class-options">
                    {(orgInfo.classes || []).map((c) => <option key={c} value={c} />)}
                  </datalist>
                  {errors.class && <p className="text-xs text-danger-600 mt-1">{errors.class}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Face enrollment */}
          <div
            className="anuvadini-reveal glass dark:glass-dark-anuvadini rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/60 dark:border-white/10"
            style={{ animationDelay: '180ms' }}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <ScanFace className="h-4 w-4 text-[#315CE8] dark:text-emerald-400" />
                <span className="section-title text-sm font-extrabold text-slate-800 dark:text-slate-100 tracking-normal normal-case">Live Face Photos</span>
                <span className="text-danger-600 text-xs font-bold">*</span>
              </div>
              <span className={`badge ${faceComplete ? 'badge-success' : 'badge-warning'}`}>
                {faceImages.length}/{minFaceImages}
              </span>
            </div>

            {/* progress bar */}
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-4">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${Math.min(100, (validFaceImages.length / minFaceImages) * 100)}%`,
                  background: faceComplete
                    ? 'linear-gradient(90deg, #8FD13C, #B9F36A)'
                    : 'linear-gradient(90deg, #315CE8, #6F8DF0)',
                }}
              />
            </div>

            {/* Mobile QR Card - Scan to Open on Phone */}
            <div className="mb-4 rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/90 to-indigo-50/60 dark:border-blue-900/40 dark:bg-slate-800/70 p-3.5">
              <div className="flex flex-col sm:flex-row items-center gap-3.5">
                <div
                  onClick={() => setShowQrModal(true)}
                  className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm cursor-pointer shrink-0 hover:scale-105 transition-transform"
                  title="Click to enlarge QR code"
                >
                  <QRCodeSVG value={currentUrl} size={84} level="M" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wide">
                    <Smartphone className="h-4 w-4 text-[#315CE8]" />
                    Mobile Scanner Option
                  </div>
                  <p className="text-[12px] text-slate-600 dark:text-slate-300 mt-1">
                    Laptop camera blocked? <b>Scan this QR code with your mobile phone camera</b> to open this form directly on your phone and take photos with your mobile camera.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(currentUrl);
                        toast.success('Registration link copied!');
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#315CE8] bg-white dark:bg-slate-700 dark:text-blue-300 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1 hover:bg-blue-50 transition shadow-2xs"
                    >
                      <Copy className="h-3 w-3" /> Copy Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQrModal(true)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1 hover:bg-slate-100 transition shadow-2xs"
                    >
                      <QrCode className="h-3 w-3" /> Enlarge QR
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 5 Different Angles Guidance & Selection Header */}
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                  <ScanFace className="h-4 w-4 text-[#315CE8]" />
                  Capture 5 Angles ({validFaceImages.length}/{minFaceImages})
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tap each box below to take a photo or select an image for that angle.
                </p>
              </div>
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold text-[#315CE8] hover:text-blue-700 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg px-2.5 py-1.5 transition">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Select All 5</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleBatchUpload}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => openWebcamForSlot(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition"
                >
                  <Camera className="h-3.5 w-3.5 text-slate-500" />
                  <span>Webcam</span>
                </button>
              </div>
            </div>

            {/* 5 Angle Selection Slots */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {FACE_ANGLES.map((angle, idx) => {
                const file = faceImages[idx];
                const isRejected = rejectedImages.includes(idx);
                const reason = rejectedReasons[idx];
                const inputId = `face-angle-input-${idx}`;

                return (
                  <div
                    key={angle.id}
                    className={`relative rounded-2xl border-2 transition-all p-2 flex flex-col items-center text-center justify-between ${
                      file
                        ? isRejected
                          ? 'border-danger-500 bg-danger-50/50 dark:bg-danger-950/30 ring-2 ring-danger-400/30 shadow-xs'
                          : 'border-emerald-500/80 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-2xs'
                        : 'border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/40 hover:border-[#315CE8] hover:bg-blue-50/30'
                    }`}
                    style={{ minHeight: '165px' }}
                  >
                    {file ? (
                      <>
                        <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-1 border border-slate-200 dark:border-slate-700 bg-slate-900 group">
                          <img
                            src={URL.createObjectURL(file)}
                            alt={angle.title}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveFaceImage(idx)}
                            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-danger-600 transition"
                            title="Remove photo"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          {isRejected ? (
                            <span className="absolute bottom-1 left-1 bg-danger-600 text-white text-[8.5px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-0.5 animate-pulse">
                              <AlertCircle className="h-2.5 w-2.5" /> Low Score
                            </span>
                          ) : (
                            <span className="absolute bottom-1 left-1 bg-emerald-600 text-white text-[8.5px] font-bold px-1.5 py-0.5 rounded shadow flex items-center gap-0.5">
                              <Check className="h-2.5 w-2.5" /> OK
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate w-full">
                          {angle.title}
                        </div>
                        {isRejected && (
                          <div className="text-[9.5px] text-danger-600 dark:text-danger-400 font-semibold truncate w-full mt-0.5">
                            {reason || 'Low confidence'}
                          </div>
                        )}
                        {/* Retake and Laptop action buttons in the box */}
                        <div className="mt-1.5 w-full flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openWebcamForSlot(idx)}
                            className={`flex-1 flex items-center justify-center gap-0.5 text-[9.5px] font-bold py-1 px-1 rounded-lg transition ${
                              isRejected
                                ? 'bg-danger-600 text-white hover:bg-danger-700 shadow-xs'
                                : 'bg-blue-50 text-[#315CE8] hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300'
                            }`}
                            title="Retake photo using webcam"
                          >
                            <Camera className="h-2.5 w-2.5 shrink-0" />
                            <span>Retake</span>
                          </button>
                          <label
                            htmlFor={inputId}
                            className="flex-1 flex items-center justify-center gap-0.5 text-[9.5px] font-bold py-1 px-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition shadow-2xs"
                            title="Upload from laptop"
                          >
                            <Upload className="h-2.5 w-2.5 shrink-0 text-slate-400" />
                            <span className="truncate">Laptop</span>
                          </label>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-between p-1">
                        <div className="flex flex-col items-center">
                          <div className="h-7 w-7 rounded-full bg-blue-50 dark:bg-slate-800 text-[#315CE8] flex items-center justify-center mb-1">
                            <Camera className="h-3.5 w-3.5" />
                          </div>
                          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 leading-tight">
                            {angle.title}
                          </div>
                          <div className="text-[9.5px] text-slate-400 mt-0.5 leading-tight">
                            {angle.desc}
                          </div>
                        </div>
                        <div className="mt-2 w-full flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openWebcamForSlot(idx)}
                            className="flex-1 flex items-center justify-center gap-0.5 text-[9.5px] font-bold py-1 px-1 rounded-lg bg-[#315CE8] text-white hover:bg-blue-700 transition shadow-2xs"
                            title="Take photo with webcam"
                          >
                            <Camera className="h-2.5 w-2.5 shrink-0" />
                            <span>Camera</span>
                          </button>
                          <label
                            htmlFor={inputId}
                            className="flex-1 flex items-center justify-center gap-0.5 text-[9.5px] font-bold py-1 px-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition shadow-2xs"
                            title="Upload file from laptop"
                          >
                            <Upload className="h-2.5 w-2.5 shrink-0 text-slate-400" />
                            <span className="truncate">Laptop</span>
                          </label>
                        </div>
                      </div>
                    )}

                    <input
                      id={inputId}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleSelectAngleImage(idx, e)}
                    />
                  </div>
                );
              })}
            </div>

            {rejectedImages.length > 0 && (
              <div className="mt-3.5 flex items-start gap-2.5 rounded-2xl bg-danger-50 dark:bg-danger-900/25 border-2 border-danger-200 dark:border-danger-900/50 p-3.5 text-xs text-danger-800 dark:text-danger-200 animate-shake shadow-xs">
                <AlertCircle className="h-5 w-5 text-danger-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">
                    {validFaceImages.length - rejectedImages.length}/{validFaceImages.length} photos passed quality & confidence checks.
                  </p>
                  <p className="text-[11px] text-danger-700 dark:text-danger-300 mt-0.5">
                    The box(es) marked in red did not meet the confidence score. Click <b>Retake</b> to use your camera or <b>Laptop</b> to choose another file directly in those boxes.
                  </p>
                </div>
              </div>
            )}
            {errors.faceImages && <p className="text-xs text-danger-600 mt-2">{errors.faceImages}</p>}
          </div>

          {errors.submit && (
            <div className="anuvadini-reveal rounded-2xl bg-danger-50 dark:bg-danger-900/20 border border-danger-100 dark:border-danger-900/40 px-4 py-3 text-sm text-danger-700 dark:text-danger-400 animate-shake">
              {errors.submit}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !orgInfo}
            className="btn-primary w-full py-3.5 text-sm gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Registering…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Register
              </>
            )}
          </button>
        </form>
      </div>

      {/* Fullscreen Mobile QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="compliance-backdrop fixed inset-0 bg-slate-900/70 backdrop-blur-md" onClick={() => setShowQrModal(false)} />
          <div className="compliance-modal relative w-full max-w-sm rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center shadow-elevation-4">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#315CE8] dark:bg-blue-900/30">
              <QrCode className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1">
              Scan with Mobile Camera
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Open your phone's camera app or Google Lens and point it at this QR code to complete face registration from your mobile.
            </p>
            <div className="mx-auto w-fit p-3 bg-white rounded-2xl border border-slate-200 shadow-md mb-4">
              <QRCodeSVG value={currentUrl} size={180} level="M" />
            </div>
            <div className="text-[11px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg p-2 break-all mb-4">
              {currentUrl}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(currentUrl);
                  toast.success('Registration link copied!');
                }}
                className="btn-primary flex-1 py-2 text-xs gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" /> Copy Link
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="btn-secondary py-2 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live camera capture modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="compliance-backdrop fixed inset-0 bg-slate-900/70 backdrop-blur-md" onClick={() => setCameraOpen(false)} />
          <div className="compliance-modal relative w-full sm:max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-elevation-4 p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <ScanFace className="h-5 w-5 text-[#315CE8] dark:text-emerald-400" />
                  {activeWebcamSlot !== null
                    ? `Retake: ${FACE_ANGLES[activeWebcamSlot]?.title}`
                    : 'Live Face Capture'}
                </h3>
                {activeWebcamSlot !== null && (
                  <p className="text-xs text-[#315CE8] dark:text-blue-400 font-semibold mt-0.5">
                    {FACE_ANGLES[activeWebcamSlot]?.desc}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setCameraOpen(false); setActiveWebcamSlot(null); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {cameraBlocked && (
              <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40 p-3 text-center">
                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Camera Blocked by Browser</p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1">
                  Modern browsers only permit direct webcam access over HTTPS. Please close this modal and use the <b>5-Angle Photo Selector</b> or scan the <b>Mobile QR</b> with your phone.
                </p>
                <div className="flex gap-2 justify-center mt-2.5">
                  <button
                    type="button"
                    onClick={() => setCameraOpen(false)}
                    className="text-xs font-bold bg-[#315CE8] text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                  >
                    Switch to 5-Angle Selector
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCameraOpen(false); setShowQrModal(true); }}
                    className="text-xs font-bold bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 flex items-center gap-1"
                  >
                    <QrCode className="h-3 w-3" /> Mobile QR
                  </button>
                </div>
              </div>
            )}

            <div className={`relative overflow-hidden rounded-2xl border-2 bg-slate-900 flex items-center justify-center transition-colors duration-300 ${justCaptured ? 'border-emerald-400' : 'border-slate-200 dark:border-slate-700'}`}>
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ width: 1280, height: 720, facingMode: 'user' }}
                onUserMedia={() => { setCameraReady(true); setCameraBlocked(false); }}
                onUserMediaError={() => {
                  setCameraReady(false);
                  setCameraBlocked(true);
                  toast.error('Could not access camera. Browser blocks camera over HTTP — use the 5-angle photo selector instead!');
                }}
                className="w-full h-auto object-cover max-h-[45vh] sm:max-h-[320px]"
              />
              {/* Face framing guide */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-[46%] aspect-[3/4] rounded-[45%] border-2 border-white/40" />
              </div>
              {justCaptured && (
                <div className="absolute inset-0 bg-white/30 animate-fade-in-fast" />
              )}
              {!cameraReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/70 text-white">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-xs font-semibold">Starting camera…</span>
                </div>
              )}
            </div>

            {/* Slot dots */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {Array.from({ length: minFaceImages }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${i < faceImages.length ? 'bg-[#315CE8] dark:bg-emerald-400 scale-110' : 'bg-slate-200 dark:bg-slate-700'}`}
                />
              ))}
            </div>
            <p className={`text-xs font-semibold mt-2 text-center ${faceComplete ? 'text-success-600 dark:text-success-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {faceImages.length}/{minFaceImages} captured{faceComplete ? ' — limit reached' : ''}
            </p>

            <div className="flex flex-col sm:flex-row justify-end gap-2.5 mt-4">
              <button
                type="button"
                onClick={() => { setCameraOpen(false); setActiveWebcamSlot(null); }}
                className="btn-secondary order-2 sm:order-1"
              >
                Done
              </button>
              <button
                type="button"
                onClick={handleCaptureSnapshot}
                disabled={!cameraReady || (activeWebcamSlot === null && faceComplete)}
                className={`btn order-1 sm:order-2 gap-2 ${
                  !cameraReady || (activeWebcamSlot === null && faceComplete)
                    ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                    : 'bg-gradient-to-b from-success-500 to-success-600 text-white shadow-sm shadow-success-700/20 hover:from-success-600 hover:to-success-700'
                }`}
              >
                {cameraReady ? <Camera className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                {cameraReady
                  ? activeWebcamSlot !== null
                    ? `Save ${FACE_ANGLES[activeWebcamSlot]?.title || 'Photo'}`
                    : 'Capture Snapshot'
                  : 'Starting camera…'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicRegister;
