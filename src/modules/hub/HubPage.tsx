import React, { Suspense, useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Float, Environment, ContactShadows, PresentationControls, Html } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { Activity, Shield, LayoutList, Sparkles, Box, Share2, Lock, Loader2 } from 'lucide-react';
import { useVault } from '@/lib/vault-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { NeuralButton } from '@/core/components/NeuralButton';
import { UnifiedAuthModal, AuthMode } from '@/core/components/UnifiedAuthModal';
import { NeuralIntegrity } from '@/core/components/NeuralIntegrity';
import { GlobalProjection, SpineEvent } from '@/lib/types';
import { cn } from '@/lib/utils';
import { HUB_MODULE_ORDER, MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { ModuleLayout } from '@/core/layout/ModuleLayout';

type StatusTone = 'good' | 'warn' | 'bad' | 'neutral';

const toneClass = (tone: StatusTone) => {
  switch (tone) {
    case 'good':
      return 'bg-emerald-400 text-emerald-200';
    case 'warn':
      return 'bg-amber-400 text-amber-200';
    case 'bad':
      return 'bg-rose-400 text-rose-200';
    default:
      return 'bg-white/40 text-white/60';
  }
};

function globalSoulDisplayName(id: string, fallback: string): string {
    if (id === 'therapy') return 'AGNES';
    if (id === 'trainer') return 'TITAN';
    return fallback;
}

// --- 3D Model Components ---

function WallEModel({ soul, ...props }: { soul: GlobalProjection | null } & any) {
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

function EveModel({ soul, ...props }: { soul: GlobalProjection | null } & any) {
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

function LedgerModel(props: any) {
  const { scene } = useGLTF('/assets/models/ledger.glb');
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y += 0.005;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
  });
  return <group ref={group}><primitive object={scene} {...props} /></group>;
}

function SomaModel(props: any) {
  const { scene } = useGLTF('/assets/models/soma.glb');
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y += 0.003;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.08;
  });
  return <group ref={group}><primitive object={scene} {...props} /></group>;
}

function PolyPodModel({ color, shape, ...props }: { color: string; shape: 'icosa' | 'dodeca' | 'octa' | 'tetra' | 'torus' | 'cone' | 'prism' } & any) {
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

function HubSpine({ points }: { points: THREE.Vector3[] }) {
    const tubeRef = useRef<THREE.Mesh>(null);
    const pulseRef = useRef(0);
    const curve = useMemo(() => new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.6), [points]);
    const geometry = useMemo(() => new THREE.TubeGeometry(curve, 220, 0.04, 12, true), [curve]);

    useEffect(() => {
      return () => { geometry.dispose(); };
    }, [geometry]);

    useSpineEvent('*', (event) => {
      if (event.priority !== 'info') {
        pulseRef.current = 1;
      }
    });

    useFrame(() => {
        pulseRef.current = Math.max(0, pulseRef.current - 0.02);
        if (!tubeRef.current) return;
        const material = tubeRef.current.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = 0.6 + pulseRef.current * 1.6;
        material.opacity = 0.3 + pulseRef.current * 0.4;
    });

    return (
        <mesh ref={tubeRef} geometry={geometry}>
            <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" transparent opacity={0.35} />
        </mesh>
    );
}

const CORE_MODULES = ['therapy', 'trainer', 'soma', 'ledger'];

function FloatingPod({ position, color, title, icon: Icon, onClick, modelType, soul, isLocked, isPlugin }: any) {
  const [hovered, setHovered] = useState(false);
  const scaleMult = isPlugin ? 0.6 : 1.6;
  const opacityMult = isPlugin ? 0.5 : 1;

  return (
    <Float speed={isPlugin ? 1 : 2.5} rotationIntensity={isPlugin ? 0.3 : 0.6} floatIntensity={isPlugin ? 0.3 : 0.6} position={position}>
      <mesh 
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }} 
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'default'; }} 
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >
        <sphereGeometry args={[1.0 * (isPlugin ? 1 : 1.2), 32, 32]} />
        <meshStandardMaterial 
            color={color} 
            transparent 
            opacity={(isLocked ? 0.05 : 0.12) * opacityMult} 
            emissive={color} 
            emissiveIntensity={hovered ? 0.8 : 0.15} 
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2 * (isPlugin ? 1 : 1.3), 0.012, 16, 100]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 5 : 1.5} transparent opacity={opacityMult} />
      </mesh>
      <Suspense fallback={null}>
        {modelType === 'eve' && (
          <EveModel
            scale={0.4 * scaleMult}
            position={[0, -0.4 * scaleMult, 0]}
            rotation={[0, Math.PI / 4, 0]}
            soul={isLocked ? null : soul}
          />
        )}
        {modelType === 'walle' && (
          <WallEModel
            scale={0.4 * scaleMult}
            position={[0, -0.4 * scaleMult, 0]}
            rotation={[0, Math.PI / 4, 0]}
            soul={isLocked ? null : soul}
          />
        )}
        {modelType === 'ledger' && (
          <LedgerModel scale={0.8 * scaleMult} position={[0, -0.2 * scaleMult, 0]} />
        )}
        {modelType === 'soma' && (
          <SomaModel scale={0.05 * scaleMult} position={[0, -0.3 * scaleMult, 0]} />
        )}
        {modelType === 'atlas' && (
          <PolyPodModel shape="octa" color={color} scale={0.45 * scaleMult} position={[0, -0.4 * scaleMult, 0]} rotation={[0, Math.PI / 6, 0]} />
        )}
        {modelType === 'scout' && (
          <PolyPodModel shape="dodeca" color={color} scale={0.45 * scaleMult} position={[0, -0.4 * scaleMult, 0]} rotation={[0, Math.PI / 6, 0]} />
        )}
        {modelType === 'forge' && (
          <PolyPodModel shape="torus" color={color} scale={0.45 * scaleMult} position={[0, -0.4 * scaleMult, 0]} rotation={[0, Math.PI / 6, 0]} />
        )}
        {modelType === 'pulse' && (
          <PolyPodModel shape="icosa" color={color} scale={0.45 * scaleMult} position={[0, -0.4 * scaleMult, 0]} rotation={[0, Math.PI / 6, 0]} />
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
                isPlugin && !hovered ? "text-[8px]" : "text-[12px] italic"
            )}>
                {title} {isLocked && !isPlugin && ' [LOCKED]'}
            </span>
          </div>
        </div>
      </Html>
    </Float>
  );
}

// --- UI Components ---

function ModuleCard({ title, icon: Icon, color, isLocked, onClick, description, stat, isPlugin }: any) {
    return (
        <motion.button 
            layoutId={title}
            onClick={onClick}
            whileHover={{ y: -6, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            aria-label={`Open ${title} module`}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className={cn(
                "group relative rounded-[32px] border transition-all text-left overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/50",
                isPlugin ? "p-6 w-[280px] shrink-0" : "p-8",
                isLocked 
                  ? "bg-white/[0.04] border-white/10 opacity-40 hover:opacity-60" 
                  : "bg-black/60 backdrop-blur-3xl border-white/20 hover:border-white/30 hover:bg-white/[0.05] shadow-2xl"
            )}
        >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none">
              <div className="absolute inset-0 hub-card-sheen" />
            </div>
            <div className="relative z-10">
                <div className={cn(
                  "rounded-2xl border flex items-center justify-center transition-all shadow-inner",
                  isPlugin ? "w-10 h-10 mb-4 bg-white/5 border-white/10" : "w-16 h-16 mb-6 bg-white/10 border-white/20 group-hover:scale-110 group-hover:rotate-3",
                  isLocked ? "bg-white/5 border-white/5" : ""
                )}>
                    <Icon className={isPlugin ? "w-5 h-5" : "w-8 h-8"} style={{ color: isLocked ? '#666' : color }} />
                </div>
                <h3 className={cn("font-black tracking-[0.1em] text-white mb-3 uppercase italic transition-colors", isPlugin ? "text-lg" : "text-2xl", !isLocked && "group-hover:text-white")}>{title}</h3>
                {!isPlugin && <p className="text-[13px] text-white/60 font-medium leading-relaxed line-clamp-2 mb-6 group-hover:text-white/80 transition-colors">{description}</p>}
                {stat && (
                  <div className={cn("flex items-center justify-between border-t border-white/10", isPlugin ? "mt-4 pt-4" : "mt-2 pt-6")}>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-black">{stat.label}</span>
                    <div className="flex items-center gap-3">
                      <div className={cn("w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_currentColor]", toneClass(stat.tone))} />
                      <span className="text-sm font-black text-white italic tracking-widest">{stat.display}</span>
                    </div>
                  </div>
                )}
            </div>
            <div className="absolute top-0 right-0 p-8 opacity-[0.05] group-hover:opacity-[0.12] transition-opacity">
                <Icon className={isPlugin ? "w-20 h-20" : "w-32 h-32"} style={{ color: isLocked ? '#333' : color }} />
            </div>
        </motion.button>
    );
}

function NodeCard({ node, stat, canEnter, isHovered, onClick, onMouseEnter, onMouseLeave }: any) {
    const Icon = node.icon;
    const title = globalSoulDisplayName(node.id, node.title);
    const isLeft = node.x < 50;
    const isPlugin = !CORE_MODULES.includes(node.id);
    
    return (
        <motion.button
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: isPlugin ? 0.85 : 1 }}
            whileHover={{ y: -2, scale: isPlugin ? 0.9 : 1.02, transition: { duration: 0.2 } }}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto group focus:outline-none"
            style={{ left: `${node.x}%`, top: `${node.y}%`, zIndex: isHovered ? 100 : isPlugin ? 5 : 10 }}
        >
            <div className={cn(
                "relative transition-all duration-300",
                isPlugin ? "p-2 rounded-xl w-[140px]" : "p-3 rounded-2xl w-[185px]",
                "bg-[#05050a]/70 backdrop-blur-xl",
                isHovered ? "border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.05)] bg-white/[0.02] border" : "border-white/10 shadow-xl border",
                !canEnter && "opacity-60",
                isPlugin && !isHovered && "opacity-40"
            )}>
                <div className="flex gap-2.5 items-center">
                    <div className={cn(
                        "rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                        isPlugin ? "w-7 h-7" : "w-8 h-8",
                        isHovered ? "bg-white/10 border-white/20" : "bg-white/5 border-white/10"
                    )}>
                        <Icon className={isPlugin ? "w-3.5 h-3.5" : "w-4 h-4"} style={{ color: node.color }} />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-1.5">
                            <span className={cn("font-bold uppercase tracking-wider text-white/90 truncate", isPlugin ? "text-[8px]" : "text-[10px]")}>{title}</span>
                            {!canEnter && <Lock className="w-2.5 h-2.5 text-white/20" />}
                        </div>
                        {stat && !isPlugin ? (
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className={cn("w-1 h-1 rounded-full", toneClass(stat.tone))} />
                                <span className="text-[9px] font-mono text-white/40">{stat.display}</span>
                            </div>
                        ) : (
                            <p className="text-[7px] text-white/30 uppercase tracking-tight truncate mt-0.5">{node.description}</p>
                        )}
                    </div>
                </div>
                {/* Connector Node */}
                <div className={cn(
                    "absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all duration-500",
                    isLeft ? "-right-0.75" : "-left-0.75",
                    isHovered ? "bg-white scale-125 shadow-[0_0_8px_white]" : "bg-white/20"
                )} />
            </div>
        </motion.button>
    );
}

function ReactiveGauge({
  label,
  value,
  colorClass,
  icon: Icon
}: {
  label: string;
  value: number | string | null | undefined;
  colorClass: string;
  icon: any;
}) {
    const [isSyncing, setIsSyncing] = useState(false);
    const prevValue = useRef(value);
    const isEmpty = value === null || value === undefined;
    const displayValue = isEmpty ? '—' : typeof value === 'number' ? `${Math.round(value)}%` : value;

    useEffect(() => {
        if (prevValue.current !== value) {
            setIsSyncing(true);
            const timer = setTimeout(() => setIsSyncing(false), 1000);
            prevValue.current = value;
            return () => clearTimeout(timer);
        }
    }, [value]);

    return (
        <div className="flex flex-col min-w-[80px]">
            <span className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1 flex items-center gap-1.5">
                <Icon className="w-3 h-3" /> {label}
            </span>
            <span className={cn(
                "text-2xl font-bold leading-none transition-all duration-300",
                isEmpty ? "text-white/40" : colorClass,
                !isEmpty && isSyncing && "animate-pulse scale-110 blur-[1px] brightness-150"
            )}>
                {displayValue}
            </span>
        </div>
    );
}

export default function HubPage() {
  const navigate = useNavigate();
  const { isModuleAccessible } = useVault();
  const { globalSoul } = useGlobalSoul();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('global');
  const [viewMode, setViewMode] = useState<'3D' | 'GRAPH' | 'CARDS'>('CARDS');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [edgePulse, setEdgePulse] = useState(0);
  const [edgePulsePriority, setEdgePulsePriority] = useState<SpineEvent['priority']>('info');
  const edgePulseRef = useRef<{ at: number; priority: SpineEvent['priority'] }>({
    at: 0,
    priority: 'info'
  });

  const openAuth = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
    setIsAuthOpen(true);
  }, []);

  const pushSpineEvent = useCallback((event: SpineEvent) => {
    edgePulseRef.current = { at: Date.now(), priority: event.priority };
    setEdgePulsePriority(event.priority);
    setEdgePulse(1);
  }, []);

  useSpineEvent('*', pushSpineEvent);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!edgePulseRef.current.at) {
        setEdgePulse(0);
        return;
      }
      const elapsed = Date.now() - edgePulseRef.current.at;
      const decay = Math.max(0, 1 - elapsed / 1600);
      setEdgePulse(decay);
    }, 120);
    return () => window.clearInterval(interval);
  }, []);

  const modules = HUB_MODULE_ORDER.map((moduleId) => {
    const module = MODULE_MANIFEST[moduleId];
    return {
      id: module.id,
      title: module.title,
      icon: module.icon,
      color: module.colorHex,
      description: module.description,
      route: module.route,
      isPlugin: !CORE_MODULES.includes(module.id)
    };
  });

  const moduleAccess = useMemo(() => {
    return modules.reduce<Record<string, boolean>>((acc, module) => {
      acc[module.id] = isModuleAccessible(module.id as ModuleId);
      return acc;
    }, {});
  }, [modules, isModuleAccessible]);

  const handleModuleNavigate = useCallback(
    (moduleId: ModuleId, route: string) => {
      if (moduleAccess[moduleId]) {
        navigate(route);
        return;
      }
      openAuth(moduleId);
    },
    [moduleAccess, navigate, openAuth]
  );

  const lockedModules = useMemo(() => {
    return modules.filter((module) => !moduleAccess[module.id]);
  }, [modules, moduleAccess]);

  const primaryLockedModule = lockedModules[0]?.id as ModuleId | undefined;

  const podLayout = useMemo(() => {
    // --- Neural Architecture 3D Layout ---
    // Core Cores are tightly clustered at center
    // Plugins orbit far away
    
    return modules.map((module) => {
      let position: [number, number, number] = [0, 0, 0];
      
      switch(module.id) {
        // --- CORES (The Central Soul) ---
        case 'soma':    position = [-2.2, 0.2, 0]; break;
        case 'ledger':  position = [2.2, 0.2, 0];  break;
        case 'therapy': position = [0, 2.2, 1];    break;
        case 'trainer': position = [0, -1.8, -1];  break;
        
        // --- PLUGINS (Distant Belt) ---
        case 'scout':   position = [-8.5, 0.5, 2]; break;
        case 'atlas':   position = [8.5, -1.0, 3]; break;
        case 'forge':   position = [6.5, 3.5, -4]; break;
        case 'pulse':   position = [0, 4.0, -5];   break;
        
        default:        position = [0, 0, 0];
      }
      
      return { ...module, position };
    });
  }, [modules]);

  const spinePoints = useMemo(
    () => [
        // Tight Central Soul Loop
        new THREE.Vector3(-2.2, 0.2, 0), // Soma
        new THREE.Vector3(0, 2.2, 1),    // Agnes
        new THREE.Vector3(2.2, 0.2, 0),  // Ledger
        new THREE.Vector3(0, -1.8, -1), // Titan
        new THREE.Vector3(-2.2, 0.2, 0), // Back to Soma
    ],
    []
  );

  const orchestratorNodes = useMemo(() => {
    // Core Nodes form the central diamond
    // Plugin Nodes branch off
    const corePositions: Record<string, {x: number, y: number}> = {
        soma:    { x: 32, y: 55 },
        ledger:  { x: 50, y: 75 },
        therapy: { x: 68, y: 45 },
        trainer: { x: 50, y: 25 },
    };
    
    const pluginPositions: Record<string, {x: number, y: number}> = {
        scout:   { x: 15, y: 55 }, // Off Soma
        atlas:   { x: 35, y: 85 }, // Off Ledger
        forge:   { x: 85, y: 45 }, // Off Therapy
        pulse:   { x: 50, y: 8 },  // Off Trainer
    };

    return modules.map((module) => {
      const isCore = CORE_MODULES.includes(module.id);
      const pos = isCore ? corePositions[module.id] : pluginPositions[module.id];
      
      const isLeft = pos.x < 50;
      const cp1x = 50;
      const cp1y = 50;
      const cp2x = isLeft ? pos.x + 10 : pos.x - 10;
      const cp2y = pos.y;

      return {
        ...module,
        x: pos.x,
        y: pos.y,
        path: `M 50 50 C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pos.x} ${pos.y}`
      };
    });
  }, [modules]);

  const edgePulseBoost = edgePulsePriority === 'critical' ? 1.5 : edgePulsePriority === 'alert' ? 1.2 : 0.8;
  const edgeIntensity = Math.min(1, edgePulse * edgePulseBoost);

  const moduleStats = useMemo(() => {
    const nsv = globalSoul?.crossFunctionalState;
    const emotionalResilience = nsv?.emotional?.emotionalResilience ?? undefined;
    const cnsFatigue = nsv?.biological?.cnsFatigue ?? undefined;
    const recoveryScore = nsv?.biological?.recoveryScore ?? undefined;
    const sleepQuality = nsv?.biological?.sleepQuality ?? undefined;
    const resonanceROI = nsv?.resource?.resonanceROI ?? undefined;
    const financialFriction = nsv?.resource?.financialFriction ?? undefined;
    const energyBudget = nsv?.cognitive?.energyBudget ?? undefined;
    const researchLoad = nsv?.cognitive?.researchLoad ?? undefined;
    const formatNumber = (value?: number, digits = 1) => {
      if (value === null || value === undefined || Number.isNaN(value)) return '—';
      return value.toFixed(digits);
    };
    const toneFromValue = (value?: number, invert = false) => {
      if (value === null || value === undefined || Number.isNaN(value)) return 'neutral';
      const normalized = invert ? 10 - value : value;
      if (normalized >= 7) return 'good';
      if (normalized >= 4) return 'warn';
      return 'bad';
    };
    const isLocked = (moduleId: ModuleId) => !moduleAccess[moduleId];

    return {
      therapy: {
        label: 'Resilience',
        display: isLocked('therapy')
          ? '—'
          : emotionalResilience === undefined || emotionalResilience === null
          ? '—'
          : `${formatNumber(emotionalResilience, 1)}/10`,
        tone: isLocked('therapy') ? 'neutral' : toneFromValue(emotionalResilience)
      },
      trainer: {
        label: 'CNS Fatigue',
        display: isLocked('trainer')
          ? '—'
          : cnsFatigue === undefined || cnsFatigue === null
          ? '—'
          : `${formatNumber(cnsFatigue, 1)}/10`,
        tone: isLocked('trainer') ? 'neutral' : toneFromValue(cnsFatigue, true)
      },
      soma: {
        label: 'Recovery',
        display: isLocked('soma')
          ? '—'
          : recoveryScore !== undefined && recoveryScore !== null
          ? `${formatNumber(recoveryScore, 1)}/10`
          : sleepQuality !== undefined && sleepQuality !== null
          ? `${formatNumber(sleepQuality, 1)}/10`
          : '—',
        tone: isLocked('soma') ? 'neutral' : toneFromValue(recoveryScore ?? sleepQuality)
      },
      ledger: {
        label: 'Resonance ROI',
        display: isLocked('ledger')
          ? '—'
          : resonanceROI !== undefined && resonanceROI !== null
          ? `${formatNumber(resonanceROI, 2)}x`
          : financialFriction !== undefined && financialFriction !== null
          ? `${formatNumber(financialFriction, 1)}/10`
          : '—',
        tone: isLocked('ledger')
          ? 'neutral'
          : resonanceROI !== undefined && resonanceROI !== null
          ? resonanceROI >= 0.8 ? 'good' : resonanceROI >= 0.5 ? 'warn' : 'bad'
          : toneFromValue(financialFriction, true)
      },
      atlas: {
        label: 'Energy Budget',
        display: isLocked('atlas')
          ? '—'
          : energyBudget !== undefined && energyBudget !== null
          ? `${formatNumber(energyBudget, 1)}/10`
          : '—',
        tone: isLocked('atlas') ? 'neutral' : toneFromValue(energyBudget)
      },
      scout: {
        label: 'Research Load',
        display: isLocked('scout')
          ? '—'
          : researchLoad !== undefined && researchLoad !== null
          ? `${Math.round(researchLoad)}`
          : '—',
        tone: 'neutral'
      },
      forge: {
        label: 'Link',
        display: isLocked('forge') ? '—' : 'LOCAL',
        tone: isLocked('forge') ? 'neutral' : 'good'
      },
      pulse: {
        label: 'Signal',
        display: isLocked('pulse')
          ? '—'
          : globalSoul?.compactedInsights?.length
          ? 'ACTIVE'
          : 'IDLE',
        tone: isLocked('pulse') ? 'neutral' : globalSoul?.compactedInsights?.length ? 'good' : 'neutral'
      }
    } as Record<string, { label: string; display: string; tone: StatusTone }>;
  }, [globalSoul, moduleAccess]);

  const cnsFatigue = globalSoul?.crossFunctionalState?.biological?.cnsFatigue;
  const emotionalResilience = globalSoul?.crossFunctionalState?.emotional?.emotionalResilience;
  const coreModulesAccessible = ['therapy', 'trainer', 'soma', 'ledger'].every((id) => moduleAccess[id as ModuleId]);
  const stabilityGauge =
    moduleAccess.trainer && typeof cnsFatigue === 'number'
      ? Math.max(0, Math.min(100, 100 - cnsFatigue * 10))
      : null;
  const resilienceGauge =
    moduleAccess.therapy && typeof emotionalResilience === 'number'
      ? Math.max(0, Math.min(100, emotionalResilience * 10))
      : null;
  const wellnessGauge = coreModulesAccessible ? globalSoul?.overallWellnessScore ?? null : null;

  return (
    <ModuleLayout title="Neural Hub" themeColor="violet" hideBack={true}>
      <div className="flex-1 relative flex flex-col w-full h-full min-h-0 bg-[#020205]">
        
        {/* View Switcher Floating Toolbar */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 p-1.5 shadow-2xl pointer-events-auto">
          <button
            onClick={() => setViewMode('CARDS')}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50",
              viewMode === 'CARDS' ? "bg-white/15 text-white shadow-sm" : "text-white/40 hover:text-white hover:bg-white/5"
            )}
            aria-label="Switch to Cards View"
            aria-pressed={viewMode === 'CARDS'}
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('GRAPH')}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50",
              viewMode === 'GRAPH' ? "bg-white/15 text-white shadow-sm" : "text-white/40 hover:text-white hover:bg-white/5"
            )}
            aria-label="Switch to Graph View"
            aria-pressed={viewMode === 'GRAPH'}
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('3D')}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50",
              viewMode === '3D' ? "bg-white/15 text-white shadow-sm" : "text-white/40 hover:text-white hover:bg-white/5"
            )}
            aria-label="Switch to 3D View"
            aria-pressed={viewMode === '3D'}
          >
            <Box className="w-4 h-4" />
          </button>
        </div>

        {/* 3D Canvas Background */}
        <div 
          className={cn(
            "absolute inset-0 z-0 transition-opacity duration-1000", 
            viewMode === '3D' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          style={{ touchAction: 'none' }}
        >
          <Canvas 
            camera={{ position: [0, 0, 13], fov: 50 }} 
            gl={{ antialias: true, alpha: true }}
            style={{ touchAction: 'none' }}
          >
            <color attach="background" args={['#020205']} />
            <fog attach="fog" args={['#020205', 5, 22]} />
            <Suspense fallback={null}>
              <Environment preset="city" />
              <ambientLight intensity={0.2} />
              <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
              <PresentationControls global snap={true}>
                <group position={[0, 0.8, 0]}>
                  <HubSpine points={spinePoints} />
                  {podLayout.map((module) => {
                    const modelType =
                      module.id === 'therapy' ? 'eve' :
                      module.id === 'trainer' ? 'walle' :
                      module.id === 'ledger' ? 'ledger' :
                      module.id === 'soma' ? 'soma' :
                      module.id === 'atlas' ? 'atlas' :
                      module.id === 'scout' ? 'scout' :
                      module.id === 'forge' ? 'forge' :
                      module.id === 'pulse' ? 'pulse' : 'basic';
                    
                    const title = globalSoul?.displayNames?.[module.id] || module.title;
                    return (
                      <FloatingPod
                        key={module.id}
                        position={module.position}
                        color={module.color}
                        title={title}
                        icon={module.icon}
                        modelType={modelType}
                        soul={globalSoul}
                        isLocked={!moduleAccess[module.id]}
                        onClick={() => handleModuleNavigate(module.id as ModuleId, module.route)}
                      />
                    );
                  })}
                </group>
              </PresentationControls>
              <ContactShadows position={[0, -4, 0]} opacity={0.4} scale={20} blur={2.4} far={4.5} />
            </Suspense>
          </Canvas>
        </div>

        {/* Content Layers */}
        <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
          <AnimatePresence mode="wait">
            
            {/* CARDS VIEW */}
            {viewMode === 'CARDS' && (
              <motion.div
                key="cards"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 pointer-events-auto overflow-y-auto no-scrollbar pt-28 px-6 pb-40 flex flex-col"
              >
                {/* Soul Core Grid */}
                <div className="flex-1 flex flex-col justify-center max-w-[1200px] mx-auto w-full mb-20">
                    <div className="flex items-center gap-6 mb-10">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                        <span className="text-[11px] font-black uppercase tracking-[0.6em] text-white/60 italic drop-shadow-sm">Soul_Core_Interface</span>
                        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-white/20 to-transparent" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        {modules.filter(m => !m.isPlugin).map((m) => (
                            <ModuleCard
                                key={m.id}
                                {...m}
                                title={globalSoul?.displayNames?.[m.id] || m.title}
                                isLocked={!moduleAccess[m.id]}
                                stat={moduleStats[m.id]}
                                onClick={() => handleModuleNavigate(m.id as ModuleId, m.route)}
                            />
                        ))}
                    </div>
                </div>

                {/* Plugin Scroll Belt */}
                <div className="w-full max-w-[1400px] mx-auto">
                    <div className="flex items-center gap-6 mb-8">
                         <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/40 italic drop-shadow-sm">Synaptic_Plugins</span>
                         <div className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" />
                    </div>
                    <div className="flex flex-wrap justify-center gap-6 pb-8">
                        {modules.filter(m => m.isPlugin).map((m) => (
                            <div key={m.id}>
                                <ModuleCard
                                    {...m}
                                    title={globalSoul?.displayNames?.[m.id] || m.title}
                                    isLocked={!moduleAccess[m.id]}
                                    stat={moduleStats[m.id]}
                                    onClick={() => handleModuleNavigate(m.id as ModuleId, m.route)}
                                    isPlugin={true}
                                />
                            </div>
                        ))}
                    </div>
                </div>
              </motion.div>
            )}

            {/* GRAPH VIEW */}
            {viewMode === 'GRAPH' && (
              <motion.div
                key="graph"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="flex-1 pointer-events-auto relative pt-20 px-6 pb-28 max-w-7xl w-full mx-auto"
              >
                <div className="absolute inset-x-6 top-20 bottom-28 rounded-[48px] border border-white/5 bg-black/40 backdrop-blur-2xl overflow-hidden shadow-2xl">
                  {/* Faint Grid Background */}
                  <div className="absolute inset-0 opacity-[0.02] pointer-events-none" 
                       style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
                  
                  <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0px,transparent_60%)]" />
                  
                  <svg className="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="edge-grad-left" x1="1" y1="0.5" x2="0" y2="0.5">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.15" />
                      </linearGradient>
                      <linearGradient id="edge-grad-right" x1="0" y1="0.5" x2="1" y2="0.5">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#c084fc" stopOpacity="0.15" />
                      </linearGradient>
                    </defs>
                    
                    {orchestratorNodes.map((node) => {
                      const isLeft = node.x < 50;
                      const isHovered = hoveredNodeId === node.id;
                      return (
                        <g key={`edge-${node.id}`}>
                          <path
                            d={node.path}
                            fill="none"
                            stroke={isLeft ? "url(#edge-grad-left)" : "url(#edge-grad-right)"}
                            strokeOpacity={isHovered ? 0.8 : 0.35}
                            strokeWidth={isHovered ? 1.2 : 0.6}
                            className="transition-all duration-500"
                          />
                          <circle r="0.3" fill="#fff" style={{ filter: 'blur(0.2px)' }}>
                            <animateMotion
                              dur={`${4 - edgeIntensity * 2}s`}
                              repeatCount="indefinite"
                              path={node.path}
                            />
                          </circle>
                        </g>
                      );
                    })}
                  </svg>

                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 flex items-center justify-center">
                    <div className="absolute inset-0 bg-violet-500/5 rounded-full blur-[100px] animate-pulse" />
                    <div className="absolute inset-4 border border-white/[0.03] rounded-full animate-[spin_60s_linear_infinite]" />
                    <div className="absolute inset-12 border border-white/[0.05] rounded-full animate-[spin_40s_linear_reverse_infinite]" />

                    <div className="relative w-40 h-40 rounded-full border border-white/10 bg-black/80 backdrop-blur-3xl flex flex-col items-center justify-center shadow-[0_0_80px_rgba(139,92,246,0.15)]">
                        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
                            <Sparkles className="w-6 h-6 text-violet-400/80" />
                        </div>
                        <span className="text-[11px] uppercase tracking-[0.5em] text-white/90 font-black italic ml-[0.5em]">Nyx</span>
                        <span className="text-[7px] uppercase tracking-[0.3em] text-white/20 font-bold mt-3">Link_Active</span>
                    </div>
                  </div>

                  {orchestratorNodes.map((node) => (
                    <NodeCard
                      key={`node-${node.id}`}
                      node={node}
                      stat={moduleStats[node.id]}
                      canEnter={moduleAccess[node.id]}
                      isHovered={hoveredNodeId === node.id}
                      onClick={() => handleModuleNavigate(node.id as ModuleId, node.route)}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* 3D VIEW (Empty div just to occupy the slot in AnimatePresence) */}
            {viewMode === '3D' && (
              <motion.div
                key="3d"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 pointer-events-none"
              />
            )}
          </AnimatePresence>

          {/* Bottom Fixed Area - Unified Dashboard */}
          <div className="mt-auto pb-10 px-12 pointer-events-auto relative z-20 w-full max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 bg-black/60 backdrop-blur-3xl border border-white/10 p-2 rounded-[32px] shadow-2xl">
              
              {lockedModules.length > 0 ? (
                <div className="flex-1 flex items-center gap-4 px-6 py-3 bg-amber-500/5 rounded-[24px] border border-amber-500/10">
                   <Lock className="w-5 h-5 text-amber-400 shrink-0" />
                   <div className="flex-1">
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest block mb-0.5">Vault Encrypted</span>
                      <p className="text-[9px] text-white/40 uppercase">
                        {lockedModules.length} module{lockedModules.length > 1 ? 's' : ''} locked. Initialize handshake to sync.
                      </p>
                   </div>
                   <NeuralButton size="sm" onClick={() => openAuth(primaryLockedModule ?? 'global')} className="bg-amber-600 hover:bg-amber-500 h-9 px-6 text-[10px]">
                      Sync Now
                   </NeuralButton>
                </div>
              ) : (
                <div className="flex-1 px-4">
                   <NeuralIntegrity mode="global" onUpgrade={() => openAuth('global')} />
                </div>
              )}

              <div className="hidden md:block w-px h-12 bg-white/5" />

              <div className="flex items-center gap-8 px-8 py-3">
                <ReactiveGauge
                  label="Wellness"
                  value={wellnessGauge}
                  colorClass="text-indigo-400"
                  icon={Sparkles}
                />
                <div className="w-px h-8 bg-white/5 shrink-0" />
                <ReactiveGauge 
                    label="Stability" 
                    value={stabilityGauge} 
                    colorClass="text-orange-400" 
                    icon={Activity} 
                />
                <div className="w-px h-8 bg-white/5 shrink-0" />
                <ReactiveGauge 
                    label="Resilience" 
                    value={resilienceGauge} 
                    colorClass="text-cyan-400" 
                    icon={Shield} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <UnifiedAuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} mode={authMode} />
    </ModuleLayout>
  );
}

useGLTF.preload('/assets/models/walle.glb');
useGLTF.preload('/assets/models/eve.glb');
useGLTF.preload('/assets/models/ledger.glb');
useGLTF.preload('/assets/models/soma.glb');
