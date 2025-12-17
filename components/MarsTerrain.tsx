
import React, { useLayoutEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { simpleNoise, fastNoise } from '../utils/noise';

interface MarsTerrainProps {
  colorPrimary: string;
  colorSecondary: string;
  chunkSize?: number;
  offsetX?: number;
  offsetZ?: number;
}

const MarsTerrain: React.FC<MarsTerrainProps> = ({ 
  colorPrimary, 
  colorSecondary,
  chunkSize = 80,
  offsetX = 0,
  offsetZ = 0
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  // Adjusted segments for chunk size (density)
  const segments = 128; 

  // Generate heightmap based on World Position (Offset)
  // This runs on the geometry and needs the complex noise for shape
  useLayoutEffect(() => {
    if (meshRef.current) {
      const geometry = meshRef.current.geometry;
      const positionAttribute = geometry.getAttribute('position');
      const vertex = new THREE.Vector3();

      for (let i = 0; i < positionAttribute.count; i++) {
        vertex.fromBufferAttribute(positionAttribute, i);
        const worldX = vertex.x + offsetX;
        const worldZ = -vertex.y + offsetZ;

        // Apply noise
        const elevation = simpleNoise(worldX, worldZ, 42); 
        
        // Set Z (which becomes Y-up in world space)
        positionAttribute.setZ(i, elevation);
      }
      
      positionAttribute.needsUpdate = true;
      geometry.computeVertexNormals();
    }
  }, [offsetX, offsetZ, chunkSize]);

  // Generate stylized procedural texture
  // OPTIMIZATION: Use fastNoise instead of simpleNoise to reduce CPU load by ~80%
  const texture = useMemo(() => {
    // Reduced resolution slightly for performance with multiple chunks
    const size = 128; // Reduced from 256 for performance
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      const imgData = ctx.createImageData(size, size);
      const data = imgData.data;
      
      const c1 = new THREE.Color(colorPrimary);
      const c2 = new THREE.Color(colorSecondary);
      const tempColor = new THREE.Color();
      
      // 1. Generate Base Pattern
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const v = 1 - (y / size); 

          const localX = (u - 0.5) * chunkSize;
          const localZ = (v - 0.5) * chunkSize; 

          const worldX = localX + offsetX;
          const worldZ = -localZ + offsetZ; 
          
          // Use fastNoise here
          const noiseVal = fastNoise(worldX, worldZ);
          
          // Simplified banding logic
          let norm = (noiseVal + 0.5); // approximate normalization
          norm = Math.max(0, Math.min(1, norm));
          
          const bands = 8; 
          const band = Math.floor(norm * bands) / bands;
          
          tempColor.copy(c1).lerp(c2, band * 0.4); 
          
          // Add subtle high-frequency grain/noise
          const grain = (Math.random() - 0.5) * 0.03; 
          
          const idx = (x + y * size) * 4;
          data[idx] = Math.min(255, (tempColor.r + grain) * 255);
          data[idx + 1] = Math.min(255, (tempColor.g + grain) * 255);
          data[idx + 2] = Math.min(255, (tempColor.b + grain) * 255);
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // 2. Add Stylized cracks (Fewer strokes for perf)
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = new THREE.Color(colorPrimary).offsetHSL(0, 0, -0.15).getStyle();
      ctx.lineWidth = 1; // Thinner lines for lower res
      ctx.globalAlpha = 0.2; 
      ctx.lineCap = 'round';
      
      const cellCount = 2; // Reduced detail
      const cellSize = size / cellCount;
      
      for (let i = 0; i <= cellCount; i++) {
        // Horizontal-ish
        ctx.beginPath();
        for (let j = 0; j <= cellCount; j++) {
           const x = j * cellSize + (Math.random() - 0.5) * cellSize * 0.8;
           const y = i * cellSize + (Math.random() - 0.5) * cellSize * 0.8;
           if (j === 0) ctx.moveTo(x, y);
           else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Vertical-ish
        ctx.beginPath();
        for (let j = 0; j <= cellCount; j++) {
           const x = i * cellSize + (Math.random() - 0.5) * cellSize * 0.8;
           const y = j * cellSize + (Math.random() - 0.5) * cellSize * 0.8;
           if (j === 0) ctx.moveTo(x, y);
           else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4; 
    return tex;
  }, [colorPrimary, colorSecondary, offsetX, offsetZ, chunkSize]);

  return (
    <mesh 
      ref={meshRef} 
      rotation={[-Math.PI / 2, 0, 0]} 
      position={[offsetX, -2, offsetZ]} 
      receiveShadow
      castShadow
    >
      <planeGeometry args={[chunkSize, chunkSize, segments, segments]} />
      <meshStandardMaterial 
        map={texture}
        color="white" 
        roughness={1.0} 
        metalness={0.0}
        flatShading={false} 
      />
    </mesh>
  );
};

export default React.memo(MarsTerrain);
