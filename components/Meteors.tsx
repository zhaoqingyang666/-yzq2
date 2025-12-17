
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { simpleNoise } from '../utils/noise';
import { RoverHandle } from '../types';

interface MeteorsProps {
  active: boolean;
  roverRef?: React.MutableRefObject<RoverHandle | null>;
  onImpact?: (pos: THREE.Vector3) => void;
}

export const Meteors = ({ active, roverRef, onImpact }: MeteorsProps) => {
  const count = 30;
  const mesh = useRef<THREE.InstancedMesh>(null);
  
  // Explosion/Dust Cloud System
  const explosionMesh = useRef<THREE.InstancedMesh>(null);
  const explosionCount = 30;
  const explosionIdx = useRef(0); // Circular buffer index

  // Debris Splash System
  const debrisMesh = useRef<THREE.InstancedMesh>(null);
  const debrisCount = 600; 
  const debrisIdx = useRef(0); // Circular buffer index

  // Shockwave Ring System
  const shockwaveMesh = useRef<THREE.InstancedMesh>(null);
  const shockwaveCount = 20;
  const shockwaveIdx = useRef(0); // Circular buffer index

  // Ground Crater/Scorch System
  const craterMesh = useRef<THREE.InstancedMesh>(null);
  const craterCount = 40;
  const craterIdx = useRef(0); // Circular buffer index
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  const meteors = useMemo(() => {
    return new Array(count).fill(0).map(() => ({
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * 120, 
        80 + Math.random() * 80, 
        (Math.random() - 0.5) * 120
      ),
      speed: 50 + Math.random() * 30,
      scale: 0.5 + Math.random() * 1.5,
      angle: Math.random() * Math.PI * 2
    }));
  }, []);

  const explosions = useMemo(() => {
    return new Array(explosionCount).fill(0).map(() => ({
      active: false,
      pos: new THREE.Vector3(),
      scale: 0,
      life: 0
    }));
  }, []);

  const debris = useMemo(() => {
      return new Array(debrisCount).fill(0).map(() => ({
          active: false,
          pos: new THREE.Vector3(),
          vel: new THREE.Vector3(),
          scale: 1,
          rotAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
          rotSpeed: 0,
          life: 0
      }));
  }, []);

  const shockwaves = useMemo(() => {
      return new Array(shockwaveCount).fill(0).map(() => ({
          active: false,
          pos: new THREE.Vector3(),
          scale: 0,
          life: 0
      }));
  }, []);

  const craters = useMemo(() => {
      return new Array(craterCount).fill(0).map(() => ({
          active: false,
          pos: new THREE.Vector3(),
          quaternion: new THREE.Quaternion(),
          scale: 1,
          life: 0,
          opacity: 1
      }));
  }, []);

  // Terrain Normal helper
  const getGroundNormal = (x: number, z: number) => {
      const epsilon = 0.5;
      const hL = simpleNoise(x - epsilon, z) - 2.0;
      const hR = simpleNoise(x + epsilon, z) - 2.0;
      const hD = simpleNoise(x, z - epsilon) - 2.0;
      const hU = simpleNoise(x, z + epsilon) - 2.0;
      const slopeX = (hR - hL) / (2 * epsilon);
      const slopeZ = (hU - hD) / (2 * epsilon);
      return new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();
  };

  useFrame((state, delta) => {
    const hasActiveParticles = meteors.some(m => m.pos.y > -10);
    const hasActiveExplosions = explosions.some(e => e.active);
    const hasActiveDebris = debris.some(d => d.active);
    const hasActiveShockwaves = shockwaves.some(s => s.active);
    const hasActiveCraters = craters.some(c => c.active);
    
    if (mesh.current) mesh.current.visible = active || hasActiveParticles;
    if (explosionMesh.current) explosionMesh.current.visible = hasActiveExplosions;
    if (debrisMesh.current) debrisMesh.current.visible = hasActiveDebris;
    if (shockwaveMesh.current) shockwaveMesh.current.visible = hasActiveShockwaves;
    if (craterMesh.current) craterMesh.current.visible = hasActiveCraters;

    const camPos = state.camera.position;

    // --- 1. Update Falling Meteors ---
    if (mesh.current && mesh.current.visible) {
        meteors.forEach((m, i) => {
          const groundH = simpleNoise(m.pos.x, m.pos.z) - 2.0;
          let hitRover = false;
          
          if (active && roverRef?.current) {
              const roverPos = roverRef.current.getPosition();
              const dx = roverPos.x - m.pos.x;
              const dz = roverPos.z - m.pos.z;
              const distSq = dx*dx + dz*dz;
              const heightDiff = Math.abs(roverPos.y - m.pos.y);

              if (distSq < 5.0 && heightDiff < 2.5) {
                   hitRover = true;
                   const impactDir = new THREE.Vector3(dx, 0, dz).normalize(); 
                   const impactForce = impactDir.multiplyScalar(25.0); 
                   roverRef.current.hit(impactForce);
              }
          }

          if ((active && m.pos.y < groundH) || hitRover) {
              // --- IMPACT ---
              const impactPos = m.pos.clone();
              impactPos.y = hitRover ? m.pos.y : groundH;

              // Trigger Lighting callback
              if (onImpact) onImpact(impactPos);

              // 1. Explosion (Circular Buffer)
              const ex = explosions[explosionIdx.current];
              ex.active = true;
              ex.life = 1.0;
              ex.pos.copy(impactPos);
              ex.scale = 0.5;
              explosionIdx.current = (explosionIdx.current + 1) % explosionCount;

              // 2. Shockwave (Circular Buffer)
              const sw = shockwaves[shockwaveIdx.current];
              sw.active = true;
              sw.life = 0.6; 
              sw.pos.copy(impactPos);
              sw.pos.y += 0.2; 
              sw.scale = 0.5;
              shockwaveIdx.current = (shockwaveIdx.current + 1) % shockwaveCount;

              // 3. Crater (Circular Buffer)
              const cr = craters[craterIdx.current];
              cr.active = true;
              cr.life = 15.0; 
              cr.opacity = 0.9;
              cr.pos.copy(impactPos);
              cr.pos.y += 0.05; 
              cr.scale = 1.0 + Math.random() * 0.8;
              
              // Align to ground normal
              const normal = getGroundNormal(impactPos.x, impactPos.z);
              const up = new THREE.Vector3(0, 1, 0);
              const q = new THREE.Quaternion().setFromUnitVectors(up, normal);
              cr.quaternion.copy(q);
              
              craterIdx.current = (craterIdx.current + 1) % craterCount;

              // 4. Debris Splash (Batch Spawn)
              const particlesPerImpact = 12;
              for (let k = 0; k < particlesPerImpact; k++) {
                  const d = debris[debrisIdx.current];
                  
                  d.active = true;
                  d.life = 1.0 + Math.random(); 
                  d.pos.copy(impactPos);
                  d.pos.y += 0.5; 
                  
                  const angle = Math.random() * Math.PI * 2;
                  const spread = Math.random() * 0.5; 
                  const speed = 10 + Math.random() * 20;
                  
                  const vx = Math.cos(angle) * (0.5 + spread);
                  const vz = Math.sin(angle) * (0.5 + spread);
                  const vy = 1.5 + Math.random();
                  
                  d.vel.set(vx, vy, vz).normalize().multiplyScalar(speed);
                  d.scale = 0.2 + Math.random() * 0.5;
                  d.rotSpeed = Math.random() * 15;
                  
                  debrisIdx.current = (debrisIdx.current + 1) % debrisCount;
              }

              // Reset Meteor
              let targetX = camPos.x + (Math.random() - 0.5) * 100;
              let targetZ = camPos.z + (Math.random() - 0.5) * 100;
              
              if (roverRef?.current && Math.random() < 0.15) {
                   const rPos = roverRef.current.getPosition();
                   targetX = rPos.x + (Math.random() - 0.5) * 1.5; 
                   targetZ = rPos.z + (Math.random() - 0.5) * 1.5;
              }

              m.pos.y = 80 + Math.random() * 50;
              m.pos.x = targetX;
              m.pos.z = targetZ;

          } else if (!active && m.pos.y < groundH) {
              m.pos.y = -1000;
          } else {
              m.pos.y -= m.speed * delta;
              m.pos.x -= m.speed * delta * 0.3;
          }

          dummy.position.copy(m.pos);
          dummy.scale.set(m.scale * 0.3, m.scale * 6, m.scale * 0.3); 
          dummy.rotation.set(0, 0, Math.PI / 6);
          dummy.updateMatrix();
          mesh.current!.setMatrixAt(i, dummy.matrix);
        });
        mesh.current.instanceMatrix.needsUpdate = true;
    }

    // --- 2. Update Explosions ---
    if (explosionMesh.current && explosionMesh.current.visible) {
        explosions.forEach((e, i) => {
            if (e.active) {
                e.life -= delta * 1.5; 
                if (e.life > 0.5) {
                    e.scale = THREE.MathUtils.lerp(e.scale, 5.0, delta * 8); 
                } else {
                    e.scale = THREE.MathUtils.lerp(e.scale, 0.0, delta * 4);
                }
                if (e.life <= 0) e.active = false;

                dummy.position.copy(e.pos);
                dummy.scale.setScalar(e.scale);
                dummy.rotation.set(state.clock.elapsedTime + i, state.clock.elapsedTime * 0.5, 0);
                dummy.updateMatrix();
                explosionMesh.current!.setMatrixAt(i, dummy.matrix);
            } else {
                dummy.position.set(0, -10000, 0);
                dummy.updateMatrix();
                explosionMesh.current!.setMatrixAt(i, dummy.matrix);
            }
        });
        explosionMesh.current.instanceMatrix.needsUpdate = true;
    }

    // --- 3. Update Shockwaves ---
    if (shockwaveMesh.current && shockwaveMesh.current.visible) {
        shockwaves.forEach((s, i) => {
            if (s.active) {
                s.life -= delta * 2.0; 
                s.scale += delta * 30.0;
                
                if (s.life <= 0) {
                     s.active = false;
                     s.scale = 0;
                }

                dummy.position.copy(s.pos);
                dummy.scale.set(s.scale, s.scale, 1); 
                dummy.rotation.set(-Math.PI/2, 0, 0);
                dummy.updateMatrix();
                shockwaveMesh.current!.setMatrixAt(i, dummy.matrix);
            } else {
                dummy.position.set(0, -10000, 0);
                dummy.updateMatrix();
                shockwaveMesh.current!.setMatrixAt(i, dummy.matrix);
            }
        });
        shockwaveMesh.current.instanceMatrix.needsUpdate = true;
    }

    // --- 4. Update Craters ---
    if (craterMesh.current && craterMesh.current.visible) {
         craters.forEach((c, i) => {
            if (c.active) {
                c.life -= delta;
                
                let currentScale = c.scale;
                if (c.life < 2.0) {
                    currentScale = c.scale * (c.life / 2.0);
                }
                if (c.life <= 0) c.active = false;

                dummy.position.copy(c.pos);
                dummy.quaternion.copy(c.quaternion);
                dummy.rotateX(-Math.PI/2);
                
                dummy.scale.setScalar(currentScale);
                dummy.updateMatrix();
                craterMesh.current!.setMatrixAt(i, dummy.matrix);
            } else {
                dummy.position.set(0, -10000, 0);
                dummy.updateMatrix();
                craterMesh.current!.setMatrixAt(i, dummy.matrix);
            }
         });
         craterMesh.current.instanceMatrix.needsUpdate = true;
    }

    // --- 5. Update Debris ---
    if (debrisMesh.current && debrisMesh.current.visible) {
        debris.forEach((d, i) => {
            if (d.active) {
                d.vel.y -= 30.0 * delta; // Gravity
                d.pos.addScaledVector(d.vel, delta);
                d.life -= delta;
                
                if (d.pos.y < -5) d.active = false;
                if (d.life <= 0) d.active = false;

                dummy.position.copy(d.pos);
                dummy.scale.setScalar(d.scale);
                dummy.rotateOnAxis(d.rotAxis, d.rotSpeed * delta);
                dummy.updateMatrix();
                debrisMesh.current!.setMatrixAt(i, dummy.matrix);
            } else {
                dummy.position.set(0, -10000, 0);
                dummy.updateMatrix();
                debrisMesh.current!.setMatrixAt(i, dummy.matrix);
            }
        });
        debrisMesh.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
        {/* Meteors - Less Neon Orange */}
        <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color="#FF7733" transparent opacity={0.9} blending={THREE.AdditiveBlending} />
        </instancedMesh>
        
        {/* Explosion Core - Less Neon */}
        <instancedMesh ref={explosionMesh} args={[undefined, undefined, explosionCount]}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color="#E25822" transparent opacity={0.8} blending={THREE.AdditiveBlending} />
        </instancedMesh>

        {/* Shockwaves - Dusty */}
        <instancedMesh ref={shockwaveMesh} args={[undefined, undefined, shockwaveCount]}>
            <ringGeometry args={[0.5, 1.0, 32]} />
            <meshBasicMaterial color="#D1B0A5" transparent opacity={0.3} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </instancedMesh>

        {/* Craters (Scorch Marks) */}
        <instancedMesh ref={craterMesh} args={[undefined, undefined, craterCount]}>
            <circleGeometry args={[1.5, 32]} />
            <meshStandardMaterial 
                color="#1F1512" // Very dark brown instead of pure black
                roughness={1.0} 
                transparent 
                opacity={0.9} 
                polygonOffset 
                polygonOffsetFactor={-1} 
            />
        </instancedMesh>

        {/* Debris Splash - Match Ground Color */}
        <instancedMesh ref={debrisMesh} args={[undefined, undefined, debrisCount]}>
            <tetrahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color="#5E423A" roughness={0.9} flatShading />
        </instancedMesh>
    </group>
  );
};
