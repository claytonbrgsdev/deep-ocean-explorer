"use client"

import { useMemo, forwardRef, useImperativeHandle } from "react"
import * as THREE from "three"
import { GLSL_GESTURE, GLSL_BELLWAVE, GLSL_NOISE } from "@/lib/ocean"

// ---------------------------------------------------------------------------
// JellyBody — shared anatomy for the player and every NPC jellyfish.
//
// v1 rebuilt tentacle matrices on the CPU (hundreds of Matrix4/Vector3
// allocations per frame). Here the tentacles are a single InstancedMesh whose
// sway, taper and drag all happen in the vertex shader: the CPU cost per
// jellyfish per frame is exactly 3 uniform writes.
// ---------------------------------------------------------------------------

export interface JellyPalette {
  bell: string
  glow: string
  organ: string
  tentacle: string
}

export interface JellyUniforms {
  time: { value: number }
  phase: { value: number }
  amp: { value: number }
  velLocal: { value: THREE.Vector3 }
  glowBoost: { value: number }
  /** rotation from the CURRENT body orientation to a time-lagged one —
   * strand tips live in the past, roots in the present */
  lagMat: { value: THREE.Matrix3 }
}

export interface JellyBodyHandle {
  uniforms: JellyUniforms
}

// Bell profile: hemisphere flowing into a soft inward lip.
// width/height are character-maker multipliers around 1.
function makeBellGeometry(width = 1, height = 1): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = []
  const N = 22
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const theta = (t * Math.PI) / 2
    // superellipse-ish rounding for a fuller, more medusa-like dome
    const r = Math.pow(Math.sin(theta), 0.85) * width
    const y = Math.pow(Math.cos(theta), 1.15) * height
    pts.push(new THREE.Vector2(r, y))
  }
  // rim lip curving slightly inward/under
  pts.push(new THREE.Vector2(1.0 * width, -0.05 * height))
  pts.push(new THREE.Vector2(0.93 * width, -0.1 * height))
  pts.push(new THREE.Vector2(0.85 * width, -0.07 * height))
  return new THREE.LatheGeometry(pts, 48)
}

// Cuboid bell for cubozoans (Chirodectes): a rounded box with a domed top and
// near-vertical walls. Cross-sections are squircles (superellipse) so the
// silhouette reads as a cube with softly rounded corners; the y-range matches
// the dome (apex ≈ +height, rim below 0) so the SAME bell-wave physics apply.
function makeBoxBellGeometry(width = 1, height = 1): THREE.BufferGeometry {
  const radial = 64
  const capRings = 10 // rounded top
  const wallRings = 8 // vertical sides
  const nExp = 5.0 // squircle exponent → rounded-square footprint
  const squircle = (phi: number) => {
    const c = Math.abs(Math.cos(phi))
    const s = Math.abs(Math.sin(phi))
    return 1 / Math.pow(Math.pow(c, nExp) + Math.pow(s, nExp), 1 / nExp)
  }
  const rings: { rs: number; y: number }[] = []
  for (let i = 0; i <= capRings; i++) {
    const t = i / capRings
    const th = (t * Math.PI) / 2
    rings.push({ rs: Math.pow(Math.sin(th), 0.62), y: Math.pow(Math.cos(th), 1.05) * height })
  }
  for (let j = 1; j <= wallRings; j++) {
    const t = j / wallRings
    rings.push({ rs: 1.0, y: -t * 0.62 * height })
  }
  rings.push({ rs: 0.9, y: -0.68 * height }) // inward velarium lip

  const R = rings.length
  const stride = radial + 1
  const positions: number[] = []
  const uvs: number[] = []
  for (let r = 0; r < R; r++) {
    for (let a = 0; a <= radial; a++) {
      const phi = (a / radial) * Math.PI * 2
      const rr = rings[r].rs * squircle(phi) * width
      positions.push(Math.cos(phi) * rr, rings[r].y, Math.sin(phi) * rr)
      uvs.push(a / radial, r / (R - 1))
    }
  }
  const indices: number[] = []
  for (let r = 0; r < R - 1; r++) {
    for (let a = 0; a < radial; a++) {
      const i0 = r * stride + a
      const i1 = i0 + 1
      const i2 = (r + 1) * stride + a
      const i3 = i2 + 1
      indices.push(i0, i2, i1, i1, i2, i3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

const BELL_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uAmp;
  uniform float uBox;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${GLSL_BELLWAVE}
  void main() {
    vec3 pos = position;
    // traveling contraction: apex (y=1) leads, rim (y<=0) follows.
    // asymmetric wave: deep squeeze (mouth nearly closes), soft overshoot
    float rimW = smoothstep(0.9, 0.0, position.y);
    float wave = bellWave(uPhase - position.y * 2.8);
    float squeeze = 1.0 - uAmp * wave * rimW;
    pos.x *= squeeze;
    pos.z *= squeeze;
    pos.y *= 1.0 + uAmp * 0.4 * wave * rimW;
    // rim ruffle with two harmonics — lappet-like scalloping, unhurried.
    // a cubozoan bell keeps crisp edges, so the ruffle is muted for boxes.
    float ang = atan(position.z, position.x);
    vec2 radial = normalize(position.xz + vec2(1e-4));
    float ruffle = 1.0 - uBox * 0.75;
    pos.xz += radial * 0.03 * sin(ang * 14.0 + uTime * 1.6) * rimW * ruffle;
    pos.xz += radial * 0.02 * sin(ang * 7.0 - uTime * 1.1) * rimW * ruffle;

    vLocal = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const BELL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uGlowBoost;
  uniform float uFireworks;
  uniform float uSpots;
  uniform float uBox;
  uniform float uBellOpacity;
  uniform vec3 uColorBell;
  uniform vec3 uColorGlow;
  uniform vec3 uColorOrgan;
  uniform vec3 uColorCanal;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  ${GLSL_NOISE}
  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 2.4);

    // four-lobed gonad "flower" visible through the dome (the red "heart"
    // of the box jelly reads through the same channel)
    float ang = atan(vLocal.z, vLocal.x);
    float rad = length(vLocal.xz);
    float lobes = pow(abs(sin(ang * 2.0)), 6.0);
    float organ = lobes * smoothstep(0.75, 0.25, rad) * smoothstep(0.15, 0.55, rad);

    float pulse = 0.5 + 0.5 * sin(uPhase);
    vec3 col = mix(uColorBell * 0.35, uColorGlow, fresnel);
    col += uColorOrgan * organ * (0.55 + 0.45 * pulse);
    col += uColorGlow * uGlowBoost * (0.35 + 0.3 * pulse);

    // dome-specific ornaments are muted on a cuboid bell
    float domeMask = 1.0 - uBox * 0.9;
    // --- exumbrella ornaments ---
    // radial canal stripes across the upper dome (Chrysaora-style)
    float stripes = pow(abs(sin(ang * 8.0 + 0.4)), 6.0) * smoothstep(0.95, 0.5, rad) * smoothstep(0.18, 0.45, rad);
    col += uColorOrgan * stripes * 0.4 * domeMask;
    // fine granular speckle (wart-like texture on the dome)
    float speck = sin(vLocal.x * 41.0) * sin(vLocal.y * 37.0 + 2.0) * sin(vLocal.z * 43.0 + 4.0);
    speck = smoothstep(0.5, 0.95, speck);
    col += uColorGlow * speck * 0.14 * domeMask;
    // scalloped luminous band along the rim (lappet margin)
    float rimBand = smoothstep(0.3, 0.02, vLocal.y);
    float scallop = 0.5 + 0.5 * sin(ang * 28.0 + uTime * 0.5);
    col += uColorGlow * rimBand * (0.12 + 0.28 * scallop) * domeMask;

    // --- Halitrephes "firework" canals: a symmetric radial starburst that
    // only ignites where light reaches it (multiplied by fresnel+glow) ---
    float fw = 0.0;
    if (uFireworks > 0.001) {
      float spokes = pow(abs(cos(ang * 13.5)), 20.0); // ~27 non-branching canals
      float reach = smoothstep(0.03, 0.32, rad) * smoothstep(1.05, 0.4, rad);
      fw = spokes * reach;
      float hub = smoothstep(0.18, 0.0, rad);
      float lit = 0.35 + 0.65 * fresnel + uGlowBoost;
      col += uColorCanal * fw * 1.5 * uFireworks * lit;
      col += mix(uColorCanal, uColorGlow, 0.4) * hub * (0.8 + 0.5 * pulse) * uFireworks;
    }

    // --- Chirodectes maculate spotting: dark cell-noise blotches with a
    // faintly reddish rim, scattered across the box bell ---
    float spotDark = 0.0;
    if (uSpots > 0.001) {
      float n = dn_noise(vLocal * 6.5 + 11.0);
      float blob = smoothstep(0.60, 0.70, n);
      float ring = smoothstep(0.55, 0.60, n) * (1.0 - smoothstep(0.66, 0.72, n));
      spotDark = blob * uSpots;
      col = mix(col, col * 0.22, spotDark);
      col += uColorOrgan * ring * 0.45 * uSpots;
    }

    float alpha = 0.16 + fresnel * 0.6 + organ * 0.35
                + (stripes * 0.12 + speck * 0.06 + rimBand * scallop * 0.14) * domeMask
                + fw * 0.55 * uFireworks + spotDark * 0.32;

    // bell opacity: lift the body fill toward its own colour and push the alpha
    // toward a solid, milky dome. 0 keeps the natural glass; 1 is near-opaque.
    if (uBellOpacity > 0.001) {
      col = mix(col, mix(col, uColorBell, 0.55) + uColorBell * 0.12, uBellOpacity);
      alpha += uBellOpacity * 0.72 * (1.0 - alpha);
    }
    float cap = mix(0.92, 1.0, uBellOpacity);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, cap));
  }
`

const STRAND_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  uniform float uAmp;
  uniform float uArm;
  uniform mat3 uLagMat;
  uniform vec3 uVelLocal;
  uniform float uTipOrb;
  attribute float aAngle;
  attribute float aRadius;
  attribute float aLen;
  attribute float aPhase;
  attribute float aThick;
  varying float vT;
  varying float vPhase;
  varying float vKick;
  varying vec2 vUv;
  ${GLSL_GESTURE}
  ${GLSL_BELLWAVE}
  void main() {
    float t = -position.y; // 0 at bell attachment, 1 at tip
    vT = t;
    vPhase = aPhase;
    vUv = uv;

    // gesture envelope, delayed down the strand and de-phased per strand:
    // slow build, long decay, low sustain — a gesture, not a snap.
    // runs at HALF the pulse rate: the body pulses, the limbs phrase.
    float cyc = uPulse / 12.5663706;
    float kick = gestureEnv(cyc - t * 0.24 - aPhase * 0.045);
    vKick = kick;

    vec3 p;
    // tip-glow trait: the last stretch swells into a luminous bulb
    float taper = 1.0 - t * 0.72 + uTipOrb * smoothstep(0.86, 1.0, t) * 2.6;
    p.x = position.x * aThick * taper;
    p.z = position.z * aThick * taper;
    p.y = position.y * aLen;

    // extension as the gesture builds — a touch more expressive
    p.y *= 1.0 + 0.14 * kick;

    // whip-like sway: waves PROPAGATE base → tip (negative t phase) and,
    // like a real free-hanging strand, amplitude GROWS toward the tip —
    // the energy meets less mass, not more resistance. Higher spatial
    // frequency gives multiple S-curves along the strand (articulation).
    float swayAmp = 1.0 - 0.25 * kick;
    float reach = t * t * 1.5 + t * 0.15;
    float w1 = sin(uTime * 1.05 + aPhase - t * 7.0);
    float w2 = cos(uTime * 0.71 + aPhase * 1.71 - t * 5.2);
    float w3 = sin(uTime * 0.43 + aPhase * 2.3 - t * 3.0);
    p.x += (w1 * 0.42 + w3 * 0.34) * reach * swayAmp;
    p.z += (w2 * 0.42 + w3 * 0.26) * reach * swayAmp;

    // free-end flail: a faster wave that only the last third really feels,
    // energized by the gesture as it arrives at the tip
    float flail = t * t * t * (0.5 + 0.9 * kick);
    p.x += sin(uTime * 1.35 + aPhase * 3.1 - t * 9.5) * flail * 0.8;
    p.z += cos(uTime * 1.18 + aPhase * 2.6 - t * 8.3) * flail * 0.6;

    // gather-and-release: mid-strand curls toward the axis as the gesture
    // peaks, then flows back out through the release
    float curl = kick * sin(t * 3.14159) * 0.42;
    p.x -= cos(aAngle) * curl;
    p.z -= sin(aAngle) * curl;

    // oral-arm frill: the ribbon's edges flutter and the whole band twists
    // gently — real oral arms are ruffled curtains, not straps
    float edgeSide = (uv.x - 0.5) * 2.0;
    p.x += sin(t * 20.0 + uTime * 1.4 + aPhase * 2.0) * 0.07 * t * uArm;
    p.z += edgeSide * sin(t * 13.0 + uTime * 1.1 + aPhase) * 0.06 * uArm;

    // radiate each arm ribbon outward around the axis
    float ca = cos(aAngle);
    float sa = sin(aAngle);
    p.xz = mat2(ca, -sa, sa, ca) * p.xz;

    // loose anchor: the root ANGLE deflects easily — slow waves tilt the
    // whole strand axis linearly from the anchor point
    float tiltX = sin(uTime * 0.55 + aPhase * 1.9) * 0.20 + cos(uTime * 0.34 + aPhase) * 0.12;
    float tiltZ = cos(uTime * 0.47 + aPhase * 1.6) * 0.20 + sin(uTime * 0.29 + aPhase * 2.2) * 0.12;
    p.x += tiltX * t;
    p.z += tiltZ * t;

    // hydrodynamic drag: linear term leans the root, quadratic drags the tip.
    // water is dense, the strand is light — it resists being carried
    p -= uVelLocal * (t * 0.6 + t * t * 1.35);

    // attach to bell rim — the attachment ring breathes with the EXACT
    // asymmetric contraction the bell rim shader applies (same bellWave),
    // so bell and tentacle roots stay physically welded. The falloff runs
    // PAST zero (1 - 1.3t): the tips counter-swing against the mouth,
    // a subtle whip-lash as the funnel closes.
    float rimWave = bellWave(uPulse - t * 3.5);
    float rimFollow = 1.0 - uAmp * rimWave * (1.0 - t * 1.3);
    p.x += cos(aAngle) * aRadius * rimFollow;
    p.z += sin(aAngle) * aRadius * rimFollow;
    p.y += 0.02;

    // rotational drag: the water is dense, the strand is light. The bell's
    // turn (yaw AND tilt) reaches the strand as a cascade — the root is
    // welded to the rim (follows the bell now), while points further down
    // still live in the bell's RECENT PAST orientation (uLagMat), with a
    // quadratic weight so the tip sweeps farthest behind and folds anywhere
    // along its length.
    vec3 lagged = uLagMat * p;
    float lw = clamp(t * 0.25 + t * t * 0.75, 0.0, 1.0);
    p = mix(p, lagged, lw * 0.92);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const STRAND_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uArm;
  uniform float uTipOrb;
  uniform vec3 uColorTent;
  uniform vec3 uColorGlow;
  uniform float uGlowBoost;
  varying float vT;
  varying float vPhase;
  varying float vKick;
  varying vec2 vUv;
  void main() {
    // bioluminescent shimmer traveling down the strand
    float shimmer = 0.5 + 0.5 * sin(uTime * 2.6 + vPhase * 2.0 - vT * 9.0);
    vec3 col = mix(uColorTent, uColorGlow, shimmer * 0.6 + uGlowBoost * 0.4);
    // the gesture breathes light into the strand (re-zeroed above sustain)
    float gest = max(0.0, (vKick - 0.05) / 0.95);
    col += uColorGlow * gest * 0.4;
    // faint banding along thin tentacles (stinging-cell texture)
    col *= 1.0 - 0.14 * (0.5 + 0.5 * sin(vUv.y * 90.0 + vPhase * 3.0)) * (1.0 - uArm);
    float alpha = (0.55 * (1.0 - vT) + 0.12) * (0.75 + 0.25 * shimmer) * (1.0 + 0.25 * gest);

    // oral arms: ruffled curtain — opaque fleshy core, lacy luminous edges,
    // fine longitudinal striations
    float edgeMask = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
    float frill = 0.62 + 0.38 * sin(vUv.y * 64.0 - uTime * 1.7 + sin(vUv.x * 9.0) * 2.2);
    float striate = 0.78 + 0.22 * sin(vUv.x * 30.0 + vUv.y * 4.0);
    vec3 armCol = mix(uColorTent * 1.25, uColorGlow, 0.25 + 0.35 * frill) * striate;
    armCol += uColorGlow * (1.0 - edgeMask) * 0.3; // rims catch the light
    float armAlpha = (0.42 + 0.4 * edgeMask) * frill * (1.0 - vT * 0.5) * (1.0 + 0.2 * gest);

    col = mix(col, armCol, uArm);
    float a = mix(alpha, armAlpha, uArm);

    // tip-glow trait: the bulb burns like a lantern, breathing slowly
    float bead = smoothstep(0.86, 0.97, vT) * uTipOrb * (1.0 - uArm);
    col += uColorGlow * bead * (1.1 + 0.7 * sin(uTime * 1.8 + vPhase * 3.0));
    a += bead * 0.55;

    gl_FragColor = vec4(col, a);
  }
`

interface JellyBodyProps {
  palette: JellyPalette
  tentacles?: number
  oralArms?: number
  seed?: number
  /** character-maker anatomy dials (multipliers around 1) */
  bellWidth?: number
  bellHeight?: number
  tentacleLen?: number
  /** 0..1 — luminous bulbs at the tentacle tips */
  tipGlow?: number
  /** orbiting plankton mote ring */
  aura?: boolean
  /** ---- extended anatomy (real-species silhouettes) ---- */
  /** 0 = natural translucent glass, 1 = solid milky bell */
  bellOpacity?: number
  bellShape?: "dome" | "box"
  /** 0..1 — radiating firework canals (Halitrephes) */
  fireworks?: number
  /** colour of the firework canals; defaults to organ */
  canalColor?: string
  /** 0..1 — maculate dark spotting (Chirodectes) */
  spots?: number
  /** >0 gathers tentacles into N corner/lobe bundles (box=4, mane=8) */
  pedalia?: number
  /** ribbon oral-arm size multiplier (Stygiomedusa) */
  oralArmScale?: number
  /** 0..1 — finer/denser lion's-mane threads (Cyanea) */
  mane?: number
}

function seededRand(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const JellyBody = forwardRef<JellyBodyHandle, JellyBodyProps>(function JellyBody(
  {
    palette,
    tentacles = 28,
    oralArms = 4,
    seed = 1,
    bellWidth = 1,
    bellHeight = 1,
    tentacleLen = 1,
    tipGlow = 0,
    aura = false,
    bellOpacity = 0,
    bellShape = "dome",
    fireworks = 0,
    canalColor,
    spots = 0,
    pedalia = 0,
    oralArmScale = 1,
    mane = 0,
  },
  ref
) {
  const bellGeometry = useMemo(
    () => (bellShape === "box" ? makeBoxBellGeometry(bellWidth, bellHeight) : makeBellGeometry(bellWidth, bellHeight)),
    [bellShape, bellWidth, bellHeight]
  )

  const shared = useMemo<JellyUniforms>(
    () => ({
      time: { value: 0 },
      phase: { value: 0 },
      amp: { value: 0.14 },
      velLocal: { value: new THREE.Vector3() },
      glowBoost: { value: 0 },
      lagMat: { value: new THREE.Matrix3() },
    }),
    []
  )

  useImperativeHandle(ref, () => ({ uniforms: shared }), [shared])

  const bellMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: BELL_VERT,
      fragmentShader: BELL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: shared.time,
        uPhase: shared.phase,
        uAmp: shared.amp,
        uGlowBoost: shared.glowBoost,
        uBox: { value: bellShape === "box" ? 1 : 0 },
        uBellOpacity: { value: bellOpacity },
        uFireworks: { value: fireworks },
        uSpots: { value: spots },
        uColorBell: { value: new THREE.Color(palette.bell) },
        uColorGlow: { value: new THREE.Color(palette.glow) },
        uColorOrgan: { value: new THREE.Color(palette.organ) },
        uColorCanal: { value: new THREE.Color(canalColor ?? palette.organ) },
      },
    })
  }, [palette, shared, bellShape, bellOpacity, fireworks, spots, canalColor])

  const strandMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: STRAND_VERT,
      fragmentShader: STRAND_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: shared.time,
        uPulse: shared.phase,
        uAmp: shared.amp,
        uArm: { value: 0 },
        uTipOrb: { value: tipGlow },
        uLagMat: shared.lagMat,
        uVelLocal: shared.velLocal,
        uGlowBoost: shared.glowBoost,
        uColorTent: { value: new THREE.Color(palette.tentacle) },
        uColorGlow: { value: new THREE.Color(palette.glow) },
      },
    })
  }, [palette, shared, tipGlow])

  // thin trailing tentacles
  const tentacleGeometry = useMemo(() => {
    // 48 height segments: the strand can fold at any point of its length
    const geo = new THREE.CylinderGeometry(1, 0.45, 1, 5, 48, true)
    geo.translate(0, -0.5, 0)
    const inst = new THREE.InstancedBufferGeometry()
    inst.index = geo.index
    inst.attributes = geo.attributes
    const rand = seededRand(seed * 7919 + 13)
    const angle = new Float32Array(tentacles)
    const radius = new Float32Array(tentacles)
    const len = new Float32Array(tentacles)
    const phase = new Float32Array(tentacles)
    const thick = new Float32Array(tentacles)
    // box corners are tighter fans farther out; lion's-mane lobes are broader
    const clusterSpread = pedalia === 4 ? 0.55 : 0.8
    const clusterRadius = pedalia === 4 ? 1.12 : 0.86
    for (let i = 0; i < tentacles; i++) {
      if (pedalia > 0) {
        // gather strands into N bundles (pedalia corners / mane lobes)
        const cluster = i % pedalia
        const clusterAng = (cluster / pedalia) * Math.PI * 2 + Math.PI / pedalia
        angle[i] = clusterAng + (rand() - 0.5) * clusterSpread
        radius[i] = clusterRadius + rand() * 0.1
      } else {
        angle[i] = (i / tentacles) * Math.PI * 2 + rand() * 0.2
        radius[i] = 0.82 + rand() * 0.12
      }
      // longer strands: the bigger wave amplitude eats projected length.
      // a mane runs longer and more varied — some threads stream far past the rest
      len[i] = (3.4 + rand() * 3.0) * tentacleLen * (mane > 0 ? 1.0 + rand() * 0.9 : 1.0)
      phase[i] = rand() * Math.PI * 2
      // mane threads are finer and more uniform; default strands stay chunkier
      thick[i] = mane > 0 ? 0.007 + rand() * 0.008 : 0.014 + rand() * 0.016
    }
    inst.setAttribute("aAngle", new THREE.InstancedBufferAttribute(angle, 1))
    inst.setAttribute("aRadius", new THREE.InstancedBufferAttribute(radius, 1))
    inst.setAttribute("aLen", new THREE.InstancedBufferAttribute(len, 1))
    inst.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1))
    inst.setAttribute("aThick", new THREE.InstancedBufferAttribute(thick, 1))
    inst.instanceCount = tentacles
    return inst
  }, [tentacles, seed, tentacleLen, pedalia, mane])

  // wide frilly oral arms under the dome — fleshy ruffled curtains.
  // oralArmScale blows them up into the giant ribbon "banners" of Stygiomedusa.
  const armGeometry = useMemo(() => {
    // more length segments on giant arms so the long ribbon can undulate
    const lenSegs = oralArmScale > 1.6 ? 64 : 40
    const geo = new THREE.PlaneGeometry(0.36 * oralArmScale, 1, 6, lenSegs)
    geo.translate(0, -0.5, 0)
    const inst = new THREE.InstancedBufferGeometry()
    inst.index = geo.index
    inst.attributes = geo.attributes
    const rand = seededRand(seed * 104729 + 41)
    const angle = new Float32Array(oralArms)
    const radius = new Float32Array(oralArms)
    const len = new Float32Array(oralArms)
    const phase = new Float32Array(oralArms)
    const thick = new Float32Array(oralArms)
    for (let i = 0; i < oralArms; i++) {
      angle[i] = (i / oralArms) * Math.PI * 2 + 0.4
      radius[i] = 0.18 + rand() * 0.08
      len[i] = (2.5 + rand() * 1.2) * oralArmScale
      phase[i] = rand() * Math.PI * 2
      thick[i] = 1.0 // plane already has width; thickness scales x/z
    }
    inst.setAttribute("aAngle", new THREE.InstancedBufferAttribute(angle, 1))
    inst.setAttribute("aRadius", new THREE.InstancedBufferAttribute(radius, 1))
    inst.setAttribute("aLen", new THREE.InstancedBufferAttribute(len, 1))
    inst.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1))
    inst.setAttribute("aThick", new THREE.InstancedBufferAttribute(thick, 1))
    inst.instanceCount = oralArms
    return inst
  }, [oralArms, seed, oralArmScale])

  const armMaterial = useMemo(() => {
    const m = strandMaterial.clone()
    m.side = THREE.DoubleSide
    m.uniforms.uTime = shared.time
    m.uniforms.uPulse = shared.phase
    m.uniforms.uAmp = shared.amp
    m.uniforms.uArm.value = 1
    m.uniforms.uTipOrb.value = 0 // arms never grow bulbs
    m.uniforms.uLagMat = shared.lagMat
    m.uniforms.uVelLocal = shared.velLocal
    m.uniforms.uGlowBoost = shared.glowBoost
    return m
  }, [strandMaterial, shared])

  const organMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(palette.organ),
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [palette]
  )

  // aura trait: a veil of plankton motes orbiting the bell on tilted shells
  const auraGeometry = useMemo(() => {
    if (!aura) return null
    const N = 72
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const seedAttr = new Float32Array(N)
    const rnd = seededRand(seed * 31 + 5)
    for (let i = 0; i < N; i++) {
      const r = 1.5 + rnd() * 1.1
      const a = rnd() * Math.PI * 2
      const y = (rnd() - 0.35) * 1.6
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = Math.sin(a) * r
      seedAttr[i] = rnd() * Math.PI * 2
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seedAttr, 1))
    return geo
  }, [aura, seed])

  const auraMaterial = useMemo(() => {
    if (!aura) return null
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: shared.time,
        uColor: { value: new THREE.Color(palette.glow) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aSeed;
        varying float vBlink;
        void main() {
          vec3 p = position;
          float a = uTime * (0.25 + fract(aSeed) * 0.2) + aSeed;
          float ca = cos(a); float sa = sin(a);
          p.xz = mat2(ca, -sa, sa, ca) * p.xz;
          p.y += sin(uTime * 0.7 + aSeed * 3.0) * 0.25;
          vBlink = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * 1.3 + aSeed * 5.0), 2.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 26.0 / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vBlink;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vBlink * 0.7;
          gl_FragColor = vec4(uColor * 1.5 * a, a);
        }
      `,
    })
  }, [aura, palette, shared])

  return (
    <group>
      <mesh geometry={bellGeometry} material={bellMaterial} />
      <mesh geometry={tentacleGeometry as unknown as THREE.BufferGeometry} material={strandMaterial} frustumCulled={false} />
      <mesh geometry={armGeometry as unknown as THREE.BufferGeometry} material={armMaterial} frustumCulled={false} />
      {/* glowing gonad cluster inside the dome */}
      <group position={[0, 0.32, 0]}>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28]} material={organMaterial}>
              <sphereGeometry args={[0.09, 10, 8]} />
            </mesh>
          )
        })}
      </group>
      {aura && auraGeometry && auraMaterial && (
        <points geometry={auraGeometry} material={auraMaterial} frustumCulled={false} />
      )}
    </group>
  )
})

export default JellyBody
