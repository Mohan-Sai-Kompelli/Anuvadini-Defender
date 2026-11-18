import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group } from 'three';

function Shapes() {
  const g = useRef<Group>(null);
  const hand = useRef<Group>(null);
  useFrame((st, dt) => {
    if (g.current) {
      g.current.rotation.y = Math.sin(st.clock.elapsedTime * 0.25) * 0.5;
      g.current.rotation.x = -0.35 + Math.cos(st.clock.elapsedTime * 0.2) * 0.12;
    }
    if (hand.current) hand.current.rotation.z -= dt * 0.5;
  });
  return (
    <group ref={g}>
      <mesh>
        <torusGeometry args={[1.35, 0.3, 32, 120]} />
        <meshStandardMaterial color="#315CE8" transparent opacity={0.72} roughness={0.2} metalness={0.2} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[1.05, 1.05, 0.12, 64]} />
        <meshStandardMaterial color="#EAF0FF" transparent opacity={0.55} roughness={0.15} />
      </mesh>
      <group ref={hand}>
        <mesh position={[0, 0.45, 0.1]}>
          <boxGeometry args={[0.12, 0.95, 0.1]} />
          <meshStandardMaterial color="#B9F36A" emissive="#6fa310" emissiveIntensity={0.25} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.1]}>
        <sphereGeometry args={[0.14, 24, 24]} />
        <meshStandardMaterial color="#17191C" />
      </mesh>
      <mesh position={[1.78, 0, 0]}>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshStandardMaterial color="#B9F36A" emissive="#6fa310" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

/** Decorative 3D object. Rendered only on desktop; pauses when off-screen. */
export default function HeroOrb({ active }: { active: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.6]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0, 5], fov: 40 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      aria-hidden
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} />
      <directionalLight position={[-4, -2, 2]} intensity={0.8} color="#B9F36A" />
      <Shapes />
    </Canvas>
  );
}
