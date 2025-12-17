
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const Stars = () => {
  const ref = useRef<THREE.Points>(null);
  
  // "Natural" distribution: Random positions + varied brightness (magnitude)
  const count = 3500;
  
  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    
    const r = 450; // Distance

    for (let i = 0; i < count; i++) {
      // 1. Random Point on Sphere Surface
      // Using standard spherical coordinate distribution
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      // 2. Brightness/Magnitude Variation
      // Real skies have many faint stars and few bright ones.
      // Use a power curve to bias towards dimmer values.
      // brightness range: 0.2 to 1.0
      const intensity = 0.2 + Math.pow(Math.random(), 4) * 0.8;
      
      // 3. Subtle Color Temperature
      // 80% white, 10% slight blue, 10% slight red/orange
      let c = new THREE.Color();
      const rand = Math.random();
      if (rand > 0.9) c.setHSL(0.6, 0.8, 0.8); // Blue-ish
      else if (rand < 0.1) c.setHSL(0.05, 0.8, 0.8); // Orange-ish
      else c.setHSL(0, 0, 1.0); // White

      // Apply intensity to color directly (vertex colors act as tint)
      col[i * 3] = c.r * intensity;
      col[i * 3 + 1] = c.g * intensity;
      col[i * 3 + 2] = c.b * intensity;
    }
    return [pos, col];
  }, []);

  useFrame((state) => {
    if (ref.current) {
      // Slow rotation of the galaxy
      ref.current.rotation.y += 0.00005; 
      ref.current.rotation.x += 0.00001;

      // Visibility Logic Sync with Scene.tsx
      // PERMANENT DAY MODE: Stars are always invisible
      // Elevation fixed at 0.707 (Daytime)
      const elevation = 0.707;

      // Fade Logic:
      // Stars are visible in Night (-1 to -0.35)
      // Start fading during Astronomical Twilight (-0.35)
      // Completely invisible just after horizon (0.05)
      
      let opacity = 0;
      if (elevation < 0.05) {
          const fadeStart = -0.35; // Start fading when sun is 35% below horizon (rising)
          const fadeEnd = 0.05;    // Fully gone just above horizon
          
          if (elevation < fadeStart) {
              opacity = 1.0;
          } else {
             // Linear fade from 1 to 0
             const t = (elevation - fadeStart) / (fadeEnd - fadeStart);
             opacity = 1.0 - THREE.MathUtils.smoothstep(t, 0, 1);
          }
      }
      
      // Twinkle effect (subtle global pulse)
      const twinkle = 0.85 + Math.sin(state.clock.elapsedTime * 2.0) * 0.15;

      (ref.current.material as THREE.PointsMaterial).opacity = opacity * twinkle;
    }
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial 
        size={2.5} 
        sizeAttenuation={false} 
        vertexColors
        transparent 
        opacity={0} 
        fog={false} 
        depthWrite={false}
      />
    </points>
  );
};
