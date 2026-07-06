"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { ocean } from "@/lib/ocean"

// ---------------------------------------------------------------------------
// Manta rays — megafauna layer 1. Three mantas glide on wide, slow circuits
// through the sunlit/twilight column. The wing flap is a vertex-shader wave
// travelling outward along the span (root leads, tips lag), injected into a
// MeshStandardMaterial so scene fog and depth lighting come for free.
// Forward axis of the model is +Z; motion code orients with yaw/pitch/roll.
// ---------------------------------------------------------------------------

const SPAN = 7.4 // wingtip to wingtip, before per-manta scale
const HALF_SPAN = SPAN / 2

function buildMantaGeometry(): THREE.BufferGeometry {
  const SPAN_SEGS = 64
  const CHORD_SEGS = 14
  const chord0 = 3.1
  const sweep = 2.7
  const tailLen = 3.6

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let iu = 0; iu <= SPAN_SEGS; iu++) {
    const u = (iu / SPAN_SEGS) * 2 - 1 // -1..1 across the span
    const au = Math.abs(u)
    const x = u * HALF_SPAN
    // leading edge sweeps back toward the tips; nose sits at z ≈ +1.3
    const lead = 1.3 - sweep * Math.pow(au, 1.5)
    // chord shrinks toward the tips; a narrow spike at the center is the tail
    const chord =
      chord0 * (1 - 0.74 * Math.pow(au, 1.15)) +
      tailLen * Math.pow(Math.max(0, 1 - au / 0.05), 2)
    for (let iv = 0; iv <= CHORD_SEGS; iv++) {
      const v = iv / CHORD_SEGS // 0 = leading edge, 1 = trailing edge
      const z = lead - v * chord
      // body camber: a low hump over the center that fades to flat wingtips
      const y = 0.34 * Math.pow(1 - au, 2.2) * Math.sin(Math.PI * Math.min(v * 1.35, 1))
      positions.push(x, y, z)
      uvs.push((u + 1) / 2, v)
    }
  }

  const row = CHORD_SEGS + 1
  for (let iu = 0; iu < SPAN_SEGS; iu++) {
    for (let iv = 0; iv < CHORD_SEGS; iv++) {
      const a = iu * row + iv
      const b = (iu + 1) * row + iv
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

interface MantaPath {
  cx: number
  cz: number
  radius: number
  omega: number // signed — sign sets circling direction and bank side
  baseY: number
  bobAmp: number
  bobHz: number
  phase: number
  flapHz: number
  scale: number
}

const PATHS: MantaPath[] = [
  { cx: 12, cz: -8, radius: 30, omega: 0.085, baseY: -12, bobAmp: 2.6, bobHz: 0.11, phase: 0.0, flapHz: 0.42, scale: 1.0 },
  { cx: -20, cz: 18, radius: 40, omega: -0.06, baseY: -24, bobAmp: 3.4, bobHz: 0.08, phase: 2.1, flapHz: 0.36, scale: 1.35 },
  { cx: 5, cz: 30, radius: 22, omega: 0.11, baseY: -8, bobAmp: 1.8, bobHz: 0.14, phase: 4.2, flapHz: 0.5, scale: 0.8 },
]

const DORSAL = new THREE.Color("#26343f")
const VENTRAL = new THREE.Color("#dbe8ec")

// live positions — dev-console access + future spotting missions
export const mantaPositions: THREE.Vector3[] = PATHS.map(() => new THREE.Vector3())
const mantaMeshes: (THREE.Mesh | null)[] = PATHS.map(() => null)
if (typeof window !== "undefined") {
  const w = window as unknown as { __manta: THREE.Vector3[]; __mantaMesh: (THREE.Mesh | null)[] }
  w.__manta = mantaPositions
  w.__mantaMesh = mantaMeshes
}

function Manta({ path, geometry, index }: { path: MantaPath; geometry: THREE.BufferGeometry; index: number }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPhase: { value: path.phase } }), [path.phase])

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: DORSAL,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime
      shader.uniforms.uPhase = uniforms.uPhase
      shader.uniforms.uFlapHz = { value: path.flapHz }
      shader.vertexShader =
        `
        uniform float uTime;
        uniform float uPhase;
        uniform float uFlapHz;
        ` +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          /* glsl */ `
          #include <begin_vertex>
          {
            float su = position.x / ${HALF_SPAN.toFixed(3)};
            float au = abs(su);
            float w = uTime * uFlapHz * 6.2831853 + uPhase;
            // travelling wave: wing root leads, tips lag behind
            float flap = sin(w - au * 2.3);
            transformed.y += flap * 1.35 * pow(au, 1.35) * ${HALF_SPAN.toFixed(3)} * 0.45;
            // chord-wise lag: trailing edge follows the leading edge
            transformed.y += sin(w - au * 2.3 - 1.1) * 0.30 * pow(au, 1.1) * uv.y;
            // tail whip (center spike of the grid, uv.y deep)
            transformed.x += sin(w * 0.5 + uv.y * 4.0) * 0.10 * uv.y * (1.0 - au);
          }
          `
        )
      shader.fragmentShader =
        `
        uniform vec3 uVentral;
        ` +
        shader.fragmentShader.replace(
          "#include <color_fragment>",
          /* glsl */ `
          #include <color_fragment>
          // countershading: slate dorsal / pale ventral, white shoulder patches
          if (!gl_FrontFacing) {
            diffuseColor.rgb = uVentral;
          } else {
            float shoulder = smoothstep(0.18, 0.02, abs(vMantaUv.x - 0.38) + vMantaUv.y * 0.55)
                           + smoothstep(0.18, 0.02, abs(vMantaUv.x - 0.62) + vMantaUv.y * 0.55);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.82, 0.85), clamp(shoulder, 0.0, 1.0) * 0.45);
          }
          `
        )
      shader.uniforms.uVentral = { value: VENTRAL }
      // pipe the uv through for the shoulder-patch mask
      shader.vertexShader = shader.vertexShader
        .replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\nvarying vec2 vMantaUv;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMantaUv = uv;")
      shader.fragmentShader = shader.fragmentShader.replace(
        "uniform vec3 uVentral;",
        "uniform vec3 uVentral;\nvarying vec2 vMantaUv;"
      )
    }
    return mat
  }, [uniforms, path.flapHz])

  const scratch = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      euler: new THREE.Euler(0, 0, 0, "YXZ"),
      quat: new THREE.Quaternion(),
      push: new THREE.Vector3(),
    }),
    []
  )

  useFrame((state, dt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const delta = Math.min(dt, 0.05)
    const t = state.clock.elapsedTime
    const s = scratch
    const p = path

    const theta = p.phase + t * p.omega
    s.pos.set(
      p.cx + Math.cos(theta) * p.radius,
      p.baseY + Math.sin(t * p.bobHz * Math.PI * 2 + p.phase) * p.bobAmp,
      p.cz + Math.sin(theta) * p.radius
    )
    // tangent velocity of the circular path
    const vx = -Math.sin(theta) * p.radius * p.omega
    const vz = Math.cos(theta) * p.radius * p.omega
    const vy = Math.cos(t * p.bobHz * Math.PI * 2 + p.phase) * p.bobAmp * p.bobHz * Math.PI * 2
    const hSpeed = Math.hypot(vx, vz)

    // orientation: yaw along the tangent, pitch into climbs/dives,
    // banked roll into the turn (inner wing drops, like a real glider)
    s.euler.set(
      Math.atan2(-vy, hSpeed) * 0.6,
      Math.atan2(vx, vz),
      -Math.sign(p.omega) * 0.38
    )
    s.quat.setFromEuler(s.euler)
    mesh.position.copy(s.pos)
    mesh.quaternion.slerp(s.quat, 1 - Math.exp(-2.5 * delta))

    // a manta is a wall of moving water — soft-push the player out of it
    const reach = 4.2 * p.scale
    const dSq = s.pos.distanceToSquared(ocean.playerPos)
    if (dSq < reach * reach && dSq > 0.0001) {
      const d = Math.sqrt(dSq)
      s.push.copy(ocean.playerPos).sub(s.pos).divideScalar(d)
      ocean.playerVel.addScaledVector(s.push, (1 - d / reach) * 6 * delta)
    }

    uniforms.uTime.value = t
    mantaPositions[index].copy(s.pos)
    mantaMeshes[index] = mesh
  })

  return <mesh ref={meshRef} geometry={geometry} material={material} scale={path.scale} frustumCulled={false} />
}

export default function MantaRays() {
  const geometry = useMemo(() => buildMantaGeometry(), [])
  return (
    <>
      {PATHS.map((p, i) => (
        <Manta key={i} path={p} geometry={geometry} index={i} />
      ))}
    </>
  )
}
