"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { ocean, WORLD, valueNoise2 } from "@/lib/ocean"
import { registerTurtlePosition } from "@/lib/game"

// ---------------------------------------------------------------------------
// Sea turtles — megafauna layer 2. Two green turtles cruise the mid-water
// (6–20 m) on smooth noise-driven wander paths. The body is a small jointed
// hierarchy (shell, head, four flippers) animated on the CPU: front flippers
// row with a slow underwater "flight" stroke, rear flippers trail as rudders.
// Forward axis is +Z, same convention as the mantas.
// ---------------------------------------------------------------------------

interface TurtlePath {
  seed: number
  baseY: number
  range: number // horizontal wander half-extent
  speed: number // cruise m/s
  flapHz: number
  scale: number
  phase: number
}

const PATHS: TurtlePath[] = [
  { seed: 11.3, baseY: -9, range: 55, speed: 1.15, flapHz: 0.38, scale: 1.0, phase: 0 },
  { seed: 47.9, baseY: -17, range: 65, speed: 0.9, flapHz: 0.32, scale: 1.3, phase: 2.6 },
]

// live positions — dev-console access + the escort mission
export const turtlePositions: THREE.Vector3[] = PATHS.map(() => new THREE.Vector3())
if (typeof window !== "undefined") {
  ;(window as unknown as { __turtle: THREE.Vector3[] }).__turtle = turtlePositions
}

const CARAPACE = "#4f6b46"
const CARAPACE_RIM = "#3a5236"
const SKIN = "#8aa06a"
const PLASTRON = "#d8cfa8"

function Turtle({ path, index }: { path: TurtlePath; index: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const flipperFL = useRef<THREE.Group>(null)
  const flipperFR = useRef<THREE.Group>(null)
  const flipperBL = useRef<THREE.Group>(null)
  const flipperBR = useRef<THREE.Group>(null)
  const headRef = useRef<THREE.Group>(null)

  const state = useMemo(() => {
    const angle = path.phase * 2.4
    return {
      pos: new THREE.Vector3(Math.cos(angle) * 30, path.baseY, Math.sin(angle) * 30),
      vel: new THREE.Vector3(0.5, 0, 0.5),
    }
  }, [path])

  const scratch = useMemo(
    () => ({
      target: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      euler: new THREE.Euler(0, 0, 0, "YXZ"),
      push: new THREE.Vector3(),
    }),
    []
  )

  useFrame((frameState, dt) => {
    const group = groupRef.current
    if (!group) return
    const delta = Math.min(dt, 0.05)
    const t = frameState.clock.elapsedTime
    const s = scratch
    const p = path
    const st = state

    // --- noise-driven wander target (smooth, no waypoint pops) ---
    const nt = t * 0.021 + p.phase
    s.target.set(
      (valueNoise2(p.seed + nt, p.seed) - 0.5) * 2 * p.range,
      p.baseY + (valueNoise2(p.seed, p.seed + nt) - 0.5) * 9,
      (valueNoise2(p.seed + 31.7, p.seed + nt) - 0.5) * 2 * p.range
    )

    // steer: accelerate toward the target, clamp to cruise speed
    s.dir.copy(s.target).sub(st.pos)
    const dist = s.dir.length()
    if (dist > 0.01) {
      s.dir.divideScalar(dist)
      st.vel.addScaledVector(s.dir, 0.5 * delta)
    }
    st.vel.multiplyScalar(Math.max(0, 1 - 0.35 * delta))
    const speed = st.vel.length()
    if (speed > p.speed) st.vel.multiplyScalar(p.speed / speed)
    st.pos.addScaledVector(st.vel, delta)

    // stay inside the world and off the terrain
    st.pos.y = THREE.MathUtils.clamp(st.pos.y, -26, -5)
    const r = Math.hypot(st.pos.x, st.pos.z)
    const maxR = WORLD.bounds * 0.9
    if (r > maxR) {
      st.pos.x *= maxR / r
      st.pos.z *= maxR / r
    }
    group.position.copy(st.pos)
    registerTurtlePosition(index, st.pos)
    turtlePositions[index].copy(st.pos)

    // --- orientation: nose along the velocity, gentle banked turns ---
    if (speed > 0.05) {
      const yaw = Math.atan2(st.vel.x, st.vel.z)
      const pitch = Math.atan2(-st.vel.y, Math.hypot(st.vel.x, st.vel.z)) * 0.7
      // bank into the turn: compare heading now vs a moment ago via angular vel proxy
      s.euler.set(pitch, yaw, Math.sin(t * 0.5 + p.phase) * 0.06)
      s.quat.setFromEuler(s.euler)
      group.quaternion.slerp(s.quat, 1 - Math.exp(-1.6 * delta))
    }

    // --- flipper choreography: slow underwater flight ---
    const w = t * p.flapHz * Math.PI * 2 + p.phase
    const stroke = Math.sin(w)
    const twist = Math.sin(w - 0.8) * 0.45
    if (flipperFL.current) {
      flipperFL.current.rotation.z = 0.35 + stroke * 0.75
      flipperFL.current.rotation.y = twist * 0.4
    }
    if (flipperFR.current) {
      flipperFR.current.rotation.z = -0.35 - stroke * 0.75
      flipperFR.current.rotation.y = -twist * 0.4
    }
    // rear flippers trail with a lazy half-tempo rudder sway
    const rear = Math.sin(w * 0.5 - 1.2) * 0.3
    if (flipperBL.current) flipperBL.current.rotation.z = 0.2 + rear
    if (flipperBR.current) flipperBR.current.rotation.z = -0.2 - rear
    // the head bobs faintly with the stroke effort
    if (headRef.current) headRef.current.rotation.x = Math.sin(w - 0.5) * 0.08

    // --- soft contact push, same rule as mantas/NPCs ---
    const reach = 2.6 * p.scale
    const dSq = st.pos.distanceToSquared(ocean.playerPos)
    if (dSq < reach * reach && dSq > 0.0001) {
      const d = Math.sqrt(dSq)
      s.push.copy(ocean.playerPos).sub(st.pos).divideScalar(d)
      ocean.playerVel.addScaledVector(s.push, (1 - d / reach) * 4 * delta)
    }
  })

  const sc = path.scale
  return (
    <group ref={groupRef} scale={sc}>
      {/* carapace — flattened dome with a darker rim */}
      <mesh scale={[1.0, 0.42, 1.3]}>
        <sphereGeometry args={[1, 24, 18]} />
        <meshStandardMaterial color={CARAPACE} roughness={0.7} metalness={0.05} />
      </mesh>
      <mesh scale={[1.06, 0.3, 1.36]} position={[0, -0.06, 0]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color={CARAPACE_RIM} roughness={0.8} />
      </mesh>
      {/* plastron */}
      <mesh scale={[0.82, 0.28, 1.1]} position={[0, -0.18, 0]}>
        <sphereGeometry args={[1, 18, 12]} />
        <meshStandardMaterial color={PLASTRON} roughness={0.9} />
      </mesh>
      {/* head on a short neck */}
      <group ref={headRef} position={[0, 0.02, 1.28]}>
        <mesh position={[0, 0, 0.18]} scale={[0.3, 0.26, 0.4]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.75} />
        </mesh>
      </group>
      {/* front flippers — long airfoil paddles, pivoted at the shoulder */}
      <group ref={flipperFL} position={[0.85, -0.05, 0.55]}>
        <mesh position={[0.75, 0, 0]} rotation={[0, 0, -0.15]} scale={[0.85, 0.09, 0.32]}>
          <sphereGeometry args={[1, 16, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.75} />
        </mesh>
      </group>
      <group ref={flipperFR} position={[-0.85, -0.05, 0.55]}>
        <mesh position={[-0.75, 0, 0]} rotation={[0, 0, 0.15]} scale={[0.85, 0.09, 0.32]}>
          <sphereGeometry args={[1, 16, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.75} />
        </mesh>
      </group>
      {/* rear flippers — short rudders */}
      <group ref={flipperBL} position={[0.55, -0.08, -0.95]}>
        <mesh position={[0.3, 0, -0.12]} rotation={[0, 0.5, 0]} scale={[0.4, 0.07, 0.22]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} />
        </mesh>
      </group>
      <group ref={flipperBR} position={[-0.55, -0.08, -0.95]}>
        <mesh position={[-0.3, 0, -0.12]} rotation={[0, -0.5, 0]} scale={[0.4, 0.07, 0.22]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.8} />
        </mesh>
      </group>
    </group>
  )
}

export default function SeaTurtles() {
  return (
    <>
      {PATHS.map((p, i) => (
        <Turtle key={i} path={p} index={i} />
      ))}
    </>
  )
}
