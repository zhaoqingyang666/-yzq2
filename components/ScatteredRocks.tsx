
import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { randomRange, simpleNoise } from '../utils/noise';

interface ScatteredRocksProps {
  count?: number;
  color: string;
  minScale?: number;
  maxScale?: number;
  chunkSize?: number;
  offsetX?: number;
  offsetZ?: number;
}

const ScatteredRocks: React.FC<ScatteredRocksProps> = ({ 
  count = 20, 
  color,
  minScale = 0.5,
  maxScale = 2.5,
  chunkSize = 80,
  offsetX = 0,
  offsetZ = 0
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (meshRef.current) {
      let i = 0;
      // Use a pseudo-random seed based on chunk position to ensure determinism
      // This way if we revisit a chunk, rocks are in the same place.
      const seedBase = offsetX * 123.45 + offsetZ * 678.91;
      
      const pseudoRandom = (idx: number) => {
          const s = Math.sin(seedBase + idx) * 43758.5453;
          return s - Math.floor(s);
      }

      while (i < count) {
        // Scale variation
        const r3 = pseudoRandom(i * 3 + 2);
        const scale = minScale + r3 * (maxScale - minScale);

        // Local position within the chunk
        // range [-chunkSize/2, chunkSize/2]
        const r1 = pseudoRandom(i * 3 + 0);
        const r2 = pseudoRandom(i * 3 + 1);
        
        let localX = (r1 - 0.5) * chunkSize;
        const localZ = (r2 - 0.5) * chunkSize;
        
        // World position
        let worldX = localX + offsetX;
        const worldZ = localZ + offsetZ;

        // --- PATH CLEARANCE LOGIC ---
        // Ensure "Giant" rocks (Massive/Gigantic, scale > 8) do not spawn in the rover's central path.
        // Creates a safe corridor centered at X=0.
        if (scale > 8.0) {
            const SAFE_ZONE = 25.0; // Radius of safe zone (Total width 50)
            if (Math.abs(worldX) < SAFE_ZONE) {
                // Determine direction to push (preserve original side preference)
                const pushDir = worldX >= 0 ? 1 : -1;
                // Move rock to the edge of safe zone plus some random variation
                // We use r1 (already random for X) to vary the distance from the safe edge
                const offset = SAFE_ZONE + (r1 * 10); 
                worldX = pushDir * offset;
                
                // Recalculate localX so it renders correctly in the chunk
                localX = worldX - offsetX;
            }
        }

        // Calculate ground height at the (potentially modified) position
        const groundHeight = simpleNoise(worldX, worldZ, 42);

        // Position Y
        // Optimized: Lowered by an extra 0.2 to bury bottom of rocks slightly, preventing "floating"
        // on steep terrain slopes where linear interpolation of terrain mesh differs from noise func.
        const y = -2 + groundHeight - (scale * 0.4) - 0.2;
        
        dummy.position.set(localX, y, localZ);
        
        // Random rotation
        dummy.rotation.set(
            pseudoRandom(i * 4) * Math.PI, 
            pseudoRandom(i * 4 + 1) * Math.PI, 
            pseudoRandom(i * 4 + 2) * Math.PI
        );
        
        // Flatten rocks
        dummy.scale.set(scale, scale * 0.7, scale); 
        dummy.updateMatrix();
        
        meshRef.current.setMatrixAt(i, dummy.matrix);
        i++;
      }
      meshRef.current.instanceMatrix.needsUpdate = true;

      // --- FRUSTUM CULLING OPTIMIZATION ---
      // Manually calculate the bounding sphere for the instanced mesh.
      // By default, Three.js uses the bounding sphere of the base geometry (radius ~1).
      // Since our instances are scattered across the entire chunk, we need a bounding sphere
      // that encompasses the whole chunk to prevent premature culling (popping) and ensure
      // the GPU skips processing this chunk when it is truly out of view.
      if (meshRef.current.geometry) {
        // Diagonal of the chunk square: chunkSize * sqrt(2)
        // Radius is half diagonal + buffer for rock scale/height variation
        const radius = (chunkSize * Math.SQRT2) / 2 + maxScale + 5.0;
        
        if (!meshRef.current.geometry.boundingSphere) {
            meshRef.current.geometry.boundingSphere = new THREE.Sphere();
        }
        // The mesh is positioned at the center of the chunk, so sphere center is (0,0,0) in local space
        meshRef.current.geometry.boundingSphere.center.set(0, 0, 0);
        meshRef.current.geometry.boundingSphere.radius = radius;
      }
    }
  }, [count, dummy, minScale, maxScale, chunkSize, offsetX, offsetZ]);

  // The mesh itself is positioned at the chunk center
  return (
    <instancedMesh 
      ref={meshRef} 
      args={[undefined, undefined, count]} 
      position={[offsetX, 0, offsetZ]}
      castShadow 
      receiveShadow
    >
      <dodecahedronGeometry args={[1, 0]} /> 
      <meshStandardMaterial color={color} roughness={0.9} flatShading />
    </instancedMesh>
  );
};

export default React.memo(ScatteredRocks);
