
// A pseudo-random hash function for 2D coordinates
// This creates the "random" foundation, ensuring features aren't regular/repeating patterns
function hash(x: number, z: number): number {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453123;
  return h - Math.floor(h);
}

// 2D Value Noise with Cubic Hermite Interpolation (Smoothstep)
// This creates smooth, non-grid-like noise from the random hash
function noise(x: number, z: number): number {
  const iX = Math.floor(x);
  const iZ = Math.floor(z);
  const fX = x - iX;
  const fZ = z - iZ;

  // Smoothstep
  const u = fX * fX * (3.0 - 2.0 * fX);
  const v = fZ * fZ * (3.0 - 2.0 * fZ);

  // Random values at grid corners
  const bl = hash(iX, iZ);
  const br = hash(iX + 1, iZ);
  const tl = hash(iX, iZ + 1);
  const tr = hash(iX + 1, iZ + 1);

  // Mix
  return (bl * (1.0 - u) + br * u) * (1.0 - v) + 
         (tl * (1.0 - u) + tr * u) * v;
}

// Lightweight noise for textures (Color maps)
// Skips domain warping and detail octaves for 10x performance
export function fastNoise(x: number, z: number): number {
    return noise(x * 0.1, z * 0.1);
}

// Fractal Brownian Motion (FBM) with Domain Warping
// This creates the complex, "bold" landscape shapes
export function simpleNoise(x: number, z: number, seed: number = 42): number {
  // 1. Coordinate scaling
  // Spread the noise out to create larger features
  const scale = 0.025;
  const nx = x * scale;
  const nz = z * scale;

  // 2. Domain Warping
  // We offset the coordinate input to the next noise layer by the result of a previous noise layer.
  // This twists and distorts the terrain, making it look fluid and organic instead of grid-like.
  
  // Warp Vector Q
  const qx = noise(nx + seed, nz + seed);
  const qz = noise(nx + 5.2 + seed, nz + 1.3 + seed);

  // Warp Vector R (warped by Q)
  const rx = noise(nx + 4.0 * qx + 1.7, nz + 4.0 * qz + 9.2);
  const rz = noise(nx + 4.0 * qx + 8.3, nz + 4.0 * qz + 2.8);

  // 3. Final Height Calculation
  // We sample noise at the heavily warped coordinates
  let elevation = noise(nx + 4.0 * rx, nz + 4.0 * rz);

  // 4. Detail Layers
  // Add some smaller bumps on top
  elevation += 0.5 * noise(nx * 2.0, nz * 2.0);
  elevation += 0.25 * noise(nx * 4.0, nz * 4.0);

  // 5. Shaping
  // 'elevation' is roughly 0.0 to 1.75 here.
  // We remap it to world height units.
  
  // Stretch to create height differences
  // REDUCED from 12.0 to 6.0 for significantly flatter terrain
  let h = (elevation - 0.7) * 6.0;

  // Add a very low frequency swell for overall uneven ground tilt
  // REDUCED from 2.5 to 1.2
  h += Math.sin(nx * 0.4) * 1.2 + Math.cos(nz * 0.3) * 1.2;

  // Add high-frequency roughness (pebbles/gravel texture)
  h += noise(x * 0.8, z * 0.8) * 0.6;

  return h;
}

export function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}
