import * as THREE from 'three';

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface TerrainProps {
  color: string;
  seed: number;
}

export interface RoverHandle {
  getPosition: () => THREE.Vector3;
  hit: (impactVelocity: THREE.Vector3) => void;
}
