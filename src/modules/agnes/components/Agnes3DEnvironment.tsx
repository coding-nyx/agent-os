import React, { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment, ContactShadows, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { EveModel } from '../../hub/components/three/models';
import { useGlobalSoul } from '@/lib/global-soul-context';

function BeliefNebula() {
  const points = useMemo(() => {
    // Reduced from 1000 to 400 for performance
    const count = 400;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 30;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 30;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    return arr;
  }, []);
  
  const ref = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.03;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <pointsMaterial 
        size={0.08} 
        color="#818cf8" 
        transparent 
        opacity={0.2} 
        sizeAttenuation 
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

interface Agnes3DEnvironmentProps {
  activeSession: boolean;
  isProcessing?: boolean;
}

export function Agnes3DEnvironment({ activeSession, isProcessing }: Agnes3DEnvironmentProps) {
  const { globalSoul } = useGlobalSoul();
  const [webglError, setWebglError] = useState(false);

  const shouldRender3D = !webglError;
  if (!shouldRender3D) {
    return (
      <div className="absolute inset-0 z-0 bg-[#020205] overflow-hidden transition-opacity duration-1000">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(99,102,241,0.08),_transparent_70%)]" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px]" />
        <div className="absolute inset-0 surface-grid opacity-[0.02]" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      <Canvas 
        camera={{ position: [0, 0, 10], fov: 45 }} 
        dpr={1} // Lock to 1 for performance, avoid 2x retina tax
        performance={{ min: 0.5 }}
        gl={{ 
          antialias: false, 
          powerPreference: "low-power",
          stencil: false,
          depth: true,
          alpha: false
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#020205');
        }}
        onError={(err) => {
          console.warn('[Agnes3D] WebGL Optimization fallback triggered:', err);
          setWebglError(true);
        }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.4} />
          <pointLight position={[5, 5, 5]} intensity={0.5} color="#818cf8" />
          
          <BeliefNebula />
          
          <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
            <group position={[activeSession ? 4 : 0, -1, 0]} scale={activeSession ? 1 : 1.8}>
                <EveModel 
                  soul={globalSoul ?? null} 
                  scale={0.5} 
                  position={[0, 0, 0]} 
                />
            </group>
          </Float>

          <ContactShadows position={[0, -4, 0]} opacity={0.3} scale={15} blur={3} far={4} />
        </Suspense>
      </Canvas>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020205]/20 to-[#020205]" />
    </div>
  );
}
