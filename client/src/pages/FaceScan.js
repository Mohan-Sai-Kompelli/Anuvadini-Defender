import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './face.css';

const HEAD_URL = '/assets/head.glb';

const SAY = {
  email: ['Got it, keep going…', 'Ooh, who is signing in?'],
  password: ["I'm not looking! 🙈"],
  peek: ['Okay… just one little peek 👀'],
  loading: ['Scanning… hold still!'],
  error: ["Hmm, that didn't match. Try again?"],
  success: ['Welcome back! 🎉'],
};
const IDLE = ['Hi! Ready to sign in? 👋', 'Your face, scanned in 3D ✨', 'Move your mouse. I can follow 👀'];

const CONFETTI = Array.from({ length: 34 }).map((_, i) => {
  const a = (i / 34) * Math.PI * 2 + (i % 3) * 0.2;
  const d = 110 + ((i * 37) % 110);
  return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 50, rot: (i * 47) % 360, c: ['#B9F36A', '#315CE8', '#6F8DF0', '#385D27', '#F5A524'][i % 5], s: 6 + (i % 4) * 2, delay: (i % 6) * 0.03 };
});

const COLOR = { scan: new THREE.Color('#315CE8'), ok: new THREE.Color('#7FD21E'), bad: new THREE.Color('#E5484D') };

/** Loads the head scan, normalises it, and drives the holographic scan from `mood`. */
function Head({ mood, pointer, capRef }) {
  const gltf = useLoader(GLTFLoader, HEAD_URL);
  const group = useRef();
  const beam = useRef();
  const wire = useRef();
  const pts = useRef();
  const glass = useRef();
  const t = useRef(0);
  const extra = useRef({ spin: 0, spinGoal: 0, pop: 1, beam: 1 });
  const lastCap = useRef('');
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  const geometry = useMemo(() => {
    let geo = null;
    gltf.scene.traverse((o) => { if (!geo && o.isMesh) geo = o.geometry.clone(); });
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const s = 2.9 / size.y;
    geo.translate(-center.x, -center.y, -center.z);
    geo.scale(s, s, s);
    geo.computeVertexNormals();
    return geo;
  }, [gltf]);

  useEffect(() => { if (mood === 'success') extra.current.spinGoal += Math.PI * 2; }, [mood]);

  useFrame((state, dt) => {
    const e = extra.current;
    const fast = mood === 'loading' ? 2.6 : 1;
    t.current += dt * fast;
    const c = t.current % 6;

    // ── scan phase ──
    let scanY = 1.6 - (Math.min(c, 3.2) / 3.2) * 3.2; // 1.6 → -1.6
    let mix = 0; // 0 cobalt → 1 verified green
    let wireOp = 0.55; let ptsOp = 0.9; let beamOp = 1; let cap = 'Scanning…';
    if (c >= 3.2 && c < 3.5) { mix = (c - 3.2) / 0.3; beamOp = 1 - mix; cap = 'Verified ✓'; }
    else if (c >= 3.5 && c < 5.3) { mix = 1; beamOp = 0; cap = 'Verified ✓'; }
    else if (c >= 5.3) { mix = 1; beamOp = 0; const k = (c - 5.3) / 0.7; wireOp *= 1 - k; ptsOp *= 1 - k; scanY = -1.6; cap = 'Verified ✓'; }

    let target = 'idle';
    let tint = mix;
    if (mood === 'success') { scanY = -1.7; tint = 1; beamOp = 0; wireOp = 0.7; ptsOp = 1; cap = 'Verified ✓'; target = 'success'; }
    else if (mood === 'error') { scanY = -1.7; tint = -1; beamOp = 0; wireOp = 0.7; ptsOp = 1; cap = 'No match'; target = 'error'; }
    else if (mood === 'password' || mood === 'peek') { wireOp *= 0; ptsOp = 0; beamOp = 0; cap = 'Private'; target = 'away'; }
    else if (mood === 'loading') { cap = 'Checking…'; }

    plane.constant = -scanY;
    const col = tint < 0 ? COLOR.bad : COLOR.scan.clone().lerp(COLOR.ok, Math.max(0, tint));
    if (wire.current) { wire.current.material.color.copy(col); wire.current.material.opacity += (wireOp - wire.current.material.opacity) * Math.min(1, dt * 8); }
    if (pts.current) { pts.current.material.opacity += (ptsOp - pts.current.material.opacity) * Math.min(1, dt * 8); pts.current.material.color.set(tint < 0 ? '#FF8A8A' : tint > 0.5 ? '#B9F36A' : '#8FD13C'); }
    if (beam.current) {
      e.beam += (beamOp - e.beam) * Math.min(1, dt * 10);
      beam.current.position.y = scanY;
      beam.current.visible = e.beam > 0.02;
      beam.current.children[0].material.opacity = 0.95 * e.beam;
      beam.current.children[1].material.opacity = 0.16 * e.beam;
    }
    if (glass.current) {
      const m = glass.current.material;
      m.emissive.copy(col).multiplyScalar(target === 'success' || target === 'error' ? 0.35 : 0.08);
    }

    // ── head motion ──
    const g = group.current;
    let ty = pointer.current.x * 0.6;
    let tx = -pointer.current.y * 0.28;
    if (mood === 'email') { ty = 0.55; tx = 0.05; }
    if (target === 'away') { ty = mood === 'peek' ? Math.PI * 0.78 : Math.PI; tx = 0; }
    if (target === 'error') ty += Math.sin(state.clock.elapsedTime * 28) * 0.28 * Math.max(0, 1 - ((state.clock.elapsedTime * 2) % 1.4));
    e.spin += (e.spinGoal - e.spin) * Math.min(1, dt * 3.2);
    const damp = Math.min(1, dt * 6);
    g.rotation.y += (ty + e.spin - g.rotation.y) * damp;
    g.rotation.x += (tx - g.rotation.x) * damp;
    const popGoal = target === 'success' ? 1.07 : 1;
    e.pop += (popGoal - e.pop) * Math.min(1, dt * 6);
    g.scale.setScalar(e.pop);
    g.position.y = target === 'success' ? Math.abs(Math.sin(state.clock.elapsedTime * 7)) * 0.12 : 0;

    if (capRef.current && cap !== lastCap.current) { lastCap.current = cap; capRef.current.textContent = cap; }
  });

  return (
    <group ref={group}>
      <mesh ref={glass} geometry={geometry}>
        <meshStandardMaterial color="#E8EEFF" roughness={0.3} metalness={0.05} transparent opacity={0.9} emissive="#315CE8" emissiveIntensity={1} />
      </mesh>
      <mesh ref={wire} geometry={geometry} scale={1.004}>
        <meshBasicMaterial color="#315CE8" wireframe transparent opacity={0.55} clippingPlanes={[plane]} depthWrite={false} />
      </mesh>
      <points ref={pts} geometry={geometry} scale={1.006}>
        <pointsMaterial color="#8FD13C" size={0.014} sizeAttenuation transparent opacity={0.9} clippingPlanes={[plane]} depthWrite={false} />
      </points>
      <group ref={beam}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.25, 0.012, 8, 120]} />
          <meshBasicMaterial color="#B9F36A" transparent opacity={0.95} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.25, 0.07, 8, 120]} />
          <meshBasicMaterial color="#B9F36A" transparent opacity={0.16} />
        </mesh>
      </group>
    </group>
  );
}

/** Soft glowing platform under the head. */
function Pedestal() {
  return (
    <group position={[0, -1.75, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh><ringGeometry args={[1.0, 1.06, 96]} /><meshBasicMaterial color="#315CE8" transparent opacity={0.55} /></mesh>
      <mesh><ringGeometry args={[1.3, 1.34, 96]} /><meshBasicMaterial color="#B9F36A" transparent opacity={0.5} /></mesh>
      <mesh><circleGeometry args={[1.5, 64]} /><meshBasicMaterial color="#315CE8" transparent opacity={0.07} /></mesh>
    </group>
  );
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const Fallback = () => (
  <div className="fs__fallback" aria-hidden>
    <svg viewBox="0 0 120 150" width="150"><ellipse cx="60" cy="72" rx="38" ry="50" fill="#EAF0FF" stroke="#315CE8" strokeWidth="3" /><circle cx="46" cy="64" r="4" fill="#17191C" /><circle cx="74" cy="64" r="4" fill="#17191C" /><path d="M46 92 q14 10 28 0" fill="none" stroke="#17191C" strokeWidth="3" strokeLinecap="round" /></svg>
  </div>
);

/**
 * A holographic 3D face scan. `mood` comes from the sign-in form and changes
 * how the head behaves; the pointer makes the head follow the cursor.
 */
const FaceScan = ({ reduce, mood = 'idle' }) => {
  const capRef = useRef(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [idleIdx, setIdleIdx] = useState(0);
  const [burst, setBurst] = useState(0);
  const [poked, setPoked] = useState(false);

  useEffect(() => {
    if (reduce) return undefined;
    const move = (e) => { pointer.current.x = (e.clientX / window.innerWidth - 0.35) * 1.6; pointer.current.y = (e.clientY / window.innerHeight - 0.45) * 1.6; };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [reduce]);

  useEffect(() => {
    if (mood !== 'idle') return undefined;
    const i = setInterval(() => setIdleIdx((n) => (n + 1) % IDLE.length), 4200);
    return () => clearInterval(i);
  }, [mood]);

  useEffect(() => { if (mood === 'success') setBurst((b) => b + 1); }, [mood]);

  const say = mood === 'idle' ? (poked ? 'Ouch… just kidding 😄' : IDLE[idleIdx]) : SAY[mood][burst % SAY[mood].length];
  const poke = () => { setPoked(true); setTimeout(() => setPoked(false), 1800); };

  return (
    <div className="fs" data-mood={mood}>
      <div className="fs__say" key={say} role="status" aria-live="polite">{say}</div>

      <div className="fs__stage" onClick={poke} aria-label="Animated 3D face scan" role="img">
        <Boundary fallback={<Fallback />}>
          <Canvas
            dpr={[1, 1.75]}
            camera={{ position: [0, 0.05, 6.9], fov: 32 }}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => { gl.localClippingEnabled = true; }}
            frameloop={reduce ? 'demand' : 'always'}
          >
            <ambientLight intensity={0.9} />
            <directionalLight position={[3, 4, 5]} intensity={2.1} />
            <directionalLight position={[-4, 1, -3]} intensity={1.6} color="#6F8DF0" />
            <directionalLight position={[4, -2, 2]} intensity={0.9} color="#B9F36A" />
            <Suspense fallback={null}>
              <Head mood={mood} pointer={pointer} capRef={capRef} />
              <Pedestal />
            </Suspense>
          </Canvas>
        </Boundary>

        <div className="fs__brackets" aria-hidden><i /><i /><i /><i /></div>
        <div className="fs__cap"><span className="fs__led" /><b ref={capRef}>Scanning…</b></div>

        {mood === 'success' && !reduce && (
          <div className="fs__confetti" aria-hidden key={burst}>
            {CONFETTI.map((p, i) => (
              <i key={i} style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, background: p.c, width: p.s, height: p.s * 1.6, animationDelay: `${p.delay}s` }} />
            ))}
          </div>
        )}
      </div>

      <p className="fs__credit">3D head scan: Lee Perry-Smith, <a href="http://www.triplegangers.com" target="_blank" rel="noreferrer">triplegangers.com</a> (CC BY 3.0)</p>
    </div>
  );
};

export default FaceScan;
