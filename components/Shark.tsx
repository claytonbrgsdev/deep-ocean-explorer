"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { ocean, WORLD, valueNoise2 } from "@/lib/ocean"
import { game, pushToast } from "@/lib/game"

// ---------------------------------------------------------------------------
// The shark — the ocean's first real danger. One patroller owns the twilight
// band (25–60 m). Finite-state hunter:
//
//   patrol → (player close + deep enough) → chase → bite | escape → cooldown
//
// The player's counterplay is vertical: the shark refuses the bright
// shallows, so fleeing toward the light (< 12 m) always breaks the chase.
// A bite costs energy and hurls the player away — dangerous, never lethal.
// Swimming is a three-joint tail wave: torso leads, rear lags, caudal snaps.
// ---------------------------------------------------------------------------

const CRUISE_SPEED = 2.1
const CHASE_SPEED = 5.4
const DETECT_RADIUS = 18
const ESCAPE_RADIUS = 28
const BITE_RADIUS = 2.4
const SAFE_DEPTH = 12 // shallower than this, the shark breaks off
const CHASE_MAX_SECONDS = 9
const COOLDOWN_SECONDS = 14
const BITE_ENERGY_COST = 26
const BITE_KNOCKBACK = 9

type SharkMode = "patrol" | "chase" | "cooldown"

export const sharkPosition = new THREE.Vector3(40, -38, -30)
export const sharkState: { mode: SharkMode } = { mode: "patrol" }
if (typeof window !== "undefined") {
  ;(window as unknown as { __shark: { pos: THREE.Vector3; state: { mode: SharkMode } } }).__shark = {
    pos: sharkPosition,
    state: sharkState,
  }
}

const HIDE = "#3d4a55" // dorsal slate-grey
const BELLY = "#c9d4d9"
const FIN = "#333f49"

export default function Shark() {
  const groupRef = useRef<THREE.Group>(null)
  const rearRef = useRef<THREE.Group>(null)
  const caudalRef = useRef<THREE.Group>(null)
  const pectoralL = useRef<THREE.Mesh>(null)
  const pectoralR = useRef<THREE.Mesh>(null)

  const st = useMemo(
    () => ({
      pos: sharkPosition,
      vel: new THREE.Vector3(-1, 0, 0.5),
      mode: "patrol" as SharkMode,
      modeT: 0,
      seed: 77.7,
      announced: false,
    }),
    []
  )

  const scratch = useMemo(
    () => ({
      target: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      euler: new THREE.Euler(0, 0, 0, "YXZ"),
      knock: new THREE.Vector3(),
    }),
    []
  )

  useFrame((frameState, dt) => {
    const group = groupRef.current
    if (!group) return
    const delta = Math.min(dt, 0.05)
    const t = frameState.clock.elapsedTime
    const s = scratch
    st.modeT += delta

    const playerDistSq = st.pos.distanceToSquared(ocean.playerPos)
    const playerDeepEnough = ocean.depth > SAFE_DEPTH

    // --- mode transitions ---
    if (st.mode === "patrol") {
      if (game.started && playerDeepEnough && playerDistSq < DETECT_RADIUS * DETECT_RADIUS) {
        st.mode = "chase"
        st.modeT = 0
        pushToast("SHARK — IT HAS YOUR SCENT", "flee toward the light — it hates the shallows")
      }
    } else if (st.mode === "chase") {
      const escaped =
        playerDistSq > ESCAPE_RADIUS * ESCAPE_RADIUS ||
        !playerDeepEnough ||
        st.modeT > CHASE_MAX_SECONDS
      if (escaped) {
        st.mode = "cooldown"
        st.modeT = 0
        game.sharkEscapes++
        pushToast("YOU LOST IT", "the grey shape sinks back into the dark")
      } else if (playerDistSq < BITE_RADIUS * BITE_RADIUS) {
        // --- bite: energy hit + knockback, then disengage ---
        st.mode = "cooldown"
        st.modeT = 0
        game.sharkHits++
        game.energy = Math.max(4, game.energy - BITE_ENERGY_COST)
        const d = Math.sqrt(Math.max(playerDistSq, 0.01))
        s.knock.copy(ocean.playerPos).sub(st.pos).divideScalar(d)
        ocean.playerVel.addScaledVector(s.knock, BITE_KNOCKBACK)
        pushToast("SHARK STRIKE", `-${BITE_ENERGY_COST} energy — eat plankton to recover`)
      }
    } else if (st.mode === "cooldown" && st.modeT > COOLDOWN_SECONDS) {
      st.mode = "patrol"
      st.modeT = 0
    }
    sharkState.mode = st.mode

    // --- steering target per mode ---
    if (st.mode === "chase") {
      s.target.copy(ocean.playerPos)
    } else {
      // noise-wander inside the twilight band; cooldown biases away from player
      const nt = t * 0.017 + st.seed
      s.target.set(
        (valueNoise2(st.seed + nt, st.seed) - 0.5) * 2 * WORLD.bounds * 0.8,
        -42 + (valueNoise2(st.seed, st.seed + nt) - 0.5) * 26,
        (valueNoise2(st.seed + 13.1, st.seed + nt) - 0.5) * 2 * WORLD.bounds * 0.8
      )
      if (st.mode === "cooldown") {
        s.dir.copy(st.pos).sub(ocean.playerPos)
        if (s.dir.lengthSq() > 0.01) {
          s.dir.normalize()
          s.target.addScaledVector(s.dir, 20)
        }
      }
    }

    // --- steer + integrate ---
    const maxSpeed = st.mode === "chase" ? CHASE_SPEED : CRUISE_SPEED
    const accel = st.mode === "chase" ? 4.5 : 1.1
    s.dir.copy(s.target).sub(st.pos)
    const dist = s.dir.length()
    if (dist > 0.01) {
      s.dir.divideScalar(dist)
      st.vel.addScaledVector(s.dir, accel * delta)
    }
    st.vel.multiplyScalar(Math.max(0, 1 - 0.4 * delta))
    const speed = st.vel.length()
    if (speed > maxSpeed) st.vel.multiplyScalar(maxSpeed / speed)
    st.pos.addScaledVector(st.vel, delta)

    // hold the hunting band: never above the safe line, never into the floor
    st.pos.y = THREE.MathUtils.clamp(st.pos.y, WORLD.floorY + 8, -SAFE_DEPTH - 2)
    const r = Math.hypot(st.pos.x, st.pos.z)
    const maxR = WORLD.bounds * 0.95
    if (r > maxR) {
      st.pos.x *= maxR / r
      st.pos.z *= maxR / r
    }
    group.position.copy(st.pos)

    // --- orientation: nose into the velocity, hard banks while hunting ---
    if (speed > 0.1) {
      const yaw = Math.atan2(st.vel.x, st.vel.z)
      const pitch = Math.atan2(-st.vel.y, Math.hypot(st.vel.x, st.vel.z)) * 0.8
      const bank = st.mode === "chase" ? 0.22 : 0.08
      s.euler.set(pitch, yaw, Math.sin(t * 0.7) * bank)
      s.quat.setFromEuler(s.euler)
      group.quaternion.slerp(s.quat, 1 - Math.exp(-(st.mode === "chase" ? 3.2 : 1.4) * delta))
    }

    // --- tail wave: frequency rises with effort ---
    const tailHz = 0.9 + (speed / CHASE_SPEED) * 1.4
    const w = t * tailHz * Math.PI * 2
    const amp = 0.16 + (speed / CHASE_SPEED) * 0.22
    group.rotation.y += Math.sin(w) * amp * 0.12 // subtle whole-body yaw shimmy
    if (rearRef.current) rearRef.current.rotation.y = Math.sin(w - 0.8) * amp * 1.6
    if (caudalRef.current) caudalRef.current.rotation.y = Math.sin(w - 1.6) * amp * 2.4
    if (pectoralL.current) pectoralL.current.rotation.z = -0.5 + Math.sin(w * 0.5) * 0.06
    if (pectoralR.current) pectoralR.current.rotation.z = 0.5 - Math.sin(w * 0.5) * 0.06
  })

  return (
    <group ref={groupRef} position={[40, -38, -30]}>
      {/* torso + head (forward = +Z) */}
      <mesh scale={[0.62, 0.72, 2.3]} position={[0, 0, 0.4]}>
        <sphereGeometry args={[1, 22, 16]} />
        <meshStandardMaterial color={HIDE} roughness={0.6} metalness={0.1} />
      </mesh>
      {/* pale belly */}
      <mesh scale={[0.52, 0.5, 2.0]} position={[0, -0.28, 0.4]}>
        <sphereGeometry args={[1, 18, 12]} />
        <meshStandardMaterial color={BELLY} roughness={0.75} />
      </mesh>
      {/* dorsal fin */}
      <mesh position={[0, 0.85, 0.35]} rotation={[0.35, 0, 0]} scale={[0.08, 0.75, 0.55]}>
        <coneGeometry args={[1, 1.6, 8]} />
        <meshStandardMaterial color={FIN} roughness={0.7} />
      </mesh>
      {/* pectoral fins */}
      <mesh ref={pectoralL} position={[0.55, -0.15, 0.9]} rotation={[0, 0.2, -0.5]} scale={[1.0, 0.06, 0.4]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color={FIN} roughness={0.7} />
      </mesh>
      <mesh ref={pectoralR} position={[-0.55, -0.15, 0.9]} rotation={[0, -0.2, 0.5]} scale={[1.0, 0.06, 0.4]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color={FIN} roughness={0.7} />
      </mesh>
      {/* rear segment, pivoted where the torso ends */}
      <group ref={rearRef} position={[0, 0, -1.5]}>
        <mesh scale={[0.42, 0.5, 1.1]} position={[0, 0, -0.5]}>
          <sphereGeometry args={[1, 18, 12]} />
          <meshStandardMaterial color={HIDE} roughness={0.6} metalness={0.1} />
        </mesh>
        {/* caudal fin, pivoted at the peduncle */}
        <group ref={caudalRef} position={[0, 0, -1.45]}>
          <mesh position={[0, 0.45, -0.3]} rotation={[-0.5, 0, 0]} scale={[0.06, 1.0, 0.4]}>
            <coneGeometry args={[1, 1.8, 8]} />
            <meshStandardMaterial color={FIN} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.3, -0.22]} rotation={[2.6, 0, 0]} scale={[0.06, 0.65, 0.3]}>
            <coneGeometry args={[1, 1.3, 8]} />
            <meshStandardMaterial color={FIN} roughness={0.7} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
