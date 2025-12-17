
import React, { useMemo, useRef, useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { simpleNoise, randomRange } from '../utils/noise';
import { RoverHandle } from '../types';

const WHEEL_POSITIONS = [
  [-0.7, 0.2, -0.5], [0.7, 0.2, -0.5], // Front (Indices 0, 1)
  [-0.8, 0.2, 0.1],  [0.8, 0.2, 0.1],  // Middle (Indices 2, 3)
  [-0.7, 0.2, 0.6],  [0.7, 0.2, 0.6]   // Rear (Indices 4, 5)
];

// Configuration to match Scene.tsx rock generation
const ROCK_LAYERS = [
  { count: 1, minScale: 22, maxScale: 32 }, // Gigantic
  { count: 3, minScale: 9, maxScale: 15 },  // Massive
  { count: 25, minScale: 1.5, maxScale: 3.5 } // Large
];

const CHUNK_SIZE = 80;

// Threshold for what constitutes a "small" rock that can be run over
// Rover scale is 3, wheel clearance is decent. Rocks smaller than this scale are traverseable.
const RUNNABLE_ROCK_SCALE = 2.5; 

interface Obstacle {
  id: string;
  x: number;
  z: number;
  radius: number; // Steering/Avoidance radius (includes buffer)
  scale: number;  // Physical visual scale
}

const PanelDustSlide = ({ leftPanel, rightPanel, stormActive, agentState, scale = 1 }: { 
    leftPanel: React.MutableRefObject<THREE.Group | null>, 
    rightPanel: React.MutableRefObject<THREE.Group | null>,
    stormActive: boolean, 
    agentState: React.MutableRefObject<any>, 
    scale?: number 
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = 1200; 
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tempVec = useMemo(() => new THREE.Vector3(), []);
  
  // Particle State
  const particles = useMemo(() => {
    return new Array(count).fill(0).map(() => ({
      life: 0,
      x: 0, y: -100, z: 0,
      vx: 0, vy: 0, vz: 0,
      scale: 0
    }));
  }, []);

  useFrame((state, delta) => {
    if (!meshRef.current || !leftPanel.current || !rightPanel.current) return;
    
    const dustLevel = agentState.current.dustLevel;
    const retractionT = agentState.current.retractionT;

    const active = !stormActive && dustLevel > 0.05 && retractionT < 0.95 && retractionT > 0.1;
    
    if (active) {
        const spawnRate = 40; 
        for (let k = 0; k < spawnRate; k++) {
            const idx = Math.floor(Math.random() * count);
            const p = particles[idx];
            
            if (p.life <= 0) {
                p.life = 1.0;
                
                const isLeft = Math.random() > 0.5;
                const panel = isLeft ? leftPanel.current : rightPanel.current;
                
                const u = Math.random();
                const v = Math.random();
                
                const lx = isLeft ? -0.9 * u : 0.9 * u; 
                const lz = (v - 0.5) * 1.5; 
                const ly = 0.05; 
                
                tempVec.set(lx, ly, lz);
                tempVec.applyMatrix4(panel.matrixWorld);
                
                p.x = tempVec.x;
                p.y = tempVec.y;
                p.z = tempVec.z;
                
                // Velocity
                const yaw = agentState.current.yaw; 
                const rightX = Math.cos(yaw);
                const rightZ = -Math.sin(yaw);
                const sideDir = isLeft ? -1 : 1;
                
                const push = 1.0 + Math.random();
                p.vx = rightX * sideDir * push;
                p.vz = rightZ * sideDir * push;
                p.vy = -1.0 - Math.random(); 
                
                p.scale = (0.15 + Math.random() * 0.25) * scale; 
            }
        }
    }
    
    // Update
    particles.forEach((p, i) => {
        if (p.life > 0) {
            p.life -= delta * 1.5; // Life decay
            p.x += p.vx * delta;
            p.y += p.vy * delta;
            p.z += p.vz * delta;
            
            p.vy -= 9.8 * delta; // Gravity
            
            dummy.position.set(p.x, p.y, p.z);
            const s = p.scale * p.life;
            dummy.scale.set(s, s, s);
            
            dummy.rotation.x += delta * 5;
            dummy.rotation.z += delta * 5;
            
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        } else {
             dummy.position.set(0, -1000, 0);
             dummy.updateMatrix();
             meshRef.current!.setMatrixAt(i, dummy.matrix);
        }
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <dodecahedronGeometry args={[0.15, 0]} />
      {/* Updated to match Scene PALETTE.ground #A67B66 */}
      <meshBasicMaterial color="#A67B66" transparent opacity={0.8} />
    </instancedMesh>
  );
};

// --- DAMAGE COMPONENT ---
// Renders permanent dents, scorch marks, and cracks on the solar panels
const PanelDamage = React.memo(({ damageCount, seedOffset = 0 }: { damageCount: number, seedOffset?: number }) => {
    // Generate deterministic damage spots based on seed
    const spots = useMemo(() => {
        const random = (seed: number) => {
            const x = Math.sin(seed * 9999) * 10000;
            return x - Math.floor(x);
        };
        
        return new Array(10).fill(0).map((_, i) => {
             const s = seedOffset + i * 543.21;
             return {
                x: (random(s) - 0.5) * 0.8,
                z: (random(s + 1) - 0.5) * 1.4,
                scale: 0.15 + random(s + 2) * 0.2,
                rotation: random(s + 3) * Math.PI * 2,
                variant: Math.floor(random(s + 4) * 3) // 0, 1, 2 for variety
            };
        });
    }, [seedOffset]);

    return (
        <group>
            {spots.map((spot, i) => {
                // Only show damage up to the current count
                if (i >= damageCount) return null;

                return (
                    <group key={i} position={[spot.x, 0.04, spot.z]} rotation={[0, spot.rotation, 0]}>
                         {/* Scorch Mark Background (Darkened area) */}
                         <mesh rotation={[-Math.PI/2, 0, 0]}>
                             <circleGeometry args={[spot.scale]} />
                             <meshBasicMaterial color="#080808" transparent opacity={0.85} polygonOffset polygonOffsetFactor={-1}/>
                         </mesh>
                         
                         {/* Impact Crater (Inner dark irregular shape) */}
                         <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.005, 0]}>
                             <ringGeometry args={[spot.scale * 0.2, spot.scale * 0.8, 7]} />
                             <meshStandardMaterial color="#000000" roughness={1} />
                         </mesh>

                         {/* Shattered Panel Cracks (Lines radiating or crossing) */}
                         <group position={[0, 0.01, 0]}>
                             <mesh rotation={[-Math.PI/2, 0, Math.random()]}>
                                  <planeGeometry args={[spot.scale * 2.2, 0.02]} />
                                  <meshBasicMaterial color="#666666" />
                             </mesh>
                             <mesh rotation={[-Math.PI/2, 0, Math.random() + 1.5]}>
                                  <planeGeometry args={[spot.scale * 1.8, 0.015]} />
                                  <meshBasicMaterial color="#666666" />
                             </mesh>
                             {spot.variant > 0 && (
                                <mesh rotation={[-Math.PI/2, 0, Math.random() + 0.5]}>
                                  <planeGeometry args={[spot.scale * 1.5, 0.01]} />
                                  <meshBasicMaterial color="#555555" />
                                </mesh>
                             )}
                         </group>
                    </group>
                );
            })}
        </group>
    );
});


const ScannerBeam = ({ agentState }: { agentState: React.MutableRefObject<any> }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    // Check state from ref directly to avoid stale props
    const active = agentState.current.isScanning;

    if (active) {
        groupRef.current.visible = true;
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 15) * 0.05;
        groupRef.current.scale.set(pulse, 1, pulse);
        
        groupRef.current.children[1].rotation.y -= delta * 2.0;
        groupRef.current.children[2].rotation.z = Math.sin(state.clock.elapsedTime * 10) * 0.5;
    } else {
        groupRef.current.visible = false;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, -2.5]} rotation={[Math.PI/2, 0, 0]} visible={false}>
       <mesh>
         <coneGeometry args={[1.5, 5.0, 32, 1, true]} />
         <meshBasicMaterial 
            color="#00AAFF" 
            transparent 
            opacity={0.15}
            side={THREE.DoubleSide} 
            blending={THREE.AdditiveBlending}
            depthWrite={false}
         />
       </mesh>
       <mesh>
         <coneGeometry args={[1.4, 5.0, 8, 4, true]} />
         <meshBasicMaterial 
            color="#00FFFF" 
            wireframe 
            transparent 
            opacity={0.25}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
         />
       </mesh>
       <mesh rotation={[0, 0, 0]}>
         <planeGeometry args={[2.0, 5.0]} />
         <meshBasicMaterial
            color="#FFFFFF"
            transparent
            opacity={0.1}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
         />
       </mesh>
       <mesh position={[0, 0, 0]}>
         <cylinderGeometry args={[0.02, 0.05, 5.0]} />
         <meshBasicMaterial
            color="#E0FFFF"
            transparent
            opacity={0.6}
            blending={THREE.AdditiveBlending}
         />
       </mesh>
    </group>
  );
}

// Volumetric Beam Mesh for headlights
const HeadlightBeam = React.forwardRef<THREE.Mesh>((props, ref) => {
    return (
        <mesh ref={ref} position={[0, -0.1, -15]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[2.5, 30, 32, 1, true]} />
            <meshBasicMaterial 
                color="#FFF5E0" 
                transparent 
                opacity={0} 
                blending={THREE.AdditiveBlending} 
                side={THREE.DoubleSide}
                depthWrite={false}
            />
        </mesh>
    );
});

interface RoverProps {
  stormActive: boolean;
  meteorPhase: 'IDLE' | 'INCOMING' | 'IMPACT';
  isDragging: boolean;
  onSandExposure?: (amount: number) => void;
}

export const Rover = forwardRef<RoverHandle, RoverProps>(({ stormActive, meteorPhase, isDragging, onSandExposure }, ref) => {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const mastRef = useRef<THREE.Group>(null);
  const leftPanelRef = useRef<THREE.Group>(null);
  const rightPanelRef = useRef<THREE.Group>(null);
  const wheelRefs = useRef<(THREE.Group | null)[]>([]);
  const steeringRefs = useRef<(THREE.Group | null)[]>([]);
  const rollingRefs = useRef<(THREE.Group | null)[]>([]); 
  
  // Lights
  const sensorLightRef = useRef<THREE.PointLight>(null);
  const leftHeadlightRef = useRef<THREE.SpotLight>(null);
  const rightHeadlightRef = useRef<THREE.SpotLight>(null);
  const leftBeamRef = useRef<THREE.Mesh>(null);
  const rightBeamRef = useRef<THREE.Mesh>(null);

  // Keyboard Control State
  const keysPressed = useRef({ w: false, a: false, s: false, d: false });
  const autoPilotRef = useRef(false); // Default OFF
  const isFPV = useRef(false); // First Person View State
  
  // Manual Panel Override (null = auto, true = retract, false = extend)
  const userPanelOverride = useRef<boolean | null>(null);

  // Frame counter for performance throttling
  const frameCount = useRef(0);

  // Prop Ref for event listeners
  const propsRef = useRef({ stormActive, meteorPhase });
  useEffect(() => {
    propsRef.current = { stormActive, meteorPhase };
  }, [stormActive, meteorPhase]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        if (key === 'w') keysPressed.current.w = true;
        if (key === 'a') keysPressed.current.a = true;
        if (key === 's') keysPressed.current.s = true;
        if (key === 'd') keysPressed.current.d = true;
        
        // Toggle AutoPilot
        if (key === 'q') {
            autoPilotRef.current = !autoPilotRef.current;
            // Reset manual override when switching modes to avoid confusion
            userPanelOverride.current = null; 
            console.log(`AutoPilot: ${autoPilotRef.current ? 'ON' : 'OFF'}`);
        }

        // Toggle Panels (Only in Manual Mode)
        if (key === 'p' && !autoPilotRef.current) {
             const currentState = userPanelOverride.current === true; // Treat null as false (Extended)
             userPanelOverride.current = !currentState;
             
             console.log(`Manual Panel: ${userPanelOverride.current ? 'RETRACTED' : 'EXTENDED'}`);
        }

        // Toggle FPV
        if (key === 'o') {
            isFPV.current = !isFPV.current;
            console.log(`Camera Mode: ${isFPV.current ? 'FIRST PERSON' : 'FOLLOW'}`);
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        if (key === 'w') keysPressed.current.w = false;
        if (key === 'a') keysPressed.current.a = false;
        if (key === 's') keysPressed.current.s = false;
        if (key === 'd') keysPressed.current.d = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Targets for SpotLights
  const leftLightTarget = useMemo(() => {
      const o = new THREE.Object3D();
      o.position.set(-0.35, -2, -10); // Point down and forward
      return o;
  }, []);
  const rightLightTarget = useMemo(() => {
      const o = new THREE.Object3D();
      o.position.set(0.35, -2, -10);
      return o;
  }, []);

  const scale = 3;
  
  // Visual Damage State
  const [damageCount, setDamageCount] = useState(0);

  // Mutable state
  const roverPos = useRef(new THREE.Vector3(0, 0, 13.5)); 
  const agentState = useRef({
    yaw: 0,           
    steerAngle: 0,    
    speed: 2.0,
    wheelRot: 0,      
    
    // Hiding logic
    currentCoverTarget: null as { x: number, z: number, id?: string, stopDist: number } | null,
    
    // Recovery Logic
    stuckTimer: 0,
    recoveryTimer: 0,

    // Scanning State
    scanTimer: 0,
    isScanning: false,

    // Impact Feedback State
    shakePos: new THREE.Vector3(),
    shakeRot: new THREE.Vector3(),
    knockbackVel: new THREE.Vector3(),
    isAirborne: false,

    // Animation State
    retractionT: 0, // 0 = Extended, 1 = Retracted
    
    // Dust State
    dustLevel: 0, 

    // Suspension Physics State
    wheelVelocities: [0, 0, 0, 0, 0, 0],

    // Safety State
    isUnderCover: false
  });

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getPosition: () => {
        return groupRef.current ? groupRef.current.position : new THREE.Vector3();
    },
    hit: (impactVelocity: THREE.Vector3) => {
        const { isUnderCover, retractionT } = agentState.current;
        const isSafe = isUnderCover && retractionT > 0.8;

        if (isSafe) {
             console.log("IMPACT DEFLECTED! Rover is safe under cover with panels retracted.");
             agentState.current.shakePos.addScalar(0.2); 
             return; 
        }

        agentState.current.knockbackVel.copy(impactVelocity);
        agentState.current.knockbackVel.y = 0; 
        
        agentState.current.shakePos.addScalar(0.5); 
        agentState.current.shakeRot.set(Math.random(), Math.random(), Math.random()).multiplyScalar(0.5);

        setDamageCount(prev => Math.min(prev + 1, 20));
        console.log("ROVER HIT! Damage Critical! Count:", damageCount + 1);
    }
  }));

  const [hovered, setHovered] = React.useState(false);
  const { camera, controls } = useThree();

  // Optimization: Cache obstacles so we don't rebuild every frame
  const lastChunkPos = useRef({ x: -999, z: -999 });
  const obstaclesCache = useRef<Obstacle[]>([]);

  // Base ground noise height
  const getBaseTerrainHeight = (wx: number, wz: number) => simpleNoise(wx, wz, 42) - 2.0;

  // Height including traverseable rocks
  const getSurfaceHeight = (wx: number, wz: number) => {
      let h = getBaseTerrainHeight(wx, wz);
      
      // Check for small rocks we can drive over
      if (obstaclesCache.current) {
          for (const obs of obstaclesCache.current) {
              if (obs.scale >= RUNNABLE_ROCK_SCALE) continue; 

              const dx = wx - obs.x;
              const dz = wz - obs.z;
              const distSq = dx*dx + dz*dz;
              const physRadius = obs.scale * 0.9; 
              
              if (distSq < physRadius * physRadius) {
                  const rockGroundH = getBaseTerrainHeight(obs.x, obs.z);
                  const rockCenterY = rockGroundH - (obs.scale * 0.4);
                  const sphereH = Math.sqrt(Math.max(0, physRadius * physRadius - distSq));
                  const surfaceY = rockCenterY + sphereH;
                  if (surfaceY > h) h = surfaceY;
              }
          }
      }
      return h;
  };

  const getObstaclesInChunk = (cx: number, cz: number): Obstacle[] => {
    const obstacles: Obstacle[] = [];
    const offsetX = cx * CHUNK_SIZE;
    const offsetZ = cz * CHUNK_SIZE;
    const seedBase = offsetX * 123.45 + offsetZ * 678.91;
    
    const pseudoRandom = (idx: number) => {
      const s = Math.sin(seedBase + idx) * 43758.5453;
      return s - Math.floor(s);
    };

    ROCK_LAYERS.forEach((layer) => {
      let i = 0;
      while (i < layer.count) {
        const r3 = pseudoRandom(i * 3 + 2);
        const s = layer.minScale + r3 * (layer.maxScale - layer.minScale);
        
        const r1 = pseudoRandom(i * 3 + 0);
        const r2 = pseudoRandom(i * 3 + 1);
        let wx = (r1 - 0.5) * CHUNK_SIZE + offsetX;
        let wz = (r2 - 0.5) * CHUNK_SIZE + offsetZ;

        if (s > 8.0) {
           const SAFE_ZONE = 25.0;
           if (Math.abs(wx) < SAFE_ZONE) {
               const pushDir = wx >= 0 ? 1 : -1;
               const offset = SAFE_ZONE + (r1 * 10);
               wx = pushDir * offset;
           }
        }
        
        obstacles.push({ 
             id: `${cx}:${cz}:${i}`,
             x: wx, 
             z: wz, 
             radius: s + 1.5,
             scale: s
        });
        i++;
      }
    });
    return obstacles;
  };

  const materials = useMemo(() => {
    const generateTexture = (baseColor: string, type: 'chassis' | 'panel' | 'wheel') => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return new THREE.CanvasTexture(canvas);

      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, size, size);

      const imgData = ctx.getImageData(0, 0, size, size);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const grain = (Math.random() - 0.5) * 15;
        data[i] = Math.max(0, Math.min(255, data[i] + grain));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain));
      }
      ctx.putImageData(imgData, 0, 0);
      ctx.lineCap = 'butt';

      if (type === 'wheel') {
         ctx.fillStyle = '#333333'; 
         const numTreads = 24;
         const treadH = size / numTreads;
         for (let i = 0; i < numTreads; i+=2) {
             ctx.fillRect(0, i * treadH, size, treadH);
         }
      } else if (type === 'chassis') {
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; 
        ctx.lineWidth = 2;
        const numLines = 12;
        for(let i=0; i<numLines; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const len = Math.random() * 150 + 50;
            const horizontal = Math.random() > 0.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            if (horizontal) ctx.lineTo(x + len, y);
            else ctx.lineTo(x, y + len);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        for(let i=0; i<6; i++) {
             const w = Math.random() * 120 + 20;
             const h = Math.random() * 120 + 20;
             ctx.fillRect(Math.random() * size, Math.random() * size, w, h);
        }
      } else { 
        ctx.strokeStyle = 'rgba(150, 200, 255, 0.3)'; 
        ctx.lineWidth = 2;
        const gridSize = 32; 
        for (let i = 0; i < size; i += gridSize) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, size);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(size, i);
            ctx.stroke();
        }
        for (let x = 0; x < size; x += gridSize) {
            for (let y = 0; y < size; y += gridSize) {
                if (Math.random() > 0.7) {
                     ctx.fillStyle = `rgba(50, 100, 255, ${Math.random() * 0.1})`;
                     ctx.fillRect(x + 1, y + 1, gridSize - 2, gridSize - 2);
                }
            }
        }
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    };

    const chassisTex = generateTexture('#C8A060', 'chassis'); 
    const panelTex = generateTexture('#002266', 'panel');
    const wheelTex = generateTexture('#333333', 'wheel'); 
    
    return {
      wheel: new THREE.MeshStandardMaterial({ 
        map: wheelTex,
        color: '#333333', 
        roughness: 0.9,
        metalness: 0.0
      }),
      chassis: new THREE.MeshStandardMaterial({ 
        map: chassisTex, 
        color: '#ffffff',
        roughness: 0.5, 
        metalness: 0.6 
      }),
      panel: new THREE.MeshStandardMaterial({ 
        map: panelTex, 
        color: '#ffffff',
        roughness: 0.1, 
        metalness: 0.6,
        emissive: new THREE.Color('#002266'),
        emissiveIntensity: 0
      }),
      darkGrey: new THREE.MeshStandardMaterial({ color: '#333333', roughness: 0.7 }),
      radarMetal: new THREE.MeshStandardMaterial({ color: '#333333', roughness: 0.2, metalness: 0.8 }), 
      white: new THREE.MeshStandardMaterial({ color: '#E0E0E0', roughness: 0.5 }),
      antenna: new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.5 }),
      lensBlack: new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.1, metalness: 0.9 }),
      lensBlue: new THREE.MeshStandardMaterial({ 
          color: '#000000', 
          emissive: '#0088ff',
          emissiveIntensity: 0.2,
          roughness: 0.2,
          metalness: 0.9
      }),
      suspensionMetal: new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.4, metalness: 0.7 }),
    };
  }, []);

  const panelMaterialArray = useMemo(() => [
        materials.darkGrey, 
        materials.darkGrey, 
        materials.panel,    
        materials.darkGrey, 
        materials.darkGrey, 
        materials.darkGrey  
  ], [materials]);
  

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const dt = Math.min(delta, 0.05);
    frameCount.current += 1; // Increment frame counter
    
    const isNight = false;

    // Headlight Logic
    if (leftHeadlightRef.current && rightHeadlightRef.current) {
        const targetIntensity = isNight ? 25.0 : 0.0;
        const targetBeamOpacity = isNight ? 0.08 : 0.0;
        
        leftHeadlightRef.current.intensity = THREE.MathUtils.lerp(leftHeadlightRef.current.intensity, targetIntensity, delta * 2.0);
        rightHeadlightRef.current.intensity = THREE.MathUtils.lerp(rightHeadlightRef.current.intensity, targetIntensity, delta * 2.0);
        
        if (leftBeamRef.current && rightBeamRef.current) {
            const matL = leftBeamRef.current.material as THREE.MeshBasicMaterial;
            const matR = rightBeamRef.current.material as THREE.MeshBasicMaterial;
            matL.opacity = THREE.MathUtils.lerp(matL.opacity, targetBeamOpacity, delta * 2.0);
            matR.opacity = THREE.MathUtils.lerp(matR.opacity, targetBeamOpacity, delta * 2.0);
        }
    }

    // --- DUST LOGIC ---
    if (stormActive) {
        agentState.current.dustLevel = Math.min(1.0, agentState.current.dustLevel + delta * 0.3);
    } else {
        if (agentState.current.retractionT < 0.5 && agentState.current.dustLevel > 0) {
            agentState.current.dustLevel = Math.max(0, agentState.current.dustLevel - delta * 0.4); 
        }
    }

    const dustLevel = agentState.current.dustLevel;
    // Updated to match Scene PALETTE.ground #A67B66
    const dustyColor = new THREE.Color('#A67B66'); 
    const baseColors = {
        chassis: new THREE.Color('#ffffff'),
        panel: new THREE.Color('#ffffff'),
        darkGrey: new THREE.Color('#333333'),
        radarMetal: new THREE.Color('#333333'),
        white: new THREE.Color('#E0E0E0'),
        lensBlack: new THREE.Color('#000000'),
        suspensionMetal: new THREE.Color('#888888')
    };

    const applyDust = (mat: THREE.MeshStandardMaterial, base: THREE.Color, isMetallic = false) => {
        mat.color.lerpColors(base, dustyColor, dustLevel * 0.9);
        mat.roughness = THREE.MathUtils.lerp(isMetallic ? 0.2 : 0.5, 1.0, dustLevel);
        if (isMetallic) {
            mat.metalness = THREE.MathUtils.lerp(0.8, 0.0, dustLevel); 
        }
    };

    // Optimization: Only update material colors occasionally or if dust level changing rapidly?
    // Doing it every frame is fine for now as it's just color lerps, but could be throttled if needed.
    applyDust(materials.chassis, baseColors.chassis);
    applyDust(materials.panel, baseColors.panel);
    applyDust(materials.darkGrey, baseColors.darkGrey);
    applyDust(materials.radarMetal, baseColors.radarMetal, true);
    applyDust(materials.white, baseColors.white);
    applyDust(materials.lensBlack, baseColors.lensBlack, true);
    applyDust(materials.suspensionMetal, baseColors.suspensionMetal, true);
    
    if (hovered && agentState.current.dustLevel < 0.3) {
        const t = (Math.sin(state.clock.elapsedTime * 5) + 1) * 0.5;
        materials.panel.emissiveIntensity = 0.2 + t * 0.3;
    } else {
        materials.panel.emissiveIntensity = THREE.MathUtils.lerp(materials.panel.emissiveIntensity, 0, delta * 5);
    }

    // --- IMPACT & SHAKE FEEDBACK ---
    if (stormActive) {
      const vibrationScale = 0.02; 
      agentState.current.shakePos.add(new THREE.Vector3(
        (Math.random() - 0.5) * vibrationScale,
        (Math.random() - 0.5) * vibrationScale, 
        (Math.random() - 0.5) * vibrationScale
      ));
      
      agentState.current.shakeRot.x += (Math.random() - 0.5) * 0.005;
      agentState.current.shakeRot.z += (Math.random() - 0.5) * 0.005;
    }
    agentState.current.shakePos.multiplyScalar(0.85);
    agentState.current.shakeRot.multiplyScalar(0.85);

    agentState.current.knockbackVel.x *= 0.85;
    agentState.current.knockbackVel.z *= 0.85;
    agentState.current.knockbackVel.y = 0;

    // --- ANIMATIONS (Retraction) ---
    const autoRetract = stormActive || meteorPhase === 'IMPACT';
    let shouldRetract = false;
    
    if (autoPilotRef.current) {
        shouldRetract = autoRetract;
        userPanelOverride.current = null; // Sync
    } else {
        if (userPanelOverride.current !== null) {
            shouldRetract = userPanelOverride.current;
        } else {
            shouldRetract = false; // Default Open in manual
        }
    }

    if (stormActive && agentState.current.retractionT < 0.5) {
         if (onSandExposure) {
             onSandExposure(delta * 0.3); 
         }
    }
    
    const animSpeed = delta * 0.6; 
    if (shouldRetract) {
        agentState.current.retractionT = Math.min(1, agentState.current.retractionT + animSpeed);
    } else {
        agentState.current.retractionT = Math.max(0, agentState.current.retractionT - animSpeed);
    }
    const rt = agentState.current.retractionT;
    const retractionEase = 1 - Math.pow(1 - rt, 4); 

    // Animate Mast
    if (mastRef.current) {
        const targetMastRot = shouldRetract ? -1.5 : 0; 
        const targetMastY = shouldRetract ? 0.15 : 0.4;  
        const targetMastZ = shouldRetract ? 0.0 : -0.45;
        
        mastRef.current.rotation.x = THREE.MathUtils.lerp(mastRef.current.rotation.x, targetMastRot, delta * 2.0);
        mastRef.current.position.y = THREE.MathUtils.lerp(mastRef.current.position.y, targetMastY, delta * 2.0);
        mastRef.current.position.z = THREE.MathUtils.lerp(mastRef.current.position.z, targetMastZ, delta * 2.0);
    }
    
    // Animate Panels
    if (leftPanelRef.current && rightPanelRef.current) {
        leftPanelRef.current.rotation.z = -2.15 * retractionEase; 
        rightPanelRef.current.rotation.z = 2.15 * retractionEase; 

        const foldedPercent = Math.abs(leftPanelRef.current.rotation.z) / 2.15;
        let targetY = 0.32; 
        
        if (shouldRetract) {
             if (foldedPercent > 0.85) targetY = 0.08; 
        } else {
             targetY = 0.32;
        }

        leftPanelRef.current.position.y = THREE.MathUtils.lerp(leftPanelRef.current.position.y, targetY, delta * 2.0);
        rightPanelRef.current.position.y = THREE.MathUtils.lerp(rightPanelRef.current.position.y, targetY, delta * 2.0);
    }

    const { speed } = agentState.current;
    
    // --- OBSTACLE & PATHFINDING LOGIC ---
    const cx = Math.round(roverPos.current.x / CHUNK_SIZE);
    const cz = Math.round(roverPos.current.z / CHUNK_SIZE);
    
    if (cx !== lastChunkPos.current.x || cz !== lastChunkPos.current.z) {
         obstaclesCache.current = [];
         for(let xx = -1; xx <= 1; xx++) {
            for(let zz = -1; zz <= 1; zz++) {
                obstaclesCache.current.push(...getObstaclesInChunk(cx + xx, cz + zz));
            }
         }
         lastChunkPos.current = { x: cx, z: cz };
    }
    const nearbyObstacles = obstaclesCache.current;

    let targetSteer = 0;
    
    let desiredHeading = 0;
    let headingWeight = 3.0; 
    let targetSpeed = 2.0;
    let stopping = false;
    let performRaycastAvoidance = false;
    
    if (meteorPhase === 'IDLE') {
        agentState.current.currentCoverTarget = null;
    }

    // --- KEYBOARD CONTROL CHECK (HIGHEST PRIORITY) ---
    const input = keysPressed.current;
    const isManualInput = input.w || input.a || input.s || input.d;

    const isSystemsOffline = agentState.current.retractionT > 0.05;

    if (isManualInput) {
         if (isSystemsOffline) {
             targetSpeed = 0.0;
             targetSteer = 0.0;
             performRaycastAvoidance = false;
         } else {
             let throttle = 0;
             if (input.w) throttle += 1;
             if (input.s) throttle -= 1;
             
             let steer = 0;
             if (input.a) steer += 1; 
             if (input.d) steer -= 1; 

             targetSpeed = throttle * 5.0; 
             targetSteer = steer * 0.8; 
             performRaycastAvoidance = false;
         }
    } 
    else {
        // --- AUTONOMOUS & EVENT LOGIC ---
        if (meteorPhase === 'IMPACT') {
            targetSpeed = 0.0;
            stopping = true;
        } 
        else if (stormActive || isSystemsOffline) {
            targetSpeed = 0.0;
            stopping = true;
        }
        else if (meteorPhase === 'INCOMING') {
            targetSpeed = 10.0; 
            headingWeight = 40.0; 
            performRaycastAvoidance = true;

            let target = agentState.current.currentCoverTarget;
            if (!target) {
                let bestDist = Infinity;
                for(const obs of nearbyObstacles) {
                    if (obs.scale < 8.0) continue; 
                    const dx = obs.x - roverPos.current.x;
                    const dz = obs.z - roverPos.current.z;
                    const dSq = dx*dx + dz*dz;
                    if (dSq < bestDist) {
                        bestDist = dSq;
                        const rockRadius = obs.scale * 1.5;
                        target = { x: obs.x, z: obs.z, id: obs.id, stopDist: rockRadius + 1.5 };
                    }
                }
                if (bestDist > 900) {
                    const scanR = 50; 
                    const scanStep = 10;
                    const snapX = Math.floor(roverPos.current.x / scanStep) * scanStep;
                    const snapZ = Math.floor(roverPos.current.z / scanStep) * scanStep;
                    for (let sx = -scanR; sx <= scanR; sx += scanStep) {
                        for (let sz = -scanR; sz <= scanR; sz += scanStep) {
                            const wx = snapX + sx;
                            const wz = snapZ + sz;
                            const h = getBaseTerrainHeight(wx, wz);
                            if (h < -3.0) {
                                const dx = wx - roverPos.current.x;
                                const dz = wz - roverPos.current.z;
                                const dSq = dx*dx + dz*dz;
                                if (dSq < bestDist) {
                                    bestDist = dSq;
                                    target = { x: wx, z: wz, stopDist: 5.0 };
                                }
                            }
                        }
                    }
                }
                if (target) agentState.current.currentCoverTarget = target;
            }

            if (target) {
                const dx = target.x - roverPos.current.x;
                const dz = target.z - roverPos.current.z;
                const dist = Math.sqrt(dx*dx + dz*dz);
                
                if (dist < target.stopDist) {
                    stopping = true;
                    targetSpeed = 0;
                    agentState.current.speed = 0;
                } else {
                    const worldAngle = Math.atan2(-dx, -dz);
                    let diff = worldAngle - agentState.current.yaw;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    desiredHeading = diff;
                }
            } else {
                desiredHeading = 0; 
                targetSpeed = 10.0;
            }
        } else {
            // AUTONOMOUS WANDER OR IDLE
            if (autoPilotRef.current) {
                headingWeight = 3.0; 
                targetSpeed = 2.0;
                performRaycastAvoidance = true;
            } else {
                targetSpeed = 0.0;
                stopping = true;
                performRaycastAvoidance = false;
            }
        }
    }

    // 2. RAYCAST STEERING (THROTTLED)
    if (performRaycastAvoidance && frameCount.current % 3 === 0) {
        const RAY_COUNT = 35; 
        const FOV = Math.PI * 1.3; 
        
        const baseLookAhead = 12.0;
        const dynamicLookAhead = baseLookAhead + (Math.abs(agentState.current.speed) * 3.0);
        const SAMPLES = 10; 
        
        let bestCost = Infinity;
        let bestSteerOffset = 0;
        let allBlocked = true;
        
        const currentTarget = agentState.current.currentCoverTarget;

        for (let i = 0; i < RAY_COUNT; i++) {
            const t = i / (RAY_COUNT - 1);
            const angleOffset = THREE.MathUtils.lerp(-FOV/2, FOV/2, t);
            
            let cost = 0;
            cost += Math.abs(angleOffset - desiredHeading) * headingWeight;
            cost += Math.abs(angleOffset - agentState.current.steerAngle) * 0.5;
            cost += Math.abs(angleOffset) * 0.2; 

            const rayYaw = agentState.current.yaw + angleOffset;
            const dirX = -Math.sin(rayYaw);
            const dirZ = -Math.cos(rayYaw);
            
            let prevH = roverPos.current.y;
            let penalty = 0;

            for(let s = 1; s <= SAMPLES; s++) {
                const dist = (s / SAMPLES) * dynamicLookAhead;
                const px = roverPos.current.x + dirX * dist;
                const pz = roverPos.current.z + dirZ * dist;

                for(const obs of nearbyObstacles) {
                    if (currentTarget && obs.id === currentTarget.id) continue;
                    
                    if (obs.scale < RUNNABLE_ROCK_SCALE) continue;
                    
                    const dx = px - obs.x;
                    const dz = pz - obs.z;
                    const distSq = dx*dx + dz*dz;
                    const safeR = obs.radius * 1.2; 
                    
                    if (distSq < safeR*safeR) {
                        const d = Math.sqrt(distSq);
                        const proximity = safeR - d;
                        
                        const angleWeight = 1.0 + Math.max(0, Math.cos(angleOffset) * 1.5);
                        penalty += Math.pow(proximity, 2) * 8000.0 * angleWeight; 
                    }
                }

                const h = getBaseTerrainHeight(px, pz);
                const slope = (h - prevH) / (dynamicLookAhead/SAMPLES);
                prevH = h;
                
                if (Math.abs(slope) > 0.65) {
                    penalty += Math.abs(slope) * 1000.0;
                }
            }

            cost += penalty;

            if (penalty < 100) {
                allBlocked = false;
            }

            if (cost < bestCost) {
                bestCost = cost;
                bestSteerOffset = angleOffset;
            }
        }

        const velocity = agentState.current.speed;
        const isMoving = Math.abs(velocity) > 0.1;
        const wantsToMove = Math.abs(targetSpeed) > 0.1;

        if (wantsToMove && (allBlocked || (!isMoving && agentState.current.recoveryTimer <= 0))) {
            agentState.current.stuckTimer += delta * 3; // Account for frame skip
        } else {
            agentState.current.stuckTimer = Math.max(0, agentState.current.stuckTimer - delta * 3);
        }

        if (agentState.current.stuckTimer > 1.0 && agentState.current.recoveryTimer <= 0) {
            agentState.current.recoveryTimer = 2.0; 
            agentState.current.steerAngle = Math.random() > 0.5 ? -1.0 : 1.0;
        }

        if (agentState.current.recoveryTimer > 0) {
            agentState.current.recoveryTimer -= delta * 3;
            targetSpeed = -2.0; 
            targetSteer = agentState.current.steerAngle; 
            agentState.current.stuckTimer = 0;
        } else {
            targetSteer = THREE.MathUtils.clamp(bestSteerOffset, -0.8, 0.8);
        }

        if (!stopping && agentState.current.recoveryTimer <= 0) {
            const turnBrake = Math.max(0.3, 1.0 - Math.abs(targetSteer) * 1.0);
            targetSpeed *= turnBrake;

            if (bestCost > 2000) targetSpeed *= 0.3; 
            else if (bestCost > 500) targetSpeed *= 0.6; 
        }
    }
    
    agentState.current.steerAngle = THREE.MathUtils.lerp(agentState.current.steerAngle, targetSteer, delta * 10.0);
    
    if (stopping) {
        agentState.current.speed = THREE.MathUtils.lerp(agentState.current.speed, 0, delta * 2.0);
    } else {
        agentState.current.speed = THREE.MathUtils.lerp(agentState.current.speed, targetSpeed, delta * (keysPressed.current.w || keysPressed.current.s ? 3.0 : 2.0));
    }

    if (Math.abs(agentState.current.steerAngle) > 0.01) {
        agentState.current.yaw += agentState.current.steerAngle * agentState.current.speed * delta * 0.6;
    }
    
    if (!stormActive && meteorPhase === 'IDLE') {
        agentState.current.scanTimer += delta;
        if (agentState.current.scanTimer > 5.0) {
            agentState.current.isScanning = true;
            if (agentState.current.scanTimer > 7.0) {
                agentState.current.scanTimer = 0;
                agentState.current.isScanning = false;
            }
        }
    } else {
        agentState.current.isScanning = false;
    }

    if (headRef.current) {
        let targetLookY = 0;
        let targetLookX = 0;

        // Allow head movement even in storms/meteor phase to make it feel alive
        // Only override if scanning logic demands it
        if (agentState.current.isScanning) {
            const scanProgress = (agentState.current.scanTimer - 5.0) / 2.0;
            targetLookY = Math.sin(scanProgress * Math.PI * 2) * 1.6; 
            targetLookX = 0.3; 
        } else {
            const t = state.clock.elapsedTime;
            // Add subtle random "looking around" jitter if idle, or look into turn
            const panorama = Math.sin(t * 0.2) * Math.PI * 0.5; // Reduced range
            const interest = agentState.current.steerAngle * 2.5; // Look where we steer
            targetLookY = interest + (panorama * 0.2); // Mostly steer, some panorama
            targetLookX = (Math.sin(t * 0.5) * 0.2) + (Math.cos(t * 1.5) * 0.1);
            
            // Look down if moving fast?
            if (agentState.current.speed > 5.0) targetLookX = -0.2;
        }

        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, targetLookY, delta * 3.0);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, targetLookX, delta * 3.0);
    }
    
    if (agentState.current.isScanning) {
        const t = state.clock.elapsedTime * 15;
        const pulse = (Math.sin(t) + 1) * 0.5; 
        materials.lensBlue.emissiveIntensity = 0.5 + pulse * 2.0;
        const targetHue = THREE.MathUtils.lerp(0.6, 0.35, pulse); 
        materials.lensBlue.emissive.setHSL(targetHue, 1.0, 0.5);

        if (sensorLightRef.current) {
             sensorLightRef.current.intensity = THREE.MathUtils.lerp(sensorLightRef.current.intensity, 1.5 + pulse * 0.5, delta * 10);
        }
    } else {
        materials.lensBlue.emissiveIntensity = THREE.MathUtils.lerp(materials.lensBlue.emissiveIntensity, 0.1, delta * 2);
        materials.lensBlue.emissive.lerp(new THREE.Color('#0055ff'), delta * 2);

        if (sensorLightRef.current) {
             sensorLightRef.current.intensity = THREE.MathUtils.lerp(sensorLightRef.current.intensity, 0.2, delta * 5);
        }
    }

    agentState.current.wheelRot -= (agentState.current.speed * delta) / 0.18; 

    // --- POSITION UPDATE ---
    const oldPos = roverPos.current.clone();
    
    let nextX = roverPos.current.x - Math.sin(agentState.current.yaw) * agentState.current.speed * delta;
    let nextZ = roverPos.current.z - Math.cos(agentState.current.yaw) * agentState.current.speed * delta;
    
    nextX += agentState.current.knockbackVel.x * delta;
    nextZ += agentState.current.knockbackVel.z * delta;

    const roverRadius = 0.8; 
    let hitSomething = false;
    
    let underCover = false;

    for (const obs of nearbyObstacles) {
        const dx = nextX - obs.x;
        const dz = nextZ - obs.z;
        const distSq = dx*dx + dz*dz;

        if (obs.scale > 8.0) {
             const coverRadiusSq = (obs.scale * 1.1) * (obs.scale * 1.1);
             if (distSq < coverRadiusSq) {
                 underCover = true;
             }
        }
        
        if (obs.scale < RUNNABLE_ROCK_SCALE) continue;

        const minDist = obs.scale * 0.85 + roverRadius; 
        
        if (distSq < minDist * minDist) {
            const dist = Math.sqrt(distSq);
            if (dist > 0.001) {
                const nx = dx / dist; 
                const nz = dz / dist;
                
                nextX = obs.x + nx * minDist; 
                nextZ = obs.z + nz * minDist;
                
                hitSomething = true;
            }
        }
    }
    
    agentState.current.isUnderCover = underCover;

    if (hitSomething) {
        agentState.current.speed *= 0.95;
    }

    roverPos.current.x = nextX;
    roverPos.current.z = nextZ;

    const x = roverPos.current.x;
    const z = roverPos.current.z;
    
    const h = getSurfaceHeight(x, z);
    
    const epsilon = 1.2; 
    const hL = getSurfaceHeight(x - epsilon, z);
    const hR = getSurfaceHeight(x + epsilon, z);
    const hD = getSurfaceHeight(x, z - epsilon);
    const hU = getSurfaceHeight(x, z + epsilon);
    const slopeX = (hR - hL) / (2 * epsilon);
    const slopeZ = (hU - hD) / (2 * epsilon);
    const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const qTerrain = new THREE.Quaternion().setFromUnitVectors(up, normal);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(up, agentState.current.yaw);
    
    const targetQuat = qTerrain.multiply(qYaw);
    
    const targetY = h + 0.55;

    roverPos.current.y = THREE.MathUtils.lerp(roverPos.current.y, targetY, 0.2); 
    groupRef.current.quaternion.slerp(targetQuat, 0.1); 
    
    groupRef.current.position.copy(roverPos.current);

    groupRef.current.position.add(agentState.current.shakePos);
    groupRef.current.rotation.x += agentState.current.shakeRot.x;
    groupRef.current.rotation.y += agentState.current.shakeRot.y;
    groupRef.current.rotation.z += agentState.current.shakeRot.z;

    // FORCE MATRIX UPDATE for Camera FPV Sync
    // This ensures that when we read headRef's world transform later, it includes
    // all the animations and vibrations we just applied.
    groupRef.current.updateMatrixWorld(true);

    const invMatrix = new THREE.Matrix4().copy(groupRef.current.matrixWorld).invert();
    
    WHEEL_POSITIONS.forEach((pos, i) => {
      const suspensionGroup = wheelRefs.current[i];
      const steeringGroup = steeringRefs.current[i];
      const rollingGroup = rollingRefs.current[i];

      if (!suspensionGroup || !steeringGroup || !rollingGroup) return;

      const localHardpoint = new THREE.Vector3(pos[0], pos[1] - 0.3, pos[2]);
      const worldHardpoint = localHardpoint.clone().applyMatrix4(groupRef.current!.matrixWorld);
      
      const terrainH = getSurfaceHeight(worldHardpoint.x, worldHardpoint.z);
      
      const desiredWorldY = terrainH;
      const desiredWorldPoint = new THREE.Vector3(worldHardpoint.x, desiredWorldY, worldHardpoint.z);
      const desiredLocalPoint = desiredWorldPoint.applyMatrix4(invMatrix);
      
      const targetLocalY = desiredLocalPoint.y + 0.18;
      const neutralY = pos[1] - 0.3;
      
      const maxTravel = 0.4;
      const stiffness = 120.0;
      const damping = 20.0; // Increased to reduce bounciness
      
      const currentY = suspensionGroup.position.y;
      const velocity = agentState.current.wheelVelocities[i] || 0;
      
      const finalTargetY = targetLocalY;
      
      const clampedTargetY = THREE.MathUtils.clamp(finalTargetY, neutralY - maxTravel, neutralY + maxTravel);
      const displacement = currentY - clampedTargetY;
      const acceleration = -stiffness * displacement - damping * velocity;
      
      let newVelocity = velocity + acceleration * dt;
      let newY = currentY + newVelocity * dt;
      
      if (newY < neutralY - maxTravel) {
          newY = neutralY - maxTravel;
          newVelocity = 0;
      } else if (newY > neutralY + maxTravel) {
          newY = neutralY + maxTravel;
          newVelocity = 0;
      }
      
      agentState.current.wheelVelocities[i] = newVelocity;
      suspensionGroup.position.y = newY;

      const baseX = pos[0];
      const retractedX = baseX * 0.35; 
      suspensionGroup.position.x = THREE.MathUtils.lerp(baseX, retractedX, retractionEase);

      const baseSteer = agentState.current.steerAngle;
      let finalWheelSteer = 0;
      
      const isLeftTurn = baseSteer > 0;
      const isLeftWheel = (i % 2 === 0); 
      const isInner = (isLeftTurn && isLeftWheel) || (!isLeftTurn && !isLeftWheel);
      const multiplier = isInner ? 1.3 : 0.8;

      if (i === 0 || i === 1) { 
          finalWheelSteer = baseSteer * multiplier;
      }
      else if (i === 4 || i === 5) { 
          finalWheelSteer = -baseSteer * multiplier;
      } 

      steeringGroup.rotation.y = finalWheelSteer;
      rollingGroup.rotation.x = agentState.current.wheelRot;
    });

    // --- CAMERA LOGIC ---
    if (isFPV.current) {
        // --- FIRST PERSON VIEW (FPV) ---
        // Lock controls to prevent fighting
        if (controls) {
            // @ts-ignore
            controls.enabled = false;
        }

        if (mastRef.current) {
            // STABLE FPV: Attach to Mast (Neck) instead of animated Head
            // This filters out the "scanning" and "looking around" animations of the head.
            
            const mastWorldPos = new THREE.Vector3();
            const mastWorldQuat = new THREE.Quaternion();
            
            // Use Mast world transform (includes chassis movement + mast retraction)
            mastRef.current.getWorldPosition(mastWorldPos);
            mastRef.current.getWorldQuaternion(mastWorldQuat);
            
            // Offset to match the physical height of the head relative to the mast base.
            // Head is approx 0.7 units above mast origin.
            const headHeightOffset = new THREE.Vector3(0, 0.75, 0);
            headHeightOffset.applyQuaternion(mastWorldQuat);
            
            // Forward offset to clear geometry (local Z- is forward)
            const lensOffset = new THREE.Vector3(0, 0, -0.3);
            lensOffset.applyQuaternion(mastWorldQuat);
            
            const camPos = mastWorldPos.clone().add(headHeightOffset).add(lensOffset);

            // Stable Vibration (Engine/Movement rumble)
            const speed = Math.abs(agentState.current.speed);
            if (speed > 0.1) {
                 // Reduced rumble intensity significantly (0.005 -> 0.001) for a smoother ride
                 const rumble = 0.001 * Math.min(1.0, speed / 10.0);
                 camPos.x += (Math.random() - 0.5) * rumble;
                 camPos.y += (Math.random() - 0.5) * rumble;
                 camPos.z += (Math.random() - 0.5) * rumble;
            }

            // Smoothly interpolate to new position/rotation
            // Lower lerp factor (0.6 -> 0.5) slightly to filter high-frequency jitter while keeping responsiveness
            camera.position.lerp(camPos, 0.5);
            camera.quaternion.slerp(mastWorldQuat, 0.5);
        }

    } else {
        // --- THIRD PERSON / ORBIT VIEW ---
        if (controls) {
            // @ts-ignore
            controls.enabled = true;
        }

        const movementDelta = new THREE.Vector3().subVectors(roverPos.current, oldPos);

        if (isDragging) {
            camera.position.add(movementDelta);
        } else {
            const yaw = agentState.current.yaw;
            const followDist = 18.0;
            const followHeight = 6.0;
            
            const targetX = roverPos.current.x + Math.sin(yaw) * followDist;
            const targetZ = roverPos.current.z + Math.cos(yaw) * followDist;
            const targetY = roverPos.current.y + followHeight;
            
            const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
            
            camera.position.lerp(targetPos, dt * 2.5);
        }
        
        if (controls) {
            // @ts-ignore
            controls.target.copy(roverPos.current);
            // @ts-ignore
            controls.update();
        }
    }
  });

  return (
    <group ref={groupRef} scale={[scale, scale, scale]}> 
      <PanelDustSlide 
        leftPanel={leftPanelRef} 
        rightPanel={rightPanelRef} 
        stormActive={stormActive} 
        agentState={agentState} 
        scale={scale} 
      />

      <mesh castShadow receiveShadow position={[0, 0.3, 0]} material={materials.chassis}>
        <boxGeometry args={[0.8, 0.25, 1.1]} />
      </mesh>
      
      <group position={[0, 0.15, 0]}>
         <mesh position={[-0.25, 0, 0]} castShadow material={materials.darkGrey}>
             <boxGeometry args={[0.1, 0.1, 1.3]} />
         </mesh>
         <mesh position={[0.25, 0, 0]} castShadow material={materials.darkGrey}>
             <boxGeometry args={[0.1, 0.1, 1.3]} />
         </mesh>
      </group>

      <group position={[0, 0.3, 0]}>
         <mesh position={[-0.35, 0.05, 0]} material={materials.darkGrey}>
             <boxGeometry args={[0.1, 0.08, 0.8]} />
         </mesh>
         <mesh position={[0.35, 0.05, 0]} material={materials.darkGrey}>
             <boxGeometry args={[0.1, 0.08, 0.8]} />
         </mesh>
      </group>

      <group ref={leftPanelRef} position={[-0.42, 0.32, 0]} rotation={[0, 0, 0]}>
        <mesh 
          castShadow 
          receiveShadow 
          position={[-0.45, 0, 0]} 
          material={panelMaterialArray}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
            <boxGeometry args={[0.9, 0.05, 1.55]} />
        </mesh>
        <mesh position={[-0.85, 0, 0]} material={materials.white}>
            <boxGeometry args={[0.1, 0.06, 1.4]} />
        </mesh>
        <group position={[-0.45, 0.03, 0]}>
             <PanelDamage damageCount={Math.ceil(damageCount / 2)} seedOffset={100} />
        </group>
      </group>

      <group ref={rightPanelRef} position={[0.42, 0.32, 0]} rotation={[0, 0, 0]}>
         <mesh 
           castShadow 
           receiveShadow 
           position={[0.45, 0, 0]} 
           material={panelMaterialArray}
           onPointerOver={() => setHovered(true)}
           onPointerOut={() => setHovered(false)}
         >
            <boxGeometry args={[0.9, 0.05, 1.55]} />
        </mesh>
        <mesh position={[0.85, 0, 0]} material={materials.white}>
            <boxGeometry args={[0.1, 0.06, 1.4]} />
        </mesh>
        <group position={[0.45, 0.03, 0]}>
             <PanelDamage damageCount={Math.floor(damageCount / 2)} seedOffset={200} />
        </group>
      </group>

      <mesh 
        position={[0, 0.32, 0.6]} 
        castShadow 
        receiveShadow 
        material={panelMaterialArray}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[0.7, 0.05, 0.4]} />
      </mesh>

      <group ref={mastRef} position={[0, 0.4, -0.45]}>
        <mesh castShadow position={[0, 0.35, 0]} material={materials.darkGrey}>
          <cylinderGeometry args={[0.03, 0.04, 0.7]} />
        </mesh>
        
        <group position={[0, 0.7, 0]} rotation={[0, 0, 0]}> 
            <mesh rotation={[0, 0, Math.PI/2]} material={materials.darkGrey}>
               <cylinderGeometry args={[0.04, 0.04, 0.12]} />
            </mesh>
            
            <group ref={headRef} position={[0, 0.05, 0]}>
                 <ScannerBeam agentState={agentState} />
                 
                 <pointLight 
                    ref={sensorLightRef}
                    position={[0, 0, -0.2]} 
                    color="#00FFFF" 
                    distance={3} 
                    decay={2}
                    intensity={0} 
                 />

                 <group position={[0, 0, 0]}>
                     <group position={[-0.1, 0, 0]}>
                        <mesh rotation={[Math.PI/2, 0, 0]} castShadow material={materials.radarMetal}>
                             <cylinderGeometry args={[0.075, 0.06, 0.22, 16]} />
                        </mesh>
                        <mesh position={[0, 0, -0.115]} rotation={[Math.PI/2, 0, 0]} material={materials.lensBlack}>
                            <cylinderGeometry args={[0.065, 0.065, 0.01, 16]} />
                        </mesh>
                         <mesh position={[0, 0, -0.121]} rotation={[Math.PI/2, 0, 0]} material={materials.lensBlue}>
                            <circleGeometry args={[0.03, 16]} />
                        </mesh>
                     </group>

                     <group position={[0.1, 0, 0]}>
                        <mesh rotation={[Math.PI/2, 0, 0]} castShadow material={materials.radarMetal}>
                             <cylinderGeometry args={[0.075, 0.06, 0.22, 16]} />
                        </mesh>
                        <mesh position={[0, 0, -0.115]} rotation={[Math.PI/2, 0, 0]} material={materials.lensBlack}>
                            <cylinderGeometry args={[0.065, 0.065, 0.01, 16]} />
                        </mesh>
                         <mesh position={[0, 0, -0.121]} rotation={[Math.PI/2, 0, 0]} material={materials.lensBlue}>
                            <circleGeometry args={[0.03, 16]} />
                        </mesh>
                     </group>
                 </group>
            </group>
        </group>
      </group>

      <group>
          <primitive object={leftLightTarget} />
          <primitive object={rightLightTarget} />

          <group position={[-0.35, 0.3, -0.55]}>
              <mesh rotation={[Math.PI/2, 0, 0]}>
                  <cylinderGeometry args={[0.04, 0.04, 0.05, 16]} />
                  <meshStandardMaterial color="#333" />
              </mesh>
              <mesh position={[0, 0, -0.03]} rotation={[Math.PI/2, 0, 0]}>
                  <circleGeometry args={[0.03, 16]} />
                  <meshBasicMaterial color="#ffffee" />
              </mesh>
              <spotLight 
                  ref={leftHeadlightRef}
                  target={leftLightTarget}
                  color="#FFF5E0"
                  angle={0.6}
                  penumbra={0.2}
                  distance={40}
                  intensity={0} 
                  castShadow
                  shadow-mapSize={[512, 512]}
              />
              <HeadlightBeam ref={leftBeamRef} />
          </group>

          <group position={[0.35, 0.3, -0.55]}>
              <mesh rotation={[Math.PI/2, 0, 0]}>
                  <cylinderGeometry args={[0.04, 0.04, 0.05, 16]} />
                  <meshStandardMaterial color="#333" />
              </mesh>
               <mesh position={[0, 0, -0.03]} rotation={[Math.PI/2, 0, 0]}>
                  <circleGeometry args={[0.03, 16]} />
                  <meshBasicMaterial color="#ffffee" />
              </mesh>
              <spotLight 
                  ref={rightHeadlightRef}
                  target={rightLightTarget}
                  color="#FFF5E0"
                  angle={0.6}
                  penumbra={0.2}
                  distance={40}
                  intensity={0} 
                  castShadow
                  shadow-mapSize={[512, 512]}
              />
              <HeadlightBeam ref={rightBeamRef} />
          </group>
      </group>

      {WHEEL_POSITIONS.map((pos, i) => {
        const isRight = pos[0] > 0;
        const strutX = isRight ? -0.24 : 0.24; 
        
        return (
        <group 
          key={i} 
          ref={(el) => { wheelRefs.current[i] = el; }} 
          position={[pos[0], pos[1] - 0.3, pos[2]]}
        >
             {/* Suspension Strut (Vertical) - Moved inward to avoid clipping steering */}
             <mesh 
                position={[strutX, 0.3, 0]} 
                rotation={[0, 0, isRight ? 0.1 : -0.1]} 
                material={materials.darkGrey}
             >
                <cylinderGeometry args={[0.03, 0.04, 0.6]} />
             </mesh>
             
             {/* Shock Absorber / Spring Housing */}
             <mesh 
                position={[strutX, 0.3, 0]} 
                rotation={[0, 0, isRight ? 0.1 : -0.1]} 
                material={materials.suspensionMetal}
             >
                <cylinderGeometry args={[0.045, 0.045, 0.25]} />
             </mesh>

             {/* Axle / Control Arm (Horizontal) - Connects strut to wheel hub */}
             <mesh position={[strutX / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.025, 0.025, Math.abs(strutX)]} />
                <meshStandardMaterial color="#333333" />
             </mesh>

             <group ref={(el) => { steeringRefs.current[i] = el; }}>
                <group ref={(el) => { rollingRefs.current[i] = el; }} rotation={[0, 0, Math.PI / 2]}> 
                    <mesh castShadow receiveShadow material={materials.wheel}>
                        <cylinderGeometry args={[0.18, 0.18, 0.15, 16]} />
                    </mesh>
                    <mesh>
                        <cylinderGeometry args={[0.1, 0.1, 0.16, 8]} />
                        <meshStandardMaterial color="#333333" />
                    </mesh>
                </group>
             </group>
        </group>
      )})}

      <group position={[0.2, 0.5, 0.3]} rotation={[0.2, 0.2, 0]}>
         <mesh castShadow material={materials.white}>
            <cylinderGeometry args={[0.01, 0.01, 0.4]} />
         </mesh>
         <mesh position={[0, 0.2, 0]} rotation={[0.5, 0, 0]}>
             <cylinderGeometry args={[0.15, 0.02, 0.05, 8, 1, true]} />
             <meshStandardMaterial color="#ddd" side={THREE.DoubleSide} />
         </mesh>
      </group>

      <mesh position={[-0.2, 0.6, 0.3]} castShadow material={materials.antenna}>
         <cylinderGeometry args={[0.01, 0.01, 0.6]} />
      </mesh>

    </group>
  );
});
