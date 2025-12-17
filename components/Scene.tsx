
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import MarsTerrain from './MarsTerrain';
import ScatteredRocks from './ScatteredRocks';
import { FloatingParticles, FlyingDebris } from './Atmosphere';
import { Stars } from './Stars';
import { Rover } from './Rover';
import { Meteors } from './Meteors';
import { MartianSky } from './MartianSky';
import { RoverHandle } from '../types';

// --- REALISTIC MARS PALETTE (Butterscotch / Tan / Desaturated) ---
const PALETTE = {
  sky: '#CBB0A6',    // Hazy, Dusty Pinkish-Grey (Was #C78872)
  ground: '#A67B66', // Desaturated Clay/Earth (Was #B37460)
  rock: '#5E423A',   // Dark Umber/Dusty Brown (Was #7D4638)
  shadow: '#3D2824', // Deep Desaturated Brown
  sun: '#FADDB9'     // Pale Sand
};

// --- ATMOSPHERIC PALETTE ---
const C_NIGHT_SKY = new THREE.Color('#0A0808');       
const C_TWILIGHT_SKY = new THREE.Color('#241C1A');    
const C_HORIZON_RED = new THREE.Color('#4A3631');     
const C_GOLDEN_HOUR = new THREE.Color('#BA968A');     
const C_DAY_PEACH = new THREE.Color(PALETTE.sky);       

const C_ZENITH_NIGHT = new THREE.Color('#000000');
const C_ZENITH_TWILIGHT = new THREE.Color('#140F0E'); 
const C_ZENITH_DAY = new THREE.Color('#8F7469'); // Desaturated Zenith      

const C_SUN_HIGH = new THREE.Color('#FFF5E6'); // Whitish-yellow sun       
const C_SUN_LOW = new THREE.Color('#FFCFA3');         

const C_HALO_DAY = new THREE.Color('#D9C5BB');        
const C_HALO_SUNSET = new THREE.Color('#8F6A5E');     

const C_AMBIENT_DAY = new THREE.Color(PALETTE.sky);     
const C_AMBIENT_NIGHT = new THREE.Color('#140D0B');   

const CHUNK_SIZE = 80;
const VISIBLE_RADIUS = 1; 

const InfiniteTerrain = () => {
  const { controls } = useThree();
  const [centerChunk, setCenterChunk] = useState({ x: 0, z: 0 });

  useFrame(() => {
    if (controls) {
      // @ts-ignore
      const target = controls.target as THREE.Vector3;
      const cx = Math.round(target.x / CHUNK_SIZE);
      const cz = Math.round(target.z / CHUNK_SIZE);
      if (cx !== centerChunk.x || cz !== centerChunk.z) {
        setCenterChunk({ x: cx, z: cz });
      }
    }
  });

  const chunks = useMemo(() => {
    const list = [];
    for (let x = -VISIBLE_RADIUS; x <= VISIBLE_RADIUS; x++) {
      for (let z = -VISIBLE_RADIUS; z <= VISIBLE_RADIUS; z++) {
        const chunkX = (centerChunk.x + x);
        const chunkZ = (centerChunk.z + z);
        list.push({
          key: `${chunkX}:${chunkZ}`,
          x: chunkX * CHUNK_SIZE,
          z: chunkZ * CHUNK_SIZE
        });
      }
    }
    return list;
  }, [centerChunk]);

  return (
    <group>
      {chunks.map((chunk) => (
        <group key={chunk.key}>
          <MarsTerrain 
            colorPrimary={PALETTE.ground} 
            colorSecondary={PALETTE.shadow} 
            chunkSize={CHUNK_SIZE}
            offsetX={chunk.x}
            offsetZ={chunk.z}
          />
          <ScatteredRocks 
            count={1} 
            color={PALETTE.rock} 
            minScale={22} 
            maxScale={32} 
            chunkSize={CHUNK_SIZE}
            offsetX={chunk.x}
            offsetZ={chunk.z}
          />
          <ScatteredRocks 
            count={3} 
            color={PALETTE.rock} 
            minScale={9} 
            maxScale={15}
            chunkSize={CHUNK_SIZE}
            offsetX={chunk.x}
            offsetZ={chunk.z} 
          />
          <ScatteredRocks 
            count={25} 
            color={PALETTE.rock} 
            minScale={1.5} 
            maxScale={3.5} 
            chunkSize={CHUNK_SIZE}
            offsetX={chunk.x}
            offsetZ={chunk.z}
          />
          <ScatteredRocks 
            count={100} 
            color={PALETTE.rock} 
            minScale={0.1} 
            maxScale={0.4} 
            chunkSize={CHUNK_SIZE}
            offsetX={chunk.x}
            offsetZ={chunk.z}
          />
        </group>
      ))}
    </group>
  );
};

interface SceneProps {
  stormActive: boolean;
  meteorPhase: 'IDLE' | 'INCOMING' | 'IMPACT';
  onSandExposure?: (amount: number) => void;
}

const Scene: React.FC<SceneProps> = ({ stormActive, meteorPhase, onSandExposure }) => {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const moonRef = useRef<THREE.Mesh>(null);
  const sunMeshRef = useRef<THREE.Mesh>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const flashRef = useRef<THREE.PointLight>(null);
  const roverRef = useRef<RoverHandle>(null);
  const fogRef = useRef<THREE.Fog>(null);
  
  const [isDragging, setIsDragging] = useState(false);

  // Reuse color objects to avoid GC. Initialize with DAY defaults to prevent black start.
  const tempSkyBottom = useMemo(() => new THREE.Color(PALETTE.sky), []);
  const tempSkyTop = useMemo(() => new THREE.Color(C_ZENITH_DAY), []);
  const tempSunHalo = useMemo(() => new THREE.Color(C_HALO_DAY), []);
  const tempSun = useMemo(() => new THREE.Color(C_SUN_HIGH), []);
  const tempAmb = useMemo(() => new THREE.Color(C_AMBIENT_DAY), []);
  const tempSunPos = useMemo(() => new THREE.Vector3(0, 100, 0), []); 

  // Smooth transition for storm visuals
  const stormBlend = useRef(0);

  const handleImpact = useCallback((pos: THREE.Vector3) => {
    if (flashRef.current) {
        flashRef.current.position.set(pos.x, pos.y + 2, pos.z);
        // Bright flash of light on impact
        flashRef.current.intensity = 80 + Math.random() * 40; 
    }
  }, []);

  useFrame((state, delta) => {
    // --- PERMANENT DAY LOGIC ---
    const sunAngle = Math.PI * 0.25; 
    const elevation = Math.sin(sunAngle); // ~0.707

    // 1. Calculate Orbiting Positions
    if (sunRef.current) {
        const center = state.camera.position.clone().add(state.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(20));
        center.y = 0;
        
        const orbitRadius = 120;
        const sunX = Math.cos(sunAngle + Math.PI) * orbitRadius; 
        const sunY = Math.sin(sunAngle) * orbitRadius;
        
        sunRef.current.position.set(center.x + sunX, sunY, center.z);
        sunRef.current.target.position.copy(center);
        sunRef.current.target.updateMatrixWorld();

        tempSunPos.copy(sunRef.current.position).sub(state.camera.position);

        if (sunMeshRef.current) {
            sunMeshRef.current.position.set(center.x + sunX * 0.8, sunY * 0.8, center.z); 
            sunMeshRef.current.lookAt(state.camera.position);
        }
        if (moonRef.current) {
            const moonX = Math.cos(sunAngle) * orbitRadius; 
            const moonY = Math.sin(sunAngle + Math.PI) * orbitRadius;
            moonRef.current.position.set(center.x + moonX * 0.8, moonY * 0.8, center.z);
            moonRef.current.lookAt(state.camera.position);
        }
    }

    // 2. Atmospheric Blending (Static Day)
    const tTwilight = THREE.MathUtils.smoothstep(elevation, -0.2, -0.1);
    const tRed = THREE.MathUtils.smoothstep(elevation, -0.08, 0.05);
    const tGolden = THREE.MathUtils.smoothstep(elevation, -0.02, 0.15);
    const tDay = THREE.MathUtils.smoothstep(elevation, 0.1, 0.5);

    let skyColorBottom = tempSkyBottom;
    let skyColorTop = tempSkyTop;
    let sunHaloColor = tempSunHalo;

    let sunColor = tempSun;
    let sunIntensity = 0;
    let ambientColor = tempAmb;
    let ambientIntensity = 0.1;

    skyColorBottom.copy(C_NIGHT_SKY);
    skyColorBottom.lerp(C_TWILIGHT_SKY, tTwilight);
    skyColorBottom.lerp(C_HORIZON_RED, tRed);
    skyColorBottom.lerp(C_GOLDEN_HOUR, tGolden);
    skyColorBottom.lerp(C_DAY_PEACH, tDay);

    skyColorTop.copy(C_ZENITH_NIGHT);
    skyColorTop.lerp(C_ZENITH_TWILIGHT, tTwilight);
    skyColorTop.lerp(C_ZENITH_TWILIGHT, tRed); 
    skyColorTop.lerp(C_ZENITH_DAY, tDay); 

    sunHaloColor.copy(C_HALO_SUNSET);
    sunHaloColor.lerp(C_HALO_DAY, tDay);
    sunHaloColor.multiplyScalar(THREE.MathUtils.smoothstep(elevation, -0.2, -0.05));

    sunColor.copy(C_SUN_LOW).lerp(C_SUN_HIGH, tDay);
    
    const rawIntensity = THREE.MathUtils.smoothstep(elevation, -0.1, 0.3);
    sunIntensity = rawIntensity * 1.6;

    ambientColor.copy(C_AMBIENT_NIGHT);
    ambientColor.lerp(C_HORIZON_RED, tRed * 0.8); 
    ambientColor.lerp(C_AMBIENT_DAY, tDay);
    
    ambientIntensity = 0.002 + tTwilight * 0.02 + tRed * 0.1 + tDay * 0.4;

    // --- STORM OVERRIDES (SMOOTH TRANSITION) ---
    const targetBlend = stormActive ? 1.0 : 0.0;
    // Moderate speed lerp for color transition
    stormBlend.current = THREE.MathUtils.lerp(stormBlend.current, targetBlend, delta * 1.5); 

    if (stormBlend.current > 0.001) {
        // Storm color: Very desaturated beige/brown
        const stormColor = new THREE.Color('#96857D'); 
        
        skyColorBottom.lerp(stormColor, stormBlend.current * 0.95);
        skyColorTop.lerp(stormColor, stormBlend.current * 0.95);
        ambientColor.lerp(stormColor, stormBlend.current * 0.6);
        
        sunIntensity = THREE.MathUtils.lerp(sunIntensity, sunIntensity * 0.2, stormBlend.current);
        
        sunColor.lerp(stormColor, stormBlend.current * 0.8);
        sunHaloColor.lerp(stormColor, stormBlend.current * 0.9);
        
        ambientIntensity = THREE.MathUtils.lerp(ambientIntensity, 0.4, stormBlend.current);
    }
    
    // --- APPLY TO SCENE ---
    if (state.scene) {
        const envIntensity = THREE.MathUtils.lerp(
             THREE.MathUtils.smoothstep(elevation, -0.15, 0.2), 
             0.5, 
             stormBlend.current
        );
        state.scene.environmentIntensity = envIntensity * 0.5; 
    }

    if (fogRef.current) {
        fogRef.current.color.copy(skyColorBottom);
        const baseFar = 110;
        const baseNear = 20;
        
        const targetFar = stormActive ? 40 : baseFar; // Base visibility
        const targetNear = stormActive ? 0.1 : baseNear;
        
        // Fog distance can move faster than color
        fogRef.current.far = THREE.MathUtils.lerp(fogRef.current.far, targetFar, delta * 1.0);
        fogRef.current.near = THREE.MathUtils.lerp(fogRef.current.near, targetNear, delta * 1.0);
    }
    
    if (sunRef.current) {
        sunRef.current.color.copy(sunColor);
        sunRef.current.intensity = THREE.MathUtils.lerp(sunRef.current.intensity, sunIntensity, delta * 2.0);
    }

    if (ambientRef.current) {
        ambientRef.current.color.copy(ambientColor);
        ambientRef.current.intensity = THREE.MathUtils.lerp(ambientRef.current.intensity, ambientIntensity, delta * 2.0);
    }
    
    if (sunMeshRef.current) {
        (sunMeshRef.current.material as THREE.MeshBasicMaterial).color.copy(sunColor);
        sunMeshRef.current.visible = true; 
    }
    if (moonRef.current) {
        moonRef.current.visible = false; 
    }

    // --- FLASH DECAY ---
    if (flashRef.current) {
        // Linear decay for the impact flash
        flashRef.current.intensity = THREE.MathUtils.lerp(flashRef.current.intensity, 0, delta * 8.0);
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.5, 18]} fov={50} far={5000} />
      
      <OrbitControls 
        makeDefault
        target={[0, 1, 0]} 
        maxPolarAngle={Math.PI / 2 - 0.05} 
        minDistance={2}
        maxDistance={60}
        onStart={() => setIsDragging(true)}
        onEnd={() => setIsDragging(false)}
      />

      <ambientLight ref={ambientRef} intensity={0.4} />
      
      <directionalLight 
        ref={sunRef}
        position={[50, 30, 20]} 
        intensity={1.5} 
        castShadow
        shadow-bias={-0.0001}
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera attach="shadow-camera" args={[-120, 120, 120, -120]} />
      </directionalLight>

      {/* Visual Sun Mesh */}
      <mesh ref={sunMeshRef} position={[0, -100, 0]}>
         <sphereGeometry args={[6, 32, 32]} />
         <meshBasicMaterial color="#FFDDB3" fog={false} />
      </mesh>
      
      {/* Visual Moon Mesh */}
      <mesh ref={moonRef} position={[0, -100, 0]}>
         <sphereGeometry args={[2, 16, 16]} />
         <meshStandardMaterial color="#8899AA" roughness={0.8} emissive="#223344" emissiveIntensity={0.2} fog={false} />
      </mesh>

      <pointLight 
        ref={flashRef} 
        distance={200} 
        decay={1} 
        color="#FFE0C0" 
        intensity={0}
      />

      <fog ref={fogRef} attach="fog" args={['#C78872', 20, 110]} />
      
      <MartianSky 
        topColor={tempSkyTop} 
        bottomColor={tempSkyBottom} 
        sunPosition={tempSunPos}
        sunHaloColor={tempSunHalo}
      />

      <Stars />
      <InfiniteTerrain />
      
      <Rover 
        ref={roverRef}
        stormActive={stormActive} 
        meteorPhase={meteorPhase} 
        isDragging={isDragging}
        onSandExposure={onSandExposure}
      />
      
      <FloatingParticles stormActive={stormActive} />
      <FlyingDebris stormActive={stormActive} />
      <Meteors 
         active={meteorPhase === 'IMPACT'} 
         roverRef={roverRef} 
         onImpact={handleImpact}
      />

      <Environment resolution={256}>
         <mesh scale={100}>
           <sphereGeometry args={[1, 64, 64]} />
           <meshBasicMaterial color="#CBB0A6" side={THREE.BackSide} />
         </mesh>
      </Environment>
    </>
  );
};

export default Scene;
