
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Removed 'Atmosphere' component (Fog logic moved to Scene.tsx)

export const FloatingParticles = ({ stormActive }: { stormActive: boolean }) => {
  // Reduced count for optimization (was 6000), increased size to compensate
  const count = 3000;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Track storm transition locally for smoother particle updates
  const stormFactor = useRef(0);

  const particles = useRef<{ position: THREE.Vector3, speed: number, size: number, turbulence: number }[]>([]);

  if (particles.current.length === 0) {
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 100;
      const y = Math.random() * 25;
      const z = (Math.random() - 0.5) * 100;
      particles.current.push({
        position: new THREE.Vector3(x, y, z),
        speed: Math.random() * 0.02 + 0.005,
        size: 0.05 + Math.random() * 0.06, // Slightly larger particles
        turbulence: Math.random()
      });
    }
  }

  useFrame((state, delta) => {
    if (!mesh.current) return;

    // Smooth transition between calm and storm states
    const targetFactor = stormActive ? 1.0 : 0.0;
    stormFactor.current = THREE.MathUtils.lerp(stormFactor.current, targetFactor, delta * 2.0);
    const t = stormFactor.current;

    // --- Dynamic Color Sync ---
    // Read the current fog color (set by Scene.tsx day/night cycle)
    // and blend particles to it so they don't glow in the dark
    if (state.scene.fog) {
        const fogColor = (state.scene.fog as THREE.Fog).color;
        const mat = mesh.current.material as THREE.MeshBasicMaterial;
        
        // Base color is always derived from fog to match environment
        const particleColor = new THREE.Color(fogColor);
        
        // During calm: slightly brighter than fog (dust motes in sun) -> Lightness +0.05
        // During storm: exact match to fog (thick dust) -> Lightness +0.0
        const lightnessOffset = THREE.MathUtils.lerp(0.05, 0.0, t);
        particleColor.offsetHSL(0, 0, lightnessOffset);
        
        mat.color.copy(particleColor);
        
        // Opacity: 
        // Calm: Very subtle (0.2) to prevent "white dots" look
        // Storm: High visibility (0.85)
        mat.opacity = THREE.MathUtils.lerp(0.2, 0.85, t);
    }
    
    const camPos = state.camera.position;
    const range = 50; 

    // When storm is active, move particles much faster
    // Smooth speed multiplier transition
    const speedMult = THREE.MathUtils.lerp(1.0, 80.0, t);
    
    // Scale particles up during storm for "thick" look
    const scaleMult = THREE.MathUtils.lerp(1.0, 3.0, t);

    // Number of active particles can theoretically be reduced in calm, 
    // but updating all keeps it consistent during transition.
    // For perf, we can just hide far ones or scale them to 0 if we wanted, 
    // but 3000 static updates is cheap.
    
    particles.current.forEach((particle, i) => {
      particle.position.x -= particle.speed * speedMult; 
      
      // Vertical turbulence only during storm
      if (t > 0.1) {
          particle.position.y += (Math.random() - 0.5) * 0.8 * particle.turbulence * t;
          particle.position.z += (Math.random() - 0.5) * 0.5 * particle.turbulence * t;
          
          if (particle.position.y < 0) particle.position.y = 20;
          if (particle.position.y > 20) particle.position.y = 0;
      }

      let dx = particle.position.x - camPos.x;
      dx = ((((dx + range) % (range * 2)) + (range * 2)) % (range * 2)) - range;
      particle.position.x = camPos.x + dx;

      let dz = particle.position.z - camPos.z;
      dz = ((((dz + range) % (range * 2)) + (range * 2)) % (range * 2)) - range;
      particle.position.z = camPos.z + dz;

      dummy.position.copy(particle.position);
      
      const scale = particle.size * scaleMult;
      dummy.scale.setScalar(scale);
      
      if (t > 0.1) {
          dummy.rotation.x += delta * particle.speed * 20 * t;
          dummy.rotation.z += delta * particle.speed * 20 * t;
      }
      
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshBasicMaterial 
        color="#CBB0A6" // Default calm dust
        transparent 
      />
    </instancedMesh>
  );
}

export const FlyingDebris = ({ stormActive }: { stormActive: boolean }) => {
  const count = 800; 
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const debris = useRef<{ 
    position: THREE.Vector3, 
    velocity: THREE.Vector3, 
    rotAxis: THREE.Vector3,
    rotSpeed: number,
    scale: number 
  }[]>([]);

  if (debris.current.length === 0) {
      for(let i=0; i<count; i++) {
          debris.current.push({
              position: new THREE.Vector3(
                  (Math.random() - 0.5) * 80,
                  Math.random() * 5, 
                  (Math.random() - 0.5) * 80
              ),
              velocity: new THREE.Vector3(0, 0, 0),
              rotAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
              rotSpeed: Math.random() * 10 + 5,
              scale: Math.random() * 0.3 + 0.1 
          });
      }
  }

  useFrame((state, delta) => {
    if (!mesh.current) return;
    
    if (!stormActive) {
        mesh.current.count = 0;
        mesh.current.instanceMatrix.needsUpdate = true;
        return;
    }
    
    mesh.current.count = count;
    const camPos = state.camera.position;
    const range = 60; 
    
    debris.current.forEach((d, i) => {
        d.velocity.x -= 200.0 * delta; 
        d.velocity.y -= 30.0 * delta; 
        
        if (d.position.y <= 0) {
            d.position.y = 0;
            d.velocity.y = Math.abs(d.velocity.y) * 0.4;
            d.velocity.x *= 0.6;
            
            if (Math.random() < 0.1) {
                d.velocity.y += Math.random() * 15 + 5; 
                d.velocity.x -= Math.random() * 20; 
            }
        }
        
        d.velocity.x = Math.max(d.velocity.x, -120);
        d.position.addScaledVector(d.velocity, delta);
        
        const distX = d.position.x - camPos.x;
        const distZ = d.position.z - camPos.z;
        const isFarX = Math.abs(distX) > range;
        const isFarZ = Math.abs(distZ) > range;

        if (isFarX || isFarZ) {
            if (isFarX && !isFarZ && d.position.x < camPos.x) {
                d.position.x = camPos.x + range;
                d.position.y = Math.random() * 10 + 2; 
                d.velocity.set(-20, -10, 0); 
            } 
            else {
                d.position.x = camPos.x + (Math.random() - 0.5) * (range * 2);
                d.position.z = camPos.z + (Math.random() - 0.5) * (range * 2);
                d.position.y = Math.random() * 10 + 2; 
                d.velocity.set(0, 0, 0); 
            }
        }

        dummy.position.copy(d.position);
        dummy.scale.setScalar(d.scale);
        dummy.rotateOnAxis(d.rotAxis, d.rotSpeed * delta); 
        
        dummy.updateMatrix();
        mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      <tetrahedronGeometry args={[1, 0]} /> 
      <meshStandardMaterial 
        color="#5E423A" // Darker rock-like color
        roughness={0.9} 
        flatShading 
      />
    </instancedMesh>
  );
};
