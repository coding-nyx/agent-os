
import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Float, Environment, ContactShadows, PresentationControls, Html } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { BrainCircuit, Activity, Shield, Lock, Unlock, ArrowLeft, LayoutGrid, Sparkles, AlertCircle, Database } from 'lucide-react';
import { useVault } from '@/lib/vault-context';
import { useAuth } from '@/lib/auth-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { NeuralButton } from '@/core/components/NeuralButton';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { NeuralIntegrity } from '@/core/components/NeuralIntegrity';
import { SystemCommandCenter } from '@/core/components/SystemCommandCenter';
import { GlobalSoulService } from '@/lib/services/global-soul-service';
import { GlobalSoul } from '@/lib/types';

// Model Components with Reactive Logic
function WallEModel({ soul, ...props }: { soul: GlobalSoul | null } & any) {
  const { scene } = useGLTF('/assets/models/walle.glb');
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    const fatigue = soul?.crossFunctionalState.cnsFatigue || 5;
    const targetRotation = fatigue > 7 ? Math.PI / 12 : 0;
    group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, targetRotation, 0.05);
    const speed = fatigue > 7 ? 0.5 : 1.2;
    group.current.position.y = Math.sin(state.clock.elapsedTime * speed) * 0.1;
  });
  return <group ref={group}><primitive object={scene} {...props} /></group>;
}

function EveModel({ soul, ...props }: { soul: GlobalSoul | null } & any) {
  const { scene } = useGLTF('/assets/models/eve.glb');
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    const resilience = soul?.crossFunctionalState.emotionalResilience || 5;
    const jitter = resilience < 4 ? Math.sin(state.clock.elapsedTime * 10) * 0.05 : 0;
    group.current.position.y = (Math.sin(state.clock.elapsedTime * 2) * 0.2) + jitter;
    const targetTilt = resilience < 5 ? -Math.PI / 16 : 0;
    group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, targetTilt, 0.05);
  });
  return <group ref={group}><primitive object={scene} {...props} /></group>;
}

// Minimalistic cube or abstract for Ledger
function LedgerModel(props: any) {
    const mesh = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        if (!mesh.current) return;
        mesh.current.rotation.y += 0.01;
        mesh.current.rotation.x += 0.005;
    });
    return (
        <mesh ref={mesh} {...props}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#22d3ee" wireframe />
        </mesh>
    );
}

function FloatingPod({ position, color, title, icon: Icon, onClick, model: Model, soul, isLocked }: any) {
  const [hovered, setHovered] = useState(false);
  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5} position={position}>
      <mesh onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)} onClick={onClick}>
        <sphereGeometry args={[1.2, 32, 32]} />
        <meshStandardMaterial color={color} transparent opacity={isLocked ? 0.05 : 0.15} emissive={color} emissiveIntensity={hovered ? 0.8 : 0.2} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.4, 0.02, 16, 100]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 4 : 1} />
      </mesh>
      <Suspense fallback={null}>
        <Model scale={0.4} position={[0, -0.4, 0]} rotation={[0, Math.PI / 4, 0]} soul={soul} />
      </Suspense>
      <Html position={[0, -1.8, 0]} center distanceFactor={10}>
        <div className={`flex flex-col items-center transition-all duration-300 ${hovered ? 'scale-110' : 'scale-100'}`}>
          <div className="bg-black/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-2 whitespace-nowrap shadow-2xl">
            <Icon className="w-4 h-4" style={{ color }} />
            <span className="text-white font-black tracking-[0.2em] text-[10px] uppercase">{title} {isLocked && ' [LOCKED]'}</span>
          </div>
        </div>
      </Html>
    </Float>
  );
}

export default function HubPage() {
  const navigate = useNavigate();
  const { user, isGuest } = useAuth();
  const { isUnlocked } = useVault();
  const { globalSoul } = useGlobalSoul();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [gaps, setGaps] = useState<string[]>([]);

  useEffect(() => {
    if (isUnlocked && globalSoul) {
        GlobalSoulService.checkGaps(globalSoul).then(setGaps);
    }
  }, [isUnlocked, globalSoul]);

  const canEnter = isUnlocked || isGuest;

  return (
    <div className="fixed inset-0 bg-[#020205] text-white overflow-hidden font-sans">
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 10], fov: 45 }}>
          <color attach="background" args={['#020205']} />
          <fog attach="fog" args={['#020205', 5, 18]} />
          <Suspense fallback={null}>
            <Environment preset="city" />
            <ambientLight intensity={0.2} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
            <PresentationControls global snap={true}>
              <group position={[0, 0, 0]}>
                <FloatingPod position={[-3.5, 0.5, 0]} color="#6366f1" title="Agnes Therapy" icon={BrainCircuit} model={EveModel} soul={globalSoul} isLocked={!canEnter} onClick={() => canEnter ? navigate('/therapy') : setIsAuthOpen(true)} />
                <FloatingPod position={[0, -1, 0]} color="#22d3ee" title="The Ledger" icon={Database} model={LedgerModel} soul={globalSoul} isLocked={!canEnter} onClick={() => canEnter ? navigate('/ledger') : setIsAuthOpen(true)} />
                <FloatingPod position={[3.5, 0.5, 0]} color="#fb923c" title="Titan Trainer" icon={Activity} model={WallEModel} soul={globalSoul} isLocked={!canEnter} onClick={() => canEnter ? navigate('/trainer') : setIsAuthOpen(true)} />
              </group>
            </PresentationControls>
            <ContactShadows position={[0, -4, 0]} opacity={0.4} scale={20} blur={2.4} far={4.5} />
          </Suspense>
        </Canvas>
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col p-8 md:p-12">
        <nav className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors group"><ArrowLeft className="w-5 h-5 text-white/40 group-hover:text-white" /></button>
            <SystemCommandCenter />
          </div>
          <div className="flex flex-col items-center">
            <h1 className="text-2xl font-black tracking-[0.4em] text-white/90 italic uppercase leading-none">Neural Nexus</h1>
            <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-2 italic">Identity: {isUnlocked ? 'SECURE_TUNNEL' : isGuest ? 'GUEST_LINK' : 'DISCONNECTED'}</span>
          </div>
          <div className="w-24" />
        </nav>

        {!canEnter && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-auto mb-auto mx-auto max-w-sm w-full pointer-events-auto text-center space-y-8">
              <div className="space-y-4">
                <h2 className="text-3xl font-black italic uppercase tracking-tighter">Vault Encrypted</h2>
                <p className="text-white/40 text-xs leading-relaxed italic">Neural data is currently secured. Perform a handshake to synchronize.</p>
              </div>
              <NeuralButton size="xl" onClick={() => setIsAuthOpen(true)} className="w-full">Initialize Handshake <Sparkles className="w-4 h-4 ml-2" /></NeuralButton>
            </motion.div>
        )}

        <div className="mt-auto flex flex-col md:flex-row justify-between items-end gap-8">
          <div className="pointer-events-auto w-full md:w-auto"><NeuralIntegrity mode="global" onUpgrade={() => setIsAuthOpen(true)} /></div>
          <div className="flex gap-8 bg-black/40 backdrop-blur-md border border-white/5 px-8 py-4 rounded-[24px]">
            <div className="flex flex-col">
              <span className="text-[9px] text-white/30 uppercase font-black tracking-widest italic mb-1">Wellness Index</span>
              <span className="text-2xl font-black text-indigo-400 italic leading-none">{globalSoul?.overallWellnessScore || '??'}%</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[9px] text-white/30 uppercase font-black tracking-widest italic mb-1">Sync Integrity</span>
              <span className="text-2xl font-black text-orange-400 italic leading-none">{globalSoul ? Math.round((globalSoul.crossFunctionalState.sleepQuality + globalSoul.crossFunctionalState.emotionalResilience) * 5) : '??'}%</span>
            </div>
          </div>
        </div>

        <AnimatePresence>
            {isUnlocked && gaps.length > 0 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="absolute top-32 right-12 max-w-xs pointer-events-auto">
                <div className="bg-orange-500/5 border border-orange-500/20 backdrop-blur-xl p-6 rounded-3xl space-y-4">
                    <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-orange-400" /><span className="text-[10px] font-black uppercase tracking-tighter text-orange-400 italic">Neural Gaps Detected</span></div>
                    <div className="space-y-3">{gaps.map((gap, i) => (<p key={i} className="text-[11px] leading-relaxed text-orange-200/60 italic font-medium tracking-tight">• {gap}</p>))}</div>
                </div>
            </motion.div>
            )}
        </AnimatePresence>
      </div>
      <UnifiedAuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} mode="global" />
    </div>
  );
}

useGLTF.preload('/assets/models/walle.glb');
useGLTF.preload('/assets/models/eve.glb');
