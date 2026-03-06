import { useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GlobalProjection } from '@/lib/types';

interface ModelProps {
  soul: GlobalProjection | null;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function WallEModel({ soul, ...props }: ModelProps) {
  const { scene } = useGLTF('/assets/models/walle.glb');
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    const fatigue = typeof soul?.crossFunctionalState?.biological?.cnsFatigue === 'number'
      ? soul.crossFunctionalState.biological.cnsFatigue
      : null;
    const targetRotation = fatigue !== null && fatigue > 7 ? Math.PI / 12 : 0;
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, targetRotation, 0.05);
    const speed = fatigue !== null && fatigue > 7 ? 0.5 : 1.2;
    group.current.position.y = Math.sin(state.clock.elapsedTime * speed) * 0.1;
  });
  return <group ref={group}><primitive object={scene} {...props} /></group>;
}

export function EveModel({ soul, ...props }: ModelProps) {
  const { scene } = useGLTF('/assets/models/eve.glb');
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    const resilience = typeof soul?.crossFunctionalState?.emotional?.emotionalResilience === 'number'
      ? soul.crossFunctionalState.emotional.emotionalResilience
      : null;
    const jitter = resilience !== null && resilience < 4 ? Math.sin(state.clock.elapsedTime * 10) * 0.05 : 0;
    group.current.position.y = (Math.sin(state.clock.elapsedTime * 2) * 0.2) + jitter;
    const targetTilt = resilience !== null && resilience < 5 ? -Math.PI / 16 : 0;
    group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, targetTilt, 0.05);
  });
  return <group ref={group}><primitive object={scene} {...props} /></group>;
}

export function LedgerModel(props: Omit<ModelProps, 'soul'>) {
  const { scene } = useGLTF('/assets/models/ledger.glb');
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y += 0.005;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
  });
  return <group ref={group}><primitive object={scene} {...props} /></group>;
}

export function SomaModel({ scale = 1, ...props }: Omit<ModelProps, 'soul'>) {
  const { scene } = useGLTF('/assets/models/soma.glb');
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y += 0.003;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.08;
  });
  return <group ref={group}><primitive object={scene} scale={scale * 0.5} {...props} /></group>;
}

export function ForgeModel({ scale = 1, ...props }: Omit<ModelProps, 'soul'>) {
  const { scene } = useGLTF('/assets/models/forge.glb');
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y += 0.004;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.06;
  });
  return <group ref={group}><primitive object={scene} scale={scale * 0.03} {...props} /></group>;
}

export function NexusModel(props: Omit<ModelProps, 'soul'>) {
  const { scene } = useGLTF('/assets/models/nexus.glb');
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y += 0.002;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.03;
  });
  return <group ref={group}><primitive object={scene} {...props} /></group>;
}

interface PolyPodModelProps {
  color: string;
  shape: 'icosa' | 'dodeca' | 'octa' | 'tetra' | 'torus' | 'cone' | 'prism';
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export function PolyPodModel({ color, shape, ...props }: PolyPodModelProps) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    mesh.current.rotation.y += 0.008;
    mesh.current.rotation.x += 0.006;
  });
  return (
    <mesh ref={mesh} {...props}>
      {shape === 'dodeca' && <dodecahedronGeometry args={[0.7, 0]} />}
      {shape === 'octa' && <octahedronGeometry args={[0.75, 0]} />}
      {shape === 'tetra' && <tetrahedronGeometry args={[0.8, 0]} />}
      {shape === 'torus' && <torusKnotGeometry args={[0.42, 0.14, 120, 16]} />}
      {shape === 'cone' && <coneGeometry args={[0.7, 1.2, 24]} />}
      {shape === 'prism' && <cylinderGeometry args={[0.45, 0.6, 1.1, 18]} />}
      {shape === 'icosa' && <icosahedronGeometry args={[0.75, 0]} />}
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} metalness={0.4} roughness={0.2} />
    </mesh>
  );
}

useGLTF.preload('/assets/models/walle.glb');
useGLTF.preload('/assets/models/eve.glb');
useGLTF.preload('/assets/models/ledger.glb');
useGLTF.preload('/assets/models/soma.glb');
useGLTF.preload('/assets/models/forge.glb');
useGLTF.preload('/assets/models/nexus.glb');
