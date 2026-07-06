"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { ocean, WORLD, oceanCurrent } from "@/lib/ocean"
import { game, eatPlankton } from "@/lib/game"
import { terrainHeight } from "./Seafloor"

// ---------------------------------------------------------------------------
// Edible plankton — the game's collectible. ~150 glowing motes drift on the
// same current the player rides. Shallow motes glow cool cyan; below 55 m
// they burn amber and are worth triple. Eaten motes pop (scale-out) and
// respawn elsewhere in the column after a short delay.
// ---------------------------------------------------------------------------

const COUNT = 150
const EAT_RADIUS = 2.8
const RESPAWN_SECONDS = 6
// bioluminescent attraction: motes inside this radius drift toward the
// player's glow — feeding feels alive instead of pixel-hunting
const LURE_RADIUS = 8
const LURE_PULL = 1.6

// eat-burst pool: a small firework of sparks at every collection
const BURSTS = 10
const SPARKS = 8
const BURST_LIFE = 0.7

const COL_SHALLOW = new THREE.Color("#7ff3d4")
const COL_DEEP = new THREE.Color("#ffb545")

interface Mote {
  pos: THREE.Vector3
  phase: number
  /** 1 = alive, shrinking toward 0 after being eaten */
  life: number
  respawnAt: number
  size: number
}

// most motes live in "blooms" — findable clouds instead of a uniform mist
const BLOOM_COUNT = 14
const blooms: THREE.Vector3[] = Array.from({ length: BLOOM_COUNT }, (_, i) => {
  const angle = (i / BLOOM_COUNT) * Math.PI * 2 + Math.random() * 0.6
  const radius = 10 + Math.random() * WORLD.bounds * 0.75
  const depth = 4 + Math.random() * 108
  return new THREE.Vector3(Math.cos(angle) * radius, -depth, Math.sin(angle) * radius)
})

function spawnPos(v: THREE.Vector3): THREE.Vector3 {
  if (Math.random() < 0.72) {
    // clustered: a gaussian-ish puff around a bloom center
    const b = blooms[Math.floor(Math.random() * BLOOM_COUNT)]
    v.set(
      b.x + (Math.random() + Math.random() - 1) * 7,
      b.y + (Math.random() + Math.random() - 1) * 5,
      b.z + (Math.random() + Math.random() - 1) * 7
    )
  } else {
    // scattered stragglers keep the whole column alive
    const angle = Math.random() * Math.PI * 2
    const radius = Math.random() * WORLD.bounds * 0.92
    const depth = 3 + Math.random() * 110
    v.set(Math.cos(angle) * radius, -depth, Math.sin(angle) * radius)
  }
  v.x = THREE.MathUtils.clamp(v.x, -WORLD.bounds, WORLD.bounds)
  v.z = THREE.MathUtils.clamp(v.z, -WORLD.bounds, WORLD.bounds)
  v.y = THREE.MathUtils.clamp(v.y, Math.max(WORLD.floorY + 2.5, terrainHeight(v.x, v.z) + 2.5), -3)
  return v
}

interface Burst {
  origin: THREE.Vector3
  dirs: THREE.Vector3[]
  age: number // > BURST_LIFE = free slot
  deep: boolean
}

export default function Plankton() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const burstRef = useRef<THREE.InstancedMesh>(null)

  const bursts = useMemo<Burst[]>(
    () =>
      Array.from({ length: BURSTS }, () => ({
        origin: new THREE.Vector3(),
        dirs: Array.from({ length: SPARKS }, () => new THREE.Vector3()),
        age: BURST_LIFE + 1,
        deep: false,
      })),
    []
  )

  const motes = useMemo<Mote[]>(
    () =>
      Array.from({ length: COUNT }, () => ({
        pos: spawnPos(new THREE.Vector3()),
        phase: Math.random() * Math.PI * 2,
        life: 1,
        respawnAt: 0,
        size: 0.14 + Math.random() * 0.12,
      })),
    []
  )

  const scratch = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      flow: new THREE.Vector3(),
      color: new THREE.Color(),
    }),
    []
  )

  // dev-console access, mirrors __ocean/__game
  if (typeof window !== "undefined") {
    ;(window as unknown as { __plankton: Mote[] }).__plankton = motes
  }

  useFrame((state, dt) => {
    const mesh = meshRef.current
    if (!mesh) return
    const delta = Math.min(dt, 0.05)
    const t = state.clock.elapsedTime
    const s = scratch

    for (let i = 0; i < COUNT; i++) {
      const m = motes[i]

      if (m.life <= 0) {
        if (t >= m.respawnAt) {
          spawnPos(m.pos)
          m.life = 0.001 // grow back in
        }
      } else {
        // ride the current + a personal bob
        oceanCurrent(m.pos, t, s.flow)
        m.pos.addScaledVector(s.flow, delta)
        m.pos.y += Math.sin(t * 0.8 + m.phase) * 0.12 * delta

        // drawn to the player's glow when close
        const lureSq = m.pos.distanceToSquared(ocean.playerPos)
        if (game.started && lureSq < LURE_RADIUS * LURE_RADIUS && lureSq > 0.01) {
          const d = Math.sqrt(lureSq)
          const pull = LURE_PULL * (1 - d / LURE_RADIUS)
          m.pos.x += ((ocean.playerPos.x - m.pos.x) / d) * pull * delta
          m.pos.y += ((ocean.playerPos.y - m.pos.y) / d) * pull * delta
          m.pos.z += ((ocean.playerPos.z - m.pos.z) / d) * pull * delta
        }

        // pop-in / steady state
        if (m.life < 1) m.life = Math.min(1, m.life + delta * 2.5)

        // collection check (squared distance, player only)
        const reach = EAT_RADIUS * (0.8 + 0.4 * (game.level > 3 ? 1 : game.level / 3))
        if (game.started && m.pos.distanceToSquared(ocean.playerPos) < reach * reach) {
          eatPlankton(-m.pos.y)
          // fire a spark burst from the mote's last position
          const b = bursts.find((x) => x.age > BURST_LIFE)
          if (b) {
            b.origin.copy(m.pos)
            b.deep = -m.pos.y > 55
            b.age = 0
            for (const d of b.dirs) {
              d.set(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).normalize()
            }
          }
          m.life = 0
          m.respawnAt = t + RESPAWN_SECONDS + Math.random() * 6
        }
      }

      const depth = -m.pos.y
      const breathe = 0.75 + 0.25 * Math.sin(t * 2.2 + m.phase)
      const sc = m.size * m.life * breathe
      s.dummy.position.copy(m.pos)
      s.dummy.scale.setScalar(Math.max(sc, 0.0001))
      s.dummy.updateMatrix()
      mesh.setMatrixAt(i, s.dummy.matrix)

      s.color.copy(depth > 55 ? COL_DEEP : COL_SHALLOW)
      // deep motes pulse harder — they must read through the dark
      if (depth > 55) s.color.multiplyScalar(1.1 + 0.5 * Math.sin(t * 3 + m.phase))
      mesh.setColorAt(i, s.color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

    // --- eat bursts: sparks fly out, decelerate, fade ---
    const bm = burstRef.current
    if (bm) {
      for (let bi = 0; bi < BURSTS; bi++) {
        const b = bursts[bi]
        b.age += delta
        const active = b.age <= BURST_LIFE
        const k = active ? b.age / BURST_LIFE : 1
        const radius = 1.7 * (1 - (1 - k) * (1 - k)) // ease-out expansion
        const sc = active ? 0.09 * (1 - k) : 0.0001
        for (let si = 0; si < SPARKS; si++) {
          s.dummy.position.copy(b.origin).addScaledVector(b.dirs[si], radius)
          s.dummy.scale.setScalar(sc)
          s.dummy.updateMatrix()
          bm.setMatrixAt(bi * SPARKS + si, s.dummy.matrix)
        }
        if (active) {
          s.color.copy(b.deep ? COL_DEEP : COL_SHALLOW).multiplyScalar(1.6 * (1 - k * 0.5))
          for (let si = 0; si < SPARKS; si++) bm.setColorAt(bi * SPARKS + si, s.color)
        }
      }
      bm.instanceMatrix.needsUpdate = true
      if (bm.instanceColor) bm.instanceColor.needsUpdate = true
    }
  })

  return (
    <>
      <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={burstRef} args={[undefined, undefined, BURSTS * SPARKS]} frustumCulled={false}>
        <tetrahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  )
}
