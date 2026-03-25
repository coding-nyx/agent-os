import React, { useRef, useMemo, useEffect, useCallback, useState, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useGLTF, Float, ContactShadows, OrbitControls, Html, useProgress } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Sparkles, Loader2 } from 'lucide-react';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { cn } from '@/lib/utils';
import type { GlobalProjection } from '@/lib/types';
import type { FloatingPodProps } from '../../constants';
import { CORE_MODULES } from '../../constants';
import { WallEModel, EveModel, LedgerModel, PolyPodModel, ForgeModel, AtlasModel, NexusModel } from './models';

// --- Neural Flow (Star-topology connections from center to modules) ---

function NexusFlow({ start, end, color, isPlugin, pulseRef }: { 
  start: THREE.Vector3; 
  end: THREE.Vector3; 
  color: string; 
  isPlugin: boolean;
  pulseRef: React.MutableRefObject<number>;
}) {
  const lineRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const glowMatRef = useRef<THREE.MeshStandardMaterial>(null);
  
  // Create a smooth, bulky arc from center to pod
  const curve = useMemo(() => {
    // Deep anchoring logic: extend start/end deeper into models to hide bobbing gaps
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    const adjStart = start.clone().sub(dir.clone().multiplyScalar(0.4)); // Deep into Nexus
    const adjEnd = end.clone().add(dir.clone().multiplyScalar(0.8)); // Deep into Pod
    
    const mid = new THREE.Vector3().addVectors(adjStart, adjEnd).multiplyScalar(0.5);
    mid.y += isPlugin ? 1.0 : 2.5; // Arch it upwards for a bulky look
    
    return new THREE.QuadraticBezierCurve3(adjStart, mid, adjEnd);
  }, [start, end, isPlugin]);

  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 64, isPlugin ? 0.012 : 0.035, 8, false), [curve, isPlugin]);
  const glowGeometry = useMemo(() => new THREE.TubeGeometry(curve, 64, isPlugin ? 0.025 : 0.06, 8, false), [curve, isPlugin]);

  useEffect(() => {
    return () => { 
      geometry.dispose(); 
      glowGeometry.dispose();
    };
  }, [geometry, glowGeometry]);

  useFrame((state) => {
    if (!matRef.current || !glowMatRef.current) return;
    const baseOpacity = isPlugin ? 0.04 : 0.12;
    const pulseIntensity = pulseRef.current * (isPlugin ? 0.2 : 0.5);
    
    matRef.current.opacity = baseOpacity + pulseIntensity;
    matRef.current.emissiveIntensity = 0.4 + pulseRef.current * 2.5;
    
    glowMatRef.current.opacity = (baseOpacity * 0.5) + (pulseIntensity * 0.8);
    glowMatRef.current.emissiveIntensity = 0.2 + pulseRef.current * 4;
  });

  return (
    <>
      {/* Primary bulkier nerve fiber */}
      <mesh geometry={geometry}>
        <meshStandardMaterial 
          ref={matRef} 
          color={color} 
          emissive={color} 
          transparent 
          opacity={0.12} 
          depthWrite={false}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      {/* Secondary outer glow/aura - No scale here, use larger geometry instead */}
      <mesh geometry={glowGeometry}>
        <meshStandardMaterial 
          ref={glowMatRef} 
          color={color} 
          emissive={color} 
          transparent 
          opacity={0.05} 
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Bidirectional for Core, Unidirectional for Plugins */}
      <FlowParticles curve={curve} color={color} isPlugin={isPlugin} pulseRef={pulseRef} direction="out" />
      {!isPlugin && (
        <FlowParticles curve={curve} color={color} isPlugin={isPlugin} pulseRef={pulseRef} direction="in" />
      )}
    </>
  );
}

function FlowParticles({ curve, color, isPlugin, pulseRef, direction }: { 
  curve: THREE.Curve<THREE.Vector3>; 
  color: string; 
  isPlugin: boolean;
  pulseRef: React.MutableRefObject<number>;
  direction: 'in' | 'out';
}) {
  const count = isPlugin ? 8 : 12;
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const offsets = useMemo(() => Array.from({ length: count }, () => Math.random()), []);

  useFrame(() => {
    if (!ref.current) return;
    const speed = (isPlugin ? 0.02 : 0.04) + pulseRef.current * 0.1;
    for (let i = 0; i < count; i++) {
      if (direction === 'out') {
        offsets[i] = (offsets[i] + speed * 0.01 * (1 + i * 0.05)) % 1;
      } else {
        offsets[i] = (offsets[i] - speed * 0.01 * (1 + i * 0.05));
        if (offsets[i] < 0) offsets[i] = 1;
      }
      
      const point = curve.getPointAt(offsets[i]);
      dummy.position.copy(point);
      const scale = (isPlugin ? 0.008 : 0.015) + pulseRef.current * 0.01;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    (ref.current.material as THREE.MeshBasicMaterial).opacity = (isPlugin ? 0.1 : 0.4) + pulseRef.current * 0.4;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} />
    </instancedMesh>
  );
}

// --- Ambient depth particles ---

export function DepthParticles() {
  const count = 200;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 30;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 20;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return arr;
  }, []);
  const ref = useRef<THREE.Points>(null);
  useFrame(() => { if (ref.current) ref.current.rotation.y += 0.0003; });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.02} color="#8b5cf6" transparent opacity={0.3} sizeAttenuation />
    </points>
  );
}

// --- Camera entry animation ---
let cameraIntroPlayed = false;

export function CameraRig() {
  const { camera, size } = useThree();
  const isMobile = size.width < 768;
  const target = useMemo(() => new THREE.Vector3(0, isMobile ? 3 : 0, isMobile ? 26 : 15), [isMobile]);
  const animating = useRef(true);
  const lastIsMobile = useRef(isMobile);

  useEffect(() => {
    if (!cameraIntroPlayed) {
      camera.position.set(0, 8, 35);
      cameraIntroPlayed = true;
    }
    // Re-trigger animation if screen state changes
    if (lastIsMobile.current !== isMobile) {
      animating.current = true;
      lastIsMobile.current = isMobile;
    }
  }, [camera, isMobile]);

  useFrame(() => {
    if (!animating.current) return;
    
    camera.position.lerp(target, 0.04);
    if (camera.position.distanceTo(target) < 0.05) {
      camera.position.copy(target);
      animating.current = false;
    }
  });

  return null;
}

// --- Floating Pod ---

export const FloatingPod = React.memo(function FloatingPod({
  position, color, title, icon: Icon, onClick, modelType, soul, isLocked, isPlugin
}: FloatingPodProps) {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const torusRef = useRef<THREE.Mesh>(null);
  const scaleMult = isPlugin ? 0.6 : 1.6;
  const opacityMult = isPlugin ? 0.5 : 1;
  const hasGlbModel = ['eve', 'walle', 'ledger', 'forge', 'atlas'].includes(modelType);
  const sphereOpacity = modelType === 'walle'
    ? (isLocked ? 0.005 : 0.01) * opacityMult
    : hasGlbModel
    ? (isLocked ? 0.01 : 0.02) * opacityMult
    : (isLocked ? 0.02 : 0.04) * opacityMult;

  const onPointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  }, []);

  const onPointerOut = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(false);
    document.body.style.cursor = 'default';
  }, []);

  const onClickHandler = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setClicked(true);
    setTimeout(() => onClick(), 400);
  }, [onClick]);

  useFrame(() => {
    if (clicked && torusRef.current) {
      const mat = torusRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, 8, 0.15);
    }
  });

  return (
    <Float speed={isPlugin ? 1 : 2.5} rotationIntensity={isPlugin ? 0.3 : 0.6} floatIntensity={isPlugin ? 0.3 : 0.6} position={position}>
      <mesh onPointerOver={onPointerOver} onPointerOut={onPointerOut} onClick={onClickHandler}>
        <sphereGeometry args={[1.0 * (isPlugin ? 1 : 1.2), 32, 32]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={sphereOpacity}
          emissive={color}
          emissiveIntensity={hovered ? 0.5 : 0.08}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} ref={torusRef}>
        <torusGeometry args={[1.2 * (isPlugin ? 1 : 1.3), 0.012, 16, 100]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 5 : 1.5} transparent opacity={opacityMult} />
      </mesh>
      <Suspense fallback={null}>
        {modelType === 'eve' && (
          <EveModel scale={0.4 * scaleMult} position={[0, -0.4 * scaleMult, 0]} rotation={[0, Math.PI / 4, 0]} soul={isLocked ? null : soul} />
        )}
        {modelType === 'walle' && (
          <WallEModel scale={0.4 * scaleMult} position={[0, -0.4 * scaleMult, 0]} rotation={[0, Math.PI / 4, 0]} soul={isLocked ? null : soul} />
        )}
        {modelType === 'ledger' && (
          <LedgerModel scale={0.8 * scaleMult} position={[0, -0.2 * scaleMult, 0]} />
        )}
        {modelType === 'atlas' && (
          <AtlasModel scale={0.8 * scaleMult} position={[0, -0.2 * scaleMult, 0]} />
        )}
        {modelType === 'scout' && (
          <PolyPodModel shape="dodeca" color={color} scale={0.45 * scaleMult} position={[0, -0.4 * scaleMult, 0]} rotation={[0, Math.PI / 6, 0]} />
        )}
        {modelType === 'forge' && (
          <ForgeModel scale={0.45 * scaleMult} position={[0, -0.4 * scaleMult, 0]} />
        )}
      </Suspense>
      <Html position={[0, (isPlugin ? -1.8 : -2.5) * (isPlugin ? 0.6 : 1), 0]} center distanceFactor={10}>
        <div className={cn(
          "flex flex-col items-center transition-all duration-500",
          hovered ? 'scale-110' : 'scale-100',
          isPlugin && !hovered ? 'opacity-40' : 'opacity-100'
        )}>
          <div className={cn(
            "backdrop-blur-md border border-white/10 flex items-center gap-2 whitespace-nowrap shadow-2xl transition-all",
            isPlugin ? "px-2 py-1 rounded-lg bg-black/40" : "px-6 py-3 rounded-full bg-black/80 border-white/20",
            hovered && isPlugin && "bg-black/80 px-4 py-2 rounded-full"
          )}>
            <Icon className={cn(isPlugin && !hovered ? "w-3 h-3" : "w-5 h-5")} style={{ color }} />
            <span className={cn(
              "font-black uppercase tracking-[0.2em] text-white",
              isPlugin && !hovered ? "text-[9px]" : "text-[12px] italic"
            )}>
              {title} {isLocked && !isPlugin && ' [LOCKED]'}
            </span>
          </div>
        </div>
      </Html>
    </Float>
  );
});

// --- 3D Loading Indicator ---

function Hub3DLoader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full border border-violet-500/30 bg-violet-500/10 flex items-center justify-center animate-pulse">
          <Sparkles className="w-8 h-8 text-violet-400" />
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.4em] text-white/60 font-bold">Materializing</p>
          <p className="text-[9px] uppercase tracking-[0.3em] text-white/40 mt-1">{Math.round(progress)}%</p>
        </div>
      </div>
    </Html>
  );
}

// --- Full 3D View ---

interface ThreeDViewProps {
  podLayout: Array<{ id: string; position: [number, number, number]; color: string; title: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; route: string; isPlugin: boolean }>;
  spinePoints: THREE.Vector3[];
  moduleAccess: Record<string, boolean>;
  globalSoul: GlobalProjection | null | undefined;
  onModuleNavigate: (moduleId: string, route: string) => void;
}

export default function ThreeDView({ podLayout, moduleAccess, globalSoul, onModuleNavigate }: ThreeDViewProps) {
  const pulseRef = useRef(0);
  const centerPos = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const { size } = useThree();
  const isMobile = size.width < 768;

  useSpineEvent('*', (event) => {
    if (event.priority !== 'info') {
      pulseRef.current = 1;
    }
  });

  useFrame(() => {
    pulseRef.current = THREE.MathUtils.lerp(pulseRef.current, 0, 0.02);
  });

  return (
    <>
    <CameraRig />
    <OrbitControls
      enableZoom enablePan enableRotate
      minDistance={5} maxDistance={30}
      zoomSpeed={0.8} panSpeed={0.8} rotateSpeed={0.6}
      makeDefault
    />
    <Suspense fallback={<Hub3DLoader />}>
      <ambientLight intensity={0.12} />
      <hemisphereLight args={['#ddd6fe', '#020205', 0.55]} />
      <directionalLight position={[6, 8, 4]} intensity={0.35} color="#c4b5fd" />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1.2} color="#ede9fe" />
      <spotLight position={[-8, -6, -5]} angle={0.3} penumbra={1} intensity={0.4} color="#7c3aed" />
      <pointLight position={[0, 0, 0]} intensity={0.8} color="#7c3aed" distance={10} decay={2} />

      <DepthParticles />

      <group position={[0, 0.8, 0]}>
        {/* The Central Nexus Model */}
        <NexusModel scale={0.05} />
        
        {/* Star-topology neural flows */}
        {podLayout.map((module) => (
          <NexusFlow
            key={`flow-${module.id}`}
            start={centerPos}
            end={new THREE.Vector3(...module.position)}
            color={module.color}
            isPlugin={module.isPlugin}
            pulseRef={pulseRef}
          />
        ))}

        {podLayout.map((module) => {
          const modelType =
            module.id === 'agnes' ? 'eve' :
            module.id === 'titan' ? 'walle' :
            module.id === 'ledger' ? 'ledger' :
            module.id === 'atlas' ? 'atlas' :
            module.id === 'scout' ? 'scout' :
            module.id === 'forge' ? 'forge' : 'basic';

          return (
            <FloatingPod
              key={module.id}
              position={module.position}
              color={module.color}
              title={module.title}
              icon={module.icon}
              modelType={modelType as FloatingPodProps['modelType']}
              soul={globalSoul ?? null}
              isLocked={!moduleAccess[module.id]}
              isPlugin={module.isPlugin}
              onClick={() => onModuleNavigate(module.id, module.route)}
            />
          );
        })}
      </group>

      <ContactShadows position={[0, -4, 0]} opacity={0.4} scale={20} blur={2.4} far={4.5} />

      {/* Skip GPU-heavy postprocessing on mobile to prevent frame drops */}
      {!isMobile && (
        <EffectComposer>
          <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} intensity={0.8} mipmapBlur />
          <Vignette eskil={false} offset={0.1} darkness={0.8} />
        </EffectComposer>
      )}
    </Suspense>
    </>
  );
}
