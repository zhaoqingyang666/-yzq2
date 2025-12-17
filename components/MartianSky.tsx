
import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const vertexShader = `
varying vec3 vWorldPosition;
void main() {
  // Use local position as direction vector (ignoring translation)
  // This ensures the gradient and sky features map correctly as a "skybox" 
  // regardless of how far the rover travels.
  vWorldPosition = (modelMatrix * vec4(position, 0.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
uniform vec3 uColorTop;
uniform vec3 uColorBottom;
uniform vec3 uSunPosition; // Treated as relative direction vector
uniform vec3 uSunHaloColor;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDirection = normalize(vWorldPosition);
  vec3 sunDirection = normalize(uSunPosition);
  
  // Vertical Gradient (Horizon to Zenith)
  // Map Y from -0.2 (below horizon) to 1.0 (zenith) for smooth blending
  float h = normalize(vWorldPosition).y;
  h = smoothstep(-0.2, 0.6, h); 
  vec3 skyGradient = mix(uColorBottom, uColorTop, h);

  // Sun Glow (Mie Scattering approximation)
  // Mars has a lot of dust, so the glow is wide (low exponent for halo) but intense core
  float sunDot = max(0.0, dot(viewDirection, sunDirection));
  
  // Core Sun Disk
  float sunCore = pow(sunDot, 64.0) * 2.0;
  
  // Atmospheric Halo (Blue at sunset, White/Dusty at noon)
  float sunHalo = pow(sunDot, 8.0) * 0.6; 
  
  vec3 glowColor = uSunHaloColor * (sunCore + sunHalo);
  
  // Combine (No Night Filter - Permanent Day)
  vec3 finalColor = skyGradient + glowColor;

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

interface MartianSkyProps {
    topColor: THREE.Color;
    bottomColor: THREE.Color;
    sunPosition: THREE.Vector3;
    sunHaloColor: THREE.Color;
}

export const MartianSky: React.FC<MartianSkyProps> = ({ topColor, bottomColor, sunPosition, sunHaloColor }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  
  useFrame(() => {
     if(meshRef.current) {
        // Lock sky sphere to camera position to create infinite sky illusion
        meshRef.current.position.copy(camera.position);

        const uniforms = (meshRef.current.material as THREE.ShaderMaterial).uniforms;
        uniforms.uColorTop.value.copy(topColor);
        uniforms.uColorBottom.value.copy(bottomColor);
        uniforms.uSunPosition.value.copy(sunPosition);
        uniforms.uSunHaloColor.value.copy(sunHaloColor);
     }
  });

  return (
    <mesh ref={meshRef} scale={[-1, 1, 1]}> {/* Invert scale to view from inside */}
        <sphereGeometry args={[4500, 32, 32]} />
        <shaderMaterial 
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            uniforms={{
                uColorTop: { value: new THREE.Color(0.5, 0.2, 0.2) }, // Default init
                uColorBottom: { value: new THREE.Color(0.8, 0.3, 0.2) },
                uSunPosition: { value: new THREE.Vector3(0, 1, 0) },
                uSunHaloColor: { value: new THREE.Color(1, 0.8, 0.6) }
            }}
            side={THREE.BackSide}
            fog={false} // Sky should not be affected by scene fog
            depthWrite={false} // Render behind everything (stars, terrain)
        />
    </mesh>
  );
};
