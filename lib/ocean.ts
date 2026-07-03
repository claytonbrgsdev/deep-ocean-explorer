import * as THREE from "three"

// ---------------------------------------------------------------------------
// Mutable world store — read/written inside useFrame without triggering React
// re-renders. The HUD samples this at a low frequency instead of receiving
// setState calls 60x per second (the v1 architecture re-rendered the whole
// React tree every frame).
// ---------------------------------------------------------------------------

export const WORLD = {
  surfaceY: 0,
  floorY: -60,
  bounds: 85, // horizontal half-extent for player + NPCs
}

export const ocean = {
  playerPos: new THREE.Vector3(0, -6, 0),
  playerVel: new THREE.Vector3(0, 0, 0),
  playerQuat: new THREE.Quaternion(),
  speed: 0,
  depth: 6,
  zoneIndex: 0,
  zoneBlend: 0, // 0..1 progress inside current zone (for HUD gauge)
  pulsePhase: 0,
}

export interface DepthZone {
  name: string
  /** depth (positive meters) where the zone begins */
  from: number
  ambient: THREE.Color
  ambientIntensity: number
  sun: THREE.Color
  sunIntensity: number
  fog: THREE.Color
  fogNear: number
  fogFar: number
  bgTop: THREE.Color
  bgBottom: THREE.Color
  /** 0..1 — how much sunlight survives at this depth (drives shafts/caustics) */
  light: number
}

const c = (hex: string) => new THREE.Color(hex)

export const ZONES: DepthZone[] = [
  {
    name: "SUNLIT SURFACE",
    from: 0,
    ambient: c("#8fd8ea"),
    ambientIntensity: 0.75,
    sun: c("#d9f4ff"),
    sunIntensity: 2.0,
    fog: c("#0e6e96"),
    fogNear: 22,
    fogFar: 130,
    bgTop: c("#2fb4d8"),
    bgBottom: c("#0a5e84"),
    light: 1.0,
  },
  {
    name: "SHALLOW REEF",
    from: 9,
    ambient: c("#5db2d4"),
    ambientIntensity: 0.55,
    sun: c("#a8dcf0"),
    sunIntensity: 1.35,
    fog: c("#0a4d74"),
    fogNear: 18,
    fogFar: 110,
    bgTop: c("#12688e"),
    bgBottom: c("#063b58"),
    light: 0.75,
  },
  {
    name: "TWILIGHT ZONE",
    from: 21,
    ambient: c("#2d6f9c"),
    ambientIntensity: 0.38,
    sun: c("#5c9cc4"),
    sunIntensity: 0.7,
    fog: c("#053455",),
    fogNear: 14,
    fogFar: 85,
    bgTop: c("#07456b"),
    bgBottom: c("#03223c"),
    light: 0.42,
  },
  {
    name: "MIDNIGHT DEEP",
    from: 36,
    ambient: c("#16405f"),
    ambientIntensity: 0.24,
    sun: c("#2a5b80"),
    sunIntensity: 0.32,
    fog: c("#021a30"),
    fogNear: 10,
    fogFar: 62,
    bgTop: c("#032440"),
    bgBottom: c("#010d1c"),
    light: 0.16,
  },
  {
    name: "ABYSSAL PLAIN",
    from: 48,
    ambient: c("#0a1c30"),
    ambientIntensity: 0.16,
    sun: c("#123048"),
    sunIntensity: 0.12,
    fog: c("#01080f"),
    fogNear: 7,
    fogFar: 44,
    bgTop: c("#02101e"),
    bgBottom: c("#000306"),
    light: 0.05,
  },
]

export function zoneIndexAtDepth(depth: number): number {
  let idx = 0
  for (let i = 0; i < ZONES.length; i++) {
    if (depth >= ZONES[i].from) idx = i
  }
  return idx
}

// ---------------------------------------------------------------------------
// CPU-side value noise (terrain displacement, NPC wander) — deterministic.
// ---------------------------------------------------------------------------

function hash2(x: number, y: number): number {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return h - Math.floor(h)
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

export function valueNoise2(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const cc = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  const u = smooth(xf)
  const v = smooth(yf)
  return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v
}

export function fbm2(x: number, y: number, octaves = 4): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq)
    amp *= 0.5
    freq *= 2.03
  }
  return sum
}

// ---------------------------------------------------------------------------
// Shared GLSL chunks — inlined into every ShaderMaterial (no .glsl pipeline,
// same philosophy as v1 but centralized instead of copy-pasted).
// ---------------------------------------------------------------------------

export const GLSL_NOISE = /* glsl */ `
  float dn_hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float dn_noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(dn_hash(i + vec3(0,0,0)), dn_hash(i + vec3(1,0,0)), f.x),
          mix(dn_hash(i + vec3(0,1,0)), dn_hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(dn_hash(i + vec3(0,0,1)), dn_hash(i + vec3(1,0,1)), f.x),
          mix(dn_hash(i + vec3(0,1,1)), dn_hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float dn_fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      s += a * dn_noise(p);
      a *= 0.5;
      p *= 2.07;
    }
    return s;
  }
`
