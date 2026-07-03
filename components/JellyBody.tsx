"use client"

import { useMemo, forwardRef, useImperativeHandle } from "react"
import * as THREE from "three"

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

export const JELLY_VARIANTS: JellyPalette[] = [
  { bell: "#bfe3ff", glow: "#7fd4ff", organ: "#ffb7d9", tentacle: "#a8c6ff" }, // moon
  { bell: "#ffd2ec", glow: "#ff6fb5", organ: "#ff4d94", tentacle: "#ff9fd0" }, // rose
  { bell: "#ffe3b3", glow: "#ffb347", organ: "#ff7847", tentacle: "#ffc37f" }, // amber
  { bell: "#d9b8ff", glow: "#b06fff", organ: "#7f3fff", tentacle: "#c49fff" }, // violet
  { bell: "#8fe8d2", glow: "#3fd4a8", organ: "#2fb88f", tentacle: "#7fdcc0" }, // lagoon
  { bell: "#ff8f8f", glow: "#ff3b3b", organ: "#c41818", tentacle: "#ff6b6b" }, // abyssal red
]

export interface JellyUniforms {
  time: { value: number }
  phase: { value: number }
  amp: { value: number }
  velLocal: { value: THREE.Vector3 }
  glowBoost: { value: number }
}

export interface JellyBodyHandle {
  uniforms: JellyUniforms
}

// Bell profile: hemisphere flowing into a soft inward lip.
function makeBellGeometry(): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = []
  const N = 22
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const theta = (t * Math.PI) / 2
    // superellipse-ish rounding for a fuller, more medusa-like dome
    const r = Math.pow(Math.sin(theta), 0.85)
    const y = Math.pow(Math.cos(theta), 1.15)
    pts.push(new THREE.Vector2(r, y))
  }
  // rim lip curving slightly inward/under
  pts.push(new THREE.Vector2(1.0, -0.05))
  pts.push(new THREE.Vector2(0.93, -0.1))
  pts.push(new THREE.Vector2(0.85, -0.07))
  return new THREE.LatheGeometry(pts, 48)
}

const BELL_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uAmp;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    vec3 pos = position;
    // traveling contraction: apex (y=1) leads, rim (y<=0) follows
    float rimW = smoothstep(0.9, 0.0, position.y);
    float wave = sin(uPhase - position.y * 2.8);
    float squeeze = 1.0 + uAmp * wave * rimW;
    pos.x *= squeeze;
    pos.z *= squeeze;
    pos.y *= 1.0 - uAmp * 0.45 * wave * rimW;
    // gentle rim ruffle
    float ang = atan(position.z, position.x);
    pos.xz += normalize(position.xz + vec2(1e-4)) * 0.02 * sin(ang * 14.0 + uTime * 2.3) * rimW;

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
  uniform vec3 uColorBell;
  uniform vec3 uColorGlow;
  uniform vec3 uColorOrgan;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 2.4);

    // four-lobed gonad "flower" visible through the dome
    float ang = atan(vLocal.z, vLocal.x);
    float rad = length(vLocal.xz);
    float lobes = pow(abs(sin(ang * 2.0)), 6.0);
    float organ = lobes * smoothstep(0.75, 0.25, rad) * smoothstep(0.15, 0.55, rad);

    float pulse = 0.5 + 0.5 * sin(uPhase);
    vec3 col = mix(uColorBell * 0.35, uColorGlow, fresnel);
    col += uColorOrgan * organ * (0.55 + 0.45 * pulse);
    col += uColorGlow * uGlowBoost * (0.35 + 0.3 * pulse);

    float alpha = 0.16 + fresnel * 0.6 + organ * 0.35;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
  }
`

const STRAND_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uVelLocal;
  attribute float aAngle;
  attribute float aRadius;
  attribute float aLen;
  attribute float aPhase;
  attribute float aThick;
  varying float vT;
  varying float vPhase;
  void main() {
    float t = -position.y; // 0 at bell attachment, 1 at tip
    vT = t;
    vPhase = aPhase;

    vec3 p;
    float taper = 1.0 - t * 0.72;
    p.x = position.x * aThick * taper;
    p.z = position.z * aThick * taper;
    p.y = position.y * aLen;

    // fluid sway — two incommensurate waves traveling down the strand
    float sway1 = sin(uTime * 1.6 + aPhase + t * 5.2) * (0.10 + 0.55 * t);
    float sway2 = cos(uTime * 1.05 + aPhase * 1.71 + t * 3.6) * (0.08 + 0.42 * t);
    p.x += sway1 * t;
    p.z += sway2 * t;

    // hydrodynamic drag: strands trail opposite to motion, more at the tip
    p -= uVelLocal * (t * t) * 1.1;

    // attach to bell rim
    p.x += cos(aAngle) * aRadius;
    p.z += sin(aAngle) * aRadius;
    p.y += 0.02;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const STRAND_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorTent;
  uniform vec3 uColorGlow;
  uniform float uGlowBoost;
  varying float vT;
  varying float vPhase;
  void main() {
    // bioluminescent shimmer traveling down the strand
    float shimmer = 0.5 + 0.5 * sin(uTime * 2.6 + vPhase * 2.0 - vT * 9.0);
    vec3 col = mix(uColorTent, uColorGlow, shimmer * 0.6 + uGlowBoost * 0.4);
    float alpha = (0.55 * (1.0 - vT) + 0.12) * (0.75 + 0.25 * shimmer);
    gl_FragColor = vec4(col, alpha);
  }
`

interface JellyBodyProps {
  palette: JellyPalette
  tentacles?: number
  oralArms?: number
  seed?: number
}

function seededRand(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const JellyBody = forwardRef<JellyBodyHandle, JellyBodyProps>(function JellyBody(
  { palette, tentacles = 28, oralArms = 4, seed = 1 },
  ref
) {
  const bellGeometry = useMemo(makeBellGeometry, [])

  const shared = useMemo<JellyUniforms>(
    () => ({
      time: { value: 0 },
      phase: { value: 0 },
      amp: { value: 0.14 },
      velLocal: { value: new THREE.Vector3() },
      glowBoost: { value: 0 },
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
        uColorBell: { value: new THREE.Color(palette.bell) },
        uColorGlow: { value: new THREE.Color(palette.glow) },
        uColorOrgan: { value: new THREE.Color(palette.organ) },
      },
    })
  }, [palette, shared])

  const strandMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: STRAND_VERT,
      fragmentShader: STRAND_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: shared.time,
        uVelLocal: shared.velLocal,
        uGlowBoost: shared.glowBoost,
        uColorTent: { value: new THREE.Color(palette.tentacle) },
        uColorGlow: { value: new THREE.Color(palette.glow) },
      },
    })
  }, [palette, shared])

  // thin trailing tentacles
  const tentacleGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(1, 0.45, 1, 5, 20, true)
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
    for (let i = 0; i < tentacles; i++) {
      angle[i] = (i / tentacles) * Math.PI * 2 + rand() * 0.2
      radius[i] = 0.82 + rand() * 0.12
      len[i] = 2.6 + rand() * 2.4
      phase[i] = rand() * Math.PI * 2
      thick[i] = 0.014 + rand() * 0.016
    }
    inst.setAttribute("aAngle", new THREE.InstancedBufferAttribute(angle, 1))
    inst.setAttribute("aRadius", new THREE.InstancedBufferAttribute(radius, 1))
    inst.setAttribute("aLen", new THREE.InstancedBufferAttribute(len, 1))
    inst.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1))
    inst.setAttribute("aThick", new THREE.InstancedBufferAttribute(thick, 1))
    inst.instanceCount = tentacles
    return inst
  }, [tentacles, seed])

  // wide frilly oral arms under the dome
  const armGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.16, 1, 1, 26)
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
      len[i] = 2.0 + rand() * 1.0
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
  }, [oralArms, seed])

  const armMaterial = useMemo(() => {
    const m = strandMaterial.clone()
    m.side = THREE.DoubleSide
    m.uniforms.uTime = shared.time
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
    </group>
  )
})

export default JellyBody
