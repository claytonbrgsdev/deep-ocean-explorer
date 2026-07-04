"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import JellyBody, { JellyBodyHandle } from "./JellyBody"
import { ocean, WORLD, valueNoise2, strokeEnvelope } from "@/lib/ocean"
import { SPECIES, JellyConfig } from "@/lib/species"

// ---------------------------------------------------------------------------
// NPC jellyfish — 12 individuals, 6 color morphs, 8-pattern behavior FSM.
// Deterministic patterns looked robotic in v1, so every timer gets ±25%
// jitter and each transition has a 15% chance of mutating to a random
// pattern instead of the natural next one.
// ---------------------------------------------------------------------------

const PATTERNS = [
  "driftUp",
  "driftDown",
  "circleCW",
  "circleCCW",
  "figureEight",
  "hover",
  "wander",
  "currentRide",
] as const

type Pattern = (typeof PATTERNS)[number]

interface NpcState {
  pattern: Pattern
  t: number
  dur: number
  center: THREE.Vector3
  pos: THREE.Vector3
  vel: THREE.Vector3
  phaseOffset: number
  pulseHz: number
  scale: number
  cfg: JellyConfig
  angVel: number
  noiseSeed: number
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function pickDuration() {
  const base = rand(5, 11)
  return base * rand(0.75, 1.25) // ±25% jitter
}

function makeNpc(i: number): NpcState {
  const depth = rand(4, 112)
  const angle = rand(0, Math.PI * 2)
  const radius = rand(12, WORLD.bounds * 0.8)
  const pos = new THREE.Vector3(Math.cos(angle) * radius, -depth, Math.sin(angle) * radius)
  // deep individuals get the abyssal-red morph, shallow ones the bright morphs
  // NPCs are citizens of the Jelly Lab: deep water belongs to the ABYSSAL
  // morph, the sunlit column gets the other five species round-robin
  const shallow = SPECIES.filter((s) => s.id !== "abyssal")
  const sp = depth > 65 ? SPECIES.find((s) => s.id === "abyssal")! : shallow[i % shallow.length]
  const cfg = sp.config
  return {
    pattern: PATTERNS[i % PATTERNS.length],
    t: rand(0, 4),
    dur: pickDuration(),
    center: pos.clone(),
    pos,
    vel: new THREE.Vector3(),
    phaseOffset: rand(0, Math.PI * 2),
    pulseHz: rand(0.55, 1.05) * cfg.pulseMult,
    scale: rand(0.45, 1.15),
    cfg,
    angVel: rand(0.25, 0.6),
    noiseSeed: rand(0, 100),
  }
}

const NPC_COUNT = 12

function stepNpc(npc: NpcState, delta: number, time: number, target: THREE.Vector3) {
  npc.t += delta
  if (npc.t > npc.dur) {
    npc.t = 0
    npc.dur = pickDuration()
    npc.center.copy(npc.pos)
    const mutate = Math.random() < 0.15
    const nextIdx = mutate
      ? Math.floor(Math.random() * PATTERNS.length)
      : (PATTERNS.indexOf(npc.pattern) + 1 + Math.floor(Math.random() * 3)) % PATTERNS.length
    npc.pattern = PATTERNS[nextIdx]
  }

  const s = npc.t
  target.copy(npc.center)
  switch (npc.pattern) {
    case "driftUp":
      target.y += s * 0.8
      target.x += Math.sin(time * 0.4 + npc.phaseOffset) * 1.5
      break
    case "driftDown":
      target.y -= s * 0.8
      target.z += Math.cos(time * 0.35 + npc.phaseOffset) * 1.5
      break
    case "circleCW": {
      const a = npc.phaseOffset + s * npc.angVel
      target.x += Math.cos(a) * 5
      target.z += Math.sin(a) * 5
      break
    }
    case "circleCCW": {
      const a = npc.phaseOffset - s * npc.angVel
      target.x += Math.cos(a) * 5
      target.z += Math.sin(a) * 5
      target.y += Math.sin(s * 0.5) * 1.2
      break
    }
    case "figureEight": {
      const a = npc.phaseOffset + s * npc.angVel
      target.x += Math.sin(a) * 6
      target.z += Math.sin(a * 2.0) * 3
      break
    }
    case "hover":
      target.y += Math.sin(time * 0.9 + npc.phaseOffset) * 0.8
      break
    case "wander": {
      const n1 = valueNoise2(npc.noiseSeed + s * 0.15, npc.noiseSeed) - 0.5
      const n2 = valueNoise2(npc.noiseSeed, npc.noiseSeed + s * 0.15) - 0.5
      target.x += n1 * 16
      target.z += n2 * 16
      target.y += (valueNoise2(npc.noiseSeed + 50, s * 0.1) - 0.5) * 6
      break
    }
    case "currentRide":
      target.x += s * 1.2
      target.y += Math.sin(s * 0.8 + npc.phaseOffset) * 0.6
      break
  }

  // steer smoothly toward the pattern target
  const dx = target.x - npc.pos.x
  const dy = target.y - npc.pos.y
  const dz = target.z - npc.pos.z
  npc.vel.x += dx * 0.5 * delta
  npc.vel.y += dy * 0.5 * delta
  npc.vel.z += dz * 0.5 * delta
  npc.vel.multiplyScalar(Math.max(0, 1 - 0.9 * delta))
  npc.pos.addScaledVector(npc.vel, delta)

  // keep inside the ocean volume
  npc.pos.y = THREE.MathUtils.clamp(npc.pos.y, WORLD.floorY + 4, -2)
  const r = Math.hypot(npc.pos.x, npc.pos.z)
  const maxR = WORLD.bounds * 0.9
  if (r > maxR) {
    npc.pos.x *= maxR / r
    npc.pos.z *= maxR / r
    npc.center.copy(npc.pos)
  }
}

function Npc({ npc }: { npc: NpcState }) {
  const groupRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<JellyBodyHandle>(null)
  const scratch = useMemo(
    () => ({
      target: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),
      dir: new THREE.Vector3(),
      invQuat: new THREE.Quaternion(),
      lagQuat: new THREE.Quaternion(),
      relQuat: new THREE.Quaternion(),
      m4: new THREE.Matrix4(),
      velLocal: new THREE.Vector3(),
    }),
    []
  )

  useFrame((state, dt) => {
    const group = groupRef.current
    const body = bodyRef.current
    if (!group || !body) return
    const delta = Math.min(dt, 0.05)
    const time = state.clock.elapsedTime
    const s = scratch

    stepNpc(npc, delta, time, s.target)
    group.position.copy(npc.pos)

    const speed = npc.vel.length()
    if (speed > 0.2) {
      s.dir.copy(npc.vel).normalize()
      s.quat.setFromUnitVectors(s.up, s.dir)
      group.quaternion.slerp(s.quat, 1 - Math.exp(-2 * delta))
    }

    // rotational drag (same trailing-ghost cascade as the player)
    s.lagQuat.slerp(group.quaternion, 1 - Math.exp(-2.6 * delta))
    s.relQuat.copy(group.quaternion).invert().multiply(s.lagQuat)
    s.m4.makeRotationFromQuaternion(s.relQuat)
    body.uniforms.lagMat.value.setFromMatrix4(s.m4)

    const phase = time * Math.PI * 2 * npc.pulseHz + npc.phaseOffset
    body.uniforms.time.value = time + npc.phaseOffset
    body.uniforms.phase.value = phase
    body.uniforms.amp.value = 0.06 + 0.24 * strokeEnvelope(phase)
    s.invQuat.copy(group.quaternion).invert()
    s.velLocal.copy(npc.vel).applyQuaternion(s.invQuat).multiplyScalar(0.2)
    body.uniforms.velLocal.value.copy(s.velLocal)
    // abyssal morphs glow harder the deeper the player goes
    const depthBoost = npc.cfg.species === "abyssal" ? Math.min(1, ocean.depth / 90) * 0.5 : 0
    body.uniforms.glowBoost.value = 0.2 + depthBoost
  })

  // full species anatomy, scaled down a touch (NPCs read lighter than the
  // player) and jittered by the individual's own size roll
  const cfg = npc.cfg
  return (
    <group ref={groupRef} position={npc.pos} scale={npc.scale * cfg.scale}>
      <JellyBody
        ref={bodyRef}
        palette={cfg.palette}
        tentacles={Math.max(14, Math.round(cfg.tentacles * 0.7))}
        oralArms={Math.max(2, cfg.oralArms - 1)}
        seed={Math.floor(npc.noiseSeed * 97) + 3}
        bellWidth={cfg.bellWidth}
        bellHeight={cfg.bellHeight}
        tentacleLen={cfg.tentacleLen}
        tipGlow={cfg.tipGlow}
        aura={cfg.aura}
      />
    </group>
  )
}

export default function NpcJellyfish() {
  const npcs = useMemo(() => Array.from({ length: NPC_COUNT }, (_, i) => makeNpc(i)), [])
  return (
    <>
      {npcs.map((npc, i) => (
        <Npc key={i} npc={npc} />
      ))}
    </>
  )
}
