import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Float, Environment, ContactShadows, PresentationControls, Html } from '@react-three/drei';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { BrainCircuit, Activity, Shield, Lock, Unlock, ArrowLeft, LayoutGrid, Sparkles, AlertCircle, Database, Box, Menu } from 'lucide-react';
import { useVault } from '@/lib/vault-context';
import { useAuth } from '@/lib/auth-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { NeuralButton } from '@/core/components/NeuralButton';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { NeuralIntegrity } from '@/core/components/NeuralIntegrity';
import { SystemCommandCenter } from '@/core/components/SystemCommandCenter';
import { GlobalProjection } from '@/lib/types';
import { cn } from '@/lib/utils';

// Model Components
function WallEModel({ soul, ...props }: { soul: GlobalProjection | null } & any) {
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

function EveModel({ soul, ...props }: { soul: GlobalProjection | null } & any) {
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
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white italic">{title} {isLocked && ' [LOCKED]'}</span>
          </div>
        </div>
      </Html>
    </Float>
  );
}

function ModuleCard({ title, icon: Icon, color, isLocked, onClick, description }: any) {
    return (
        <motion.button 
            layoutId={title}
            onClick={onClick}
            className={cn(
                "group relative p-8 rounded-[40px] border transition-all text-left overflow-hidden",
                isLocked ? "bg-white/[0.02] border-white/5 opacity-50" : "bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]"
            )}
        >
            <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6" style={{ color }} />
                </div>
                <h3 className="text-xl font-black italic uppercase tracking-wider text-white mb-2">{title}</h3>
                <p className="text-[10px] text-white/40 font-medium leading-relaxed italic uppercase tracking-widest">{description}</p>
            </div>
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <Icon className="w-24 h-24" style={{ color }} />
            </div>
        </motion.button>
    );
}

function ReactiveGauge({ label, value, colorClass, icon: Icon }: { label: string, value: number | string, colorClass: string, icon: any }) {
    const [isSyncing, setIsSyncing] = useState(false);
    const prevValue = useRef(value);

    useEffect(() => {
        if (prevValue.current !== value) {
            setIsSyncing(true);
            const timer = setTimeout(() => setIsSyncing(false), 1000);
            prevValue.current = value;
            return () => clearTimeout(timer);
        }
    }, [value]);

    return (
        <div className="flex flex-col">
            <span className="text-[9px] text-white/30 uppercase font-black tracking-widest italic mb-1 flex items-center gap-1.5">
                <Icon className="w-2.5 h-2.5" /> {label}
            </span>
            <span className={cn(
                "text-2xl font-black italic leading-none transition-all duration-300",
                colorClass,
                isSyncing && "animate-pulse scale-110 blur-[1px] brightness-150"
            )}>
                {typeof value === 'number' ? `${value}%` : value}
            </span>
        </div>
    );
}

export default function HubPage() {
  const navigate = useNavigate();
  const { user, isGuest, profile } = useAuth();
  const { isUnlocked } = useVault();
  const { globalSoul } = useGlobalSoul();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'3D' | '2D'>('3D');

  const canEnter = isUnlocked || isGuest;

  const modules = [
    { id: 'therapy', title: 'Agnes', icon: BrainCircuit, color: '#6366f1', description: 'Neural Synchronization' },
    { id: 'ledger', title: 'The Ledger', icon: Database, color: '#22d3ee', description: 'Biometric Synthesis' },
    { id: 'trainer', title: 'Titan Trainer', icon: Activity, color: '#fb923c', description: 'Performance Strategy' },
  ];

  return (
    <div className="fixed inset-0 bg-[#020205] text-white overflow-hidden font-sans">
      
      {/* 3D Background */}
      <div 
        className={cn("absolute inset-0 z-0 transition-opacity duration-1000", viewMode === '3D' ? 'opacity-100' : 'opacity-20 pointer-events-none')}
        style={{ touchAction: 'none' }}
      >
        <Canvas 
          camera={{ position: [0, 0, 10], fov: 45 }} 
          gl={{ antialias: true, alpha: true }}
          style={{ touchAction: 'none' }}
        >
          <color attach="background" args={['#020205']} />
          <fog attach="fog" args={['#020205', 5, 18]} />
          <Suspense fallback={null}>
            <Environment preset="city" />
            <ambientLight intensity={0.2} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
            <PresentationControls global snap={true}>
              <group position={[0, 0, 0]}>
                <FloatingPod position={[-3.5, 0.5, 0]} color="#6366f1" title={globalSoul?.displayNames?.therapy || "Agnes"} icon={BrainCircuit} model={EveModel} soul={globalSoul} isLocked={!canEnter} onClick={() => canEnter ? navigate('/therapy') : setIsAuthOpen(true)} />

                <FloatingPod position={[0, -1, 0]} color="#22d3ee" title={globalSoul?.displayNames?.ledger || "The Ledger"} icon={Database} model={LedgerModel} soul={globalSoul} isLocked={!canEnter} onClick={() => canEnter ? navigate('/ledger') : setIsAuthOpen(true)} />
                <FloatingPod position={[3.5, 0.5, 0]} color="#fb923c" title={globalSoul?.displayNames?.trainer || "Titan Trainer"} icon={Activity} model={WallEModel} soul={globalSoul} isLocked={!canEnter} onClick={() => canEnter ? navigate('/trainer') : setIsAuthOpen(true)} />
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
            <span className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-2 italic">Identity: {isUnlocked ? profile?.preferredName.toUpperCase() : isGuest ? 'GUEST_LINK' : 'DISCONNECTED'}</span>
          </div>
          <div className="flex items-center gap-4">
             <button 
                onClick={() => setViewMode(viewMode === '3D' ? '2D' : '3D')}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors group text-white/40 hover:text-white"
             >
                {viewMode === '3D' ? <LayoutGrid className="w-5 h-5" /> : <Box className="w-5 h-5" />}
             </button>
          </div>
        </nav>

        {/* 2D View Content */}
        <AnimatePresence>
            {viewMode === '2D' && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex-1 flex flex-col items-center justify-center pointer-events-auto mt-12 mb-12">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl">
                        {modules.map((m) => (
                            <ModuleCard 
                                key={m.id}
                                {...m}
                                title={globalSoul?.displayNames[m.id === 'ledger' ? 'ledger' : m.id] || m.title}
                                isLocked={!canEnter}
                                onClick={() => canEnter ? navigate(`/${m.id}`) : setIsAuthOpen(true)}
                            />
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {!canEnter && viewMode === '3D' && (
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
          
          <div className="flex gap-8 bg-black/40 backdrop-blur-md border border-white/5 px-8 py-4 rounded-[24px] pointer-events-auto">
            <ReactiveGauge label="Wellness Index" value={globalSoul?.overallWellnessScore || 50} colorClass="text-indigo-400" icon={Sparkles} />
            <div className="w-px h-8 bg-white/10" />
            <ReactiveGauge 
                label="CNS Stability" 
                value={globalSoul ? 100 - (globalSoul.crossFunctionalState.cnsFatigue * 10) : 50} 
                colorClass="text-orange-400" 
                icon={Activity} 
            />
            <div className="w-px h-8 bg-white/10" />
            <ReactiveGauge 
                label="Neural Resilience" 
                value={globalSoul ? (globalSoul.crossFunctionalState.emotionalResilience * 10) : 50} 
                colorClass="text-cyan-400" 
                icon={Shield} 
            />
          </div>
        </div>
      </div>
      <UnifiedAuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} mode="global" />
    </div>
  );
}

useGLTF.preload('/assets/models/walle.glb');
useGLTF.preload('/assets/models/eve.glb');
