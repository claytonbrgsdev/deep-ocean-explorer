"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { ocean, fbm2, GLSL_NOISE } from "@/lib/ocean"
import { terrainHeight } from "./Seafloor"

// ---------------------------------------------------------------------------
// Abyssal Forest — a bioluminescent rave at the bottom of the world.
// Four draw calls total: kelp spires (instanced ribbons), polyp clusters
// (instanced domes), siphonophore cords (instanced strips) and rising embers
// (points). Everything is displaced in vertex shaders from geometry built
// exactly once; the per-frame cost is a handful of uniform writes. All
// materials are additive with depthWrite off — in the abyss only light
// exists, the bodies themselves stay invisible.
// ---------------------------------------------------------------------------

// Shared per-frame state written ONCE by the driver in <AbyssalForest /> and
// read by every material below — the whole forest breathes as one organism.
// (mutable module store, same philosophy as `ocean`: zero setState per frame)
const forest = {
  /** 0 above ~60m depth → 1 below ~78m: the descent reveal */
  deep: 0,
  /** global 0.1Hz heartbeat, 1.0 ± 0.15 */
  beat: 1,
}

// Rave palette: magenta → cyan → UV violet → acid green. Saturated,
// narrow-band hues like gel lights in fog — never pastel, never white.
// Piecewise mix keeps the in-between blends dark-ish and organic instead of
// washing out toward grey.
const GLSL_NEON = /* glsl */ `
  vec3 neonColor(float h) {
    vec3 magenta = vec3(1.0, 0.12, 0.78);
    vec3 cyan    = vec3(0.10, 0.85, 1.0);
    vec3 violet  = vec3(0.52, 0.18, 1.0);
    vec3 acid    = vec3(0.45, 1.0, 0.22);
    vec3 c = mix(magenta, cyan, clamp(h * 3.0, 0.0, 1.0));
    c = mix(c, violet, clamp(h * 3.0 - 1.0, 0.0, 1.0));
    c = mix(c, acid, clamp(h * 3.0 - 2.0, 0.0, 1.0));
    return c;
  }
`

// Cluster anchors shared by kelp and polyps so the light pools together —
// deterministic (fbm2), spread across the abyssal plain.
const CLUSTERS = 9
function clusterAnchor(i: number): { x: number; z: number } {
  return {
    x: (fbm2(i * 5.7 + 3.1, 21.4) - 0.5) * 300,
    z: (fbm2(19.2, i * 4.9 + 7.7) - 0.5) * 300,
  }
}

// ------------------------------ kelp spires ---------------------------------
// Tall helical ribbons rooted in the seafloor. The ribbon corkscrews around
// its own axis (radius opens toward the tip), sways in the deep current, and
// carries a slow pulse of light climbing from the dark base to the neon tip —
// sap made of light.

const KELP_VERT = /* glsl */ `
  uniform float uTime;
  attribute vec3 aOffset;
  attribute float aHeight;
  attribute float aPhase;
  attribute float aHue;
  attribute float aTwist;
  varying vec2 vUv;
  varying float vHue;
  varying float vPhase;
  varying float vDist;
  void main() {
    vUv = uv;
    vHue = aHue;
    vPhase = aPhase;
    float t = uv.y; // 0 at root, 1 at tip
    // helix: the ribbon spirals as it climbs, radius opening toward the tip
    float ang = aPhase * 6.2831853 + t * aTwist;
    float rad = 0.35 + 1.3 * t;
    vec2 dir = vec2(cos(ang), sin(ang));
    // ribbon width lies tangent to the spiral so the surface stays smooth
    vec3 p;
    p.x = dir.x * rad - dir.y * position.x;
    p.z = dir.y * rad + dir.x * position.x;
    p.y = t * aHeight;
    // slow current sway, bending quadratically toward the free tip
    float bend = t * t;
    p.x += (sin(uTime * 0.22 + aPhase * 9.0) * 1.7 + sin(uTime * 0.53 + aPhase * 4.0) * 0.5) * bend;
    p.z += cos(uTime * 0.18 + aPhase * 7.0) * 1.3 * bend;
    // fine ripple travelling up the blade
    p.x += sin(t * 10.0 - uTime * 0.9 + aPhase * 20.0) * 0.3 * t;
    p += aOffset;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const KELP_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDeep;
  uniform float uBeat;
  varying vec2 vUv;
  varying float vHue;
  varying float vPhase;
  varying float vDist;
  ${GLSL_NEON}
  void main() {
    float t = vUv.y;
    vec3 neon = neonColor(vHue);
    // emissive gradient: near-black root, saturated neon tip
    float grad = pow(t, 1.7);
    // sap of light: a bright window climbing the stalk (~7s per ascent)
    float pulse = pow(0.5 + 0.5 * sin(t * 12.0 - uTime * 0.9 + vPhase * 6.2831853), 6.0);
    // hot tip so each spire ends in a bead of pure colour
    float tip = pow(t, 9.0) * 0.9;
    float glow = grad * (0.30 + 0.85 * pulse) + tip;
    // soft falloff across the ribbon width — no hard neon rails
    float edge = smoothstep(0.0, 0.30, vUv.x) * smoothstep(1.0, 0.70, vUv.x);
    // additive material ignores scene fog: fade manually into the abyssal haze
    float dist = smoothstep(62.0, 12.0, vDist);
    float a = glow * edge * dist * uDeep;
    gl_FragColor = vec4(neon * a * uBeat * 1.8, a);
  }
`

function KelpSpires() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const geometry = useMemo(() => {
    const COUNT = 60
    // unit ribbon: width 0.9 on x, height 0..1 on y (scaled per instance)
    const blade = new THREE.PlaneGeometry(0.9, 1, 1, 24)
    blade.translate(0, 0.5, 0)
    const inst = new THREE.InstancedBufferGeometry()
    inst.index = blade.index
    inst.attributes = blade.attributes
    const offset = new Float32Array(COUNT * 3)
    const height = new Float32Array(COUNT)
    const phase = new Float32Array(COUNT)
    const hue = new Float32Array(COUNT)
    const twist = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      const a = clusterAnchor(i % CLUSTERS)
      const x = a.x + (fbm2(i * 1.7 + 0.3, 5.2) - 0.5) * 22
      const z = a.z + (fbm2(4.8, i * 2.1 + 1.1) - 0.5) * 22
      offset[i * 3] = x
      offset[i * 3 + 1] = terrainHeight(x, z) - 0.5 // rooted slightly under the silt
      offset[i * 3 + 2] = z
      height[i] = 12 + fbm2(i * 0.83, 17.2) * 19 // 12..30 units tall
      phase[i] = fbm2(i * 0.61, 3.7)
      hue[i] = fbm2(i * 2.9, 11.3)
      // 1.5 to ~4 full turns root-to-tip, sign alternating
      twist[i] = (9.0 + fbm2(i * 1.2, 6.6) * 16.0) * (i % 2 === 0 ? 1 : -1)
    }
    inst.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offset, 3))
    inst.setAttribute("aHeight", new THREE.InstancedBufferAttribute(height, 1))
    inst.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1))
    inst.setAttribute("aHue", new THREE.InstancedBufferAttribute(hue, 1))
    inst.setAttribute("aTwist", new THREE.InstancedBufferAttribute(twist, 1))
    inst.instanceCount = COUNT
    return inst
  }, [])

  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    m.uniforms.uTime.value = state.clock.elapsedTime
    m.uniforms.uDeep.value = forest.deep
    m.uniforms.uBeat.value = forest.beat
  })

  return (
    <mesh geometry={geometry as unknown as THREE.BufferGeometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={KELP_VERT}
        fragmentShader={KELP_FRAG}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 }, uDeep: { value: 0 }, uBeat: { value: 1 } }}
      />
    </mesh>
  )
}

// ---------------------------- pulsing polyps --------------------------------
// Low glowing domes carpeting the floor between the spires. Each breathes
// (scale + brightness) at its own tempo in the 0.4–0.8Hz band — the slow
// groove of the rave — desynchronized by per-instance phase.

const POLYP_VERT = /* glsl */ `
  uniform float uTime;
  attribute vec3 aOffset;
  attribute float aScale;
  attribute float aPhase;
  attribute float aHue;
  varying float vHue;
  varying float vBreath;
  varying float vY;
  varying float vDist;
  void main() {
    vHue = aHue;
    vY = position.y; // dome: 0 at rim, 1 at crown
    // per-polyp tempo: omega 2.5..5.0 rad/s = 0.4..0.8 Hz
    float w = 2.5 + aPhase * 2.5;
    float breath = 0.5 + 0.5 * sin(uTime * w + aPhase * 25.13);
    vBreath = breath;
    // the body inflates ~20% on the inhale
    vec3 p = position * aScale * (0.84 + 0.20 * breath);
    p += aOffset;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const POLYP_FRAG = /* glsl */ `
  uniform float uDeep;
  uniform float uBeat;
  varying float vHue;
  varying float vBreath;
  varying float vY;
  varying float vDist;
  ${GLSL_NEON}
  void main() {
    vec3 neon = neonColor(vHue);
    // light concentrates at the crown; sharpened breath curve gives the
    // "thump" — quick bloom, longer fade — instead of a sine shimmer
    float glow = (0.12 + 0.88 * pow(vBreath, 2.4)) * (0.25 + 0.75 * vY);
    float dist = smoothstep(52.0, 8.0, vDist);
    float a = glow * dist * uDeep;
    gl_FragColor = vec4(neon * a * uBeat * 2.0, a);
  }
`

function PolypBeds() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const geometry = useMemo(() => {
    const COUNT = 120
    // unit dome (top hemisphere), rim ring at y=0 so it sits on the silt
    const dome = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)
    const inst = new THREE.InstancedBufferGeometry()
    inst.index = dome.index
    inst.attributes = dome.attributes
    const offset = new Float32Array(COUNT * 3)
    const scale = new Float32Array(COUNT)
    const phase = new Float32Array(COUNT)
    const hue = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      const a = clusterAnchor((i * 5) % CLUSTERS)
      const x = a.x + (fbm2(i * 2.3 + 9.4, 1.6) - 0.5) * 26
      const z = a.z + (fbm2(7.1, i * 1.9 + 2.8) - 0.5) * 26
      offset[i * 3] = x
      offset[i * 3 + 1] = terrainHeight(x, z) - 0.15
      offset[i * 3 + 2] = z
      scale[i] = 0.35 + fbm2(i * 0.9, 13.5) * 1.2
      phase[i] = fbm2(i * 1.4, 8.2)
      hue[i] = fbm2(i * 3.3, 2.7)
    }
    inst.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offset, 3))
    inst.setAttribute("aScale", new THREE.InstancedBufferAttribute(scale, 1))
    inst.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1))
    inst.setAttribute("aHue", new THREE.InstancedBufferAttribute(hue, 1))
    inst.instanceCount = COUNT
    return inst
  }, [])

  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    m.uniforms.uTime.value = state.clock.elapsedTime
    m.uniforms.uDeep.value = forest.deep
    m.uniforms.uBeat.value = forest.beat
  })

  return (
    <mesh geometry={geometry as unknown as THREE.BufferGeometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={POLYP_VERT}
        fragmentShader={POLYP_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 }, uDeep: { value: 0 }, uBeat: { value: 1 } }}
      />
    </mesh>
  )
}

// --------------------------- siphonophore cords ------------------------------
// Long luminous ribbons drifting at mid-water. Each cord undulates through a
// noise field (every cross-section of the strip shares its u coordinate, so
// the displacement is a rigid translation of the section — the ribbon bends
// but never shears) while trains of light beads race along its length.

const SIPHON_VERT = /* glsl */ `
  ${GLSL_NOISE}
  uniform float uTime;
  attribute vec3 aOffset;
  attribute float aPhase;
  attribute float aHue;
  attribute float aDir;
  varying float vU;
  varying float vHue;
  varying float vDist;
  void main() {
    vU = uv.x;
    vHue = aHue;
    float u = uv.x;
    vec3 p = position;
    // body tapers toward the trailing end
    p.y *= mix(1.0, 0.35, u);
    // undulation sampled along u only — smooth serpentine, no shearing
    p.y += (dn_noise(vec3(u * 2.2 + aPhase * 9.0, uTime * 0.13 + aPhase, 0.0)) - 0.5) * 5.0;
    float side = (dn_noise(vec3(u * 1.8, aPhase * 5.0, uTime * 0.11)) - 0.5) * 5.0;
    // orient each cord on its own heading
    float ca = cos(aDir);
    float sa = sin(aDir);
    vec3 r = vec3(p.x * ca - side * sa, p.y, p.x * sa + side * ca);
    // the whole animal drifts on a slow Lissajous around its anchor
    vec3 anchor = aOffset;
    anchor.x += sin(uTime * 0.045 + aPhase * 6.2831853) * 7.0;
    anchor.z += cos(uTime * 0.038 + aPhase * 10.7) * 7.0;
    anchor.y += sin(uTime * 0.06 + aPhase * 14.3) * 2.5;
    vec4 mv = modelViewMatrix * vec4(r + anchor, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const SIPHON_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDeep;
  uniform float uBeat;
  varying float vU;
  varying float vHue;
  varying float vDist;
  ${GLSL_NEON}
  void main() {
    // trains of bright beads travelling head-to-tail, plus one slow broad
    // wave underneath — two tempos layered like a synth line over a pad
    float train = pow(0.5 + 0.5 * sin(vU * 18.85 - uTime * 2.2 + vHue * 6.2831853), 9.0);
    float wave = pow(0.5 + 0.5 * sin(vU * 6.2831853 - uTime * 0.6 + vHue * 3.0), 3.0);
    float body = 0.05 + train * 0.9 + wave * 0.3;
    // both tips dissolve into the dark
    float tip = smoothstep(0.0, 0.08, vU) * smoothstep(1.0, 0.92, vU);
    float dist = smoothstep(56.0, 10.0, vDist);
    float a = body * tip * dist * uDeep;
    gl_FragColor = vec4(neonColor(vHue) * a * uBeat * 2.2, a);
  }
`

function SiphonophoreCords() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const geometry = useMemo(() => {
    const COUNT = 6
    // strip along x (length 24), width 0.6 on y; uv.x runs head → tail
    const strip = new THREE.PlaneGeometry(24, 0.6, 96, 1)
    const inst = new THREE.InstancedBufferGeometry()
    inst.index = strip.index
    inst.attributes = strip.attributes
    const offset = new Float32Array(COUNT * 3)
    const phase = new Float32Array(COUNT)
    const hue = new Float32Array(COUNT)
    const dir = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      offset[i * 3] = (fbm2(i * 7.7 + 1.9, 31.2) - 0.5) * 140
      // mid-water band: anchors -82..-108, drift keeps them inside -75..-115
      offset[i * 3 + 1] = -82 - fbm2(i * 3.1, 9.9) * 26
      offset[i * 3 + 2] = (fbm2(23.4, i * 6.1 + 4.2) - 0.5) * 140
      phase[i] = fbm2(i * 1.3, 5.5)
      hue[i] = fbm2(i * 4.4, 16.1)
      dir[i] = fbm2(i * 2.2, 12.8) * Math.PI * 2
    }
    inst.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offset, 3))
    inst.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1))
    inst.setAttribute("aHue", new THREE.InstancedBufferAttribute(hue, 1))
    inst.setAttribute("aDir", new THREE.InstancedBufferAttribute(dir, 1))
    inst.instanceCount = COUNT
    return inst
  }, [])

  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    m.uniforms.uTime.value = state.clock.elapsedTime
    m.uniforms.uDeep.value = forest.deep
    m.uniforms.uBeat.value = forest.beat
  })

  return (
    <mesh geometry={geometry as unknown as THREE.BufferGeometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={SIPHON_VERT}
        fragmentShader={SIPHON_FRAG}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 }, uDeep: { value: 0 }, uBeat: { value: 1 } }}
      />
    </mesh>
  )
}

// ------------------------------ neon embers ----------------------------------
// Sparks rising slowly off the forest floor, flickering individually. The
// field wraps around the player horizontally (MarineSnow pattern) but the
// vertical wrap is a fixed band above the seafloor — embers are born in the
// silt and die mid-water, regardless of where the player hovers.

const EMBER_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  attribute float aSize;
  attribute float aSpeed;
  attribute float aPhase;
  attribute float aHue;
  varying float vFade;
  varying float vHue;
  void main() {
    float band = 46.0; // ascent height above the floor
    vec3 p = position;
    // rise + vertical wrap inside the fixed band (position.y is a seed)
    float y = mod(position.y + uTime * aSpeed, band);
    float life = y / band; // 0 birth at floor → 1 death mid-water
    p.y = -118.0 + y;
    // horizontal wrap around the player
    p.x = mod(p.x - uCenter.x + 70.0, 140.0) - 70.0 + uCenter.x;
    p.z = mod(p.z - uCenter.z + 70.0, 140.0) - 70.0 + uCenter.z;
    // lazy convective wander on the way up
    p.x += sin(uTime * 0.3 + aPhase * 6.2831853 + y * 0.25) * 1.4;
    p.z += cos(uTime * 0.26 + aPhase * 9.4 + y * 0.2) * 1.2;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    // individual flicker — every ember strobes on its own clock
    float flick = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (2.0 + aPhase * 3.0) + aPhase * 40.0), 3.0);
    vFade = smoothstep(0.0, 0.12, life) * smoothstep(1.0, 0.55, life)
          * smoothstep(52.0, 8.0, dist) * flick;
    vHue = aHue;
    gl_PointSize = aSize * 140.0 / max(dist, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`

const EMBER_FRAG = /* glsl */ `
  uniform float uDeep;
  uniform float uBeat;
  varying float vFade;
  varying float vHue;
  ${GLSL_NEON}
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    float a = core * vFade * uDeep;
    gl_FragColor = vec4(neonColor(vHue) * a * uBeat * 2.4, a);
  }
`

function NeonEmbers() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const geometry = useMemo(() => {
    const N = 450
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const size = new Float32Array(N)
    const speed = new Float32Array(N)
    const phase = new Float32Array(N)
    const hue = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 140
      pos[i * 3 + 1] = Math.random() * 46 // vertical seed inside the band
      pos[i * 3 + 2] = (Math.random() - 0.5) * 140
      size[i] = 0.4 + Math.random() * 1.0
      speed[i] = 0.5 + Math.random() * 1.1 // slow ascent, ~30-90s per climb
      phase[i] = Math.random()
      hue[i] = Math.random()
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1))
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1))
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1))
    geo.setAttribute("aHue", new THREE.BufferAttribute(hue, 1))
    return geo
  }, [])

  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    m.uniforms.uTime.value = state.clock.elapsedTime
    m.uniforms.uCenter.value.copy(ocean.playerPos)
    m.uniforms.uDeep.value = forest.deep
    m.uniforms.uBeat.value = forest.beat
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={EMBER_VERT}
        fragmentShader={EMBER_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uCenter: { value: new THREE.Vector3() },
          uDeep: { value: 0 },
          uBeat: { value: 1 },
        }}
      />
    </points>
  )
}

// --------------------------------- driver -----------------------------------

export default function AbyssalForest() {
  // Single driver for the shared state: the reveal ramp and the heartbeat.
  // Children copy these values verbatim, so the whole forest is phase-locked.
  useFrame((state) => {
    const t = state.clock.elapsedTime
    // global heartbeat: 0.1Hz (10s cycle), ±15% — subtle, one organism
    forest.beat = 1 + 0.15 * Math.sin(t * Math.PI * 2 * 0.1)
    // the descent reveal: pitch black above 60m, full rave by 78m. Lerped so
    // crossing the threshold feels like lights warming up, not a switch.
    const target = THREE.MathUtils.clamp((ocean.depth - 60) / 18, 0, 1)
    forest.deep += (target - forest.deep) * 0.03
  })

  return (
    <group>
      <KelpSpires />
      <PolypBeds />
      <SiphonophoreCords />
      <NeonEmbers />
    </group>
  )
}
