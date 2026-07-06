"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { ocean } from "@/lib/ocean"
import { game, currentMission } from "@/lib/game"
import { octopusPosition } from "./Octopus"
import { blooms } from "./Plankton"

// ---------------------------------------------------------------------------
// Mission beacon — a soft pillar of light over the current objective, only
// for missions that have a place in the world (food, creatures, the octopus).
// Depth missions keep their HUD hint; the water column itself is the arrow.
// The pillar breathes; a ring at its heart marks the exact spot.
// ---------------------------------------------------------------------------

export default function MissionBeacon() {
  const groupRef = useRef<THREE.Group>(null)
  const pillarMat = useRef<THREE.MeshBasicMaterial>(null)
  const coreMat = useRef<THREE.MeshBasicMaterial>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null)

  const scratch = useMemo(() => ({ target: new THREE.Vector3(), found: false }), [])

  useFrame((state, dt) => {
    const group = groupRef.current
    if (!group) return
    // the LIVE instance owns the dev handle (HMR can orphan module-scope copies)
    ;(window as unknown as { __beacon: typeof scratch }).__beacon = scratch
    const delta = Math.min(dt, 0.05)
    const t = state.clock.elapsedTime
    const s = scratch

    // --- resolve the current mission's world target ---
    s.found = false
    const id = currentMission().id
    if (game.started) {
      if (id === "feast" || id === "bloom") {
        // nearest bloom (deep-only for the harvest mission)
        let best = Infinity
        for (const b of blooms) {
          if (id === "bloom" && b.y > -55) continue
          const d = b.distanceToSquared(ocean.playerPos)
          if (d < best) {
            best = d
            s.target.copy(b)
            s.found = true
          }
        }
      } else if (id === "social") {
        // nearest jellyfish the player hasn't met yet
        let best = Infinity
        for (let i = 0; i < game.npcPositions.length; i++) {
          const p = game.npcPositions[i]
          if (!p || game.npcMet.has(i)) continue
          const d = p.distanceToSquared(ocean.playerPos)
          if (d < best) {
            best = d
            s.target.copy(p)
            s.found = true
          }
        }
      } else if (id === "escort") {
        let best = Infinity
        for (const p of game.turtlePositions) {
          if (!p) continue
          const d = p.distanceToSquared(ocean.playerPos)
          if (d < best) {
            best = d
            s.target.copy(p)
            s.found = true
          }
        }
      } else if (id === "octopus") {
        s.target.copy(octopusPosition)
        s.found = octopusPosition.lengthSq() > 0.01
      }
    }

    group.visible = s.found
    if (!s.found) return

    // glide toward the (possibly moving) target — the pillar swims too
    group.position.x += (s.target.x - group.position.x) * (1 - Math.exp(-3 * delta))
    group.position.y += (s.target.y - group.position.y) * (1 - Math.exp(-3 * delta))
    group.position.z += (s.target.z - group.position.z) * (1 - Math.exp(-3 * delta))

    // breathing glow + slow ring spin
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.1)
    if (pillarMat.current) pillarMat.current.opacity = 0.05 + pulse * 0.04
    if (coreMat.current) coreMat.current.opacity = 0.1 + pulse * 0.08
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.8
      ringRef.current.scale.setScalar(1 + pulse * 0.25)
    }
    if (ringMat.current) ringMat.current.opacity = 0.35 + pulse * 0.3
  })

  return (
    <group ref={groupRef} visible={false}>
      {/* wide soft pillar */}
      <mesh>
        <cylinderGeometry args={[1.4, 1.4, 60, 12, 1, true]} />
        <meshBasicMaterial
          ref={pillarMat}
          color="#ffd98a"
          transparent
          opacity={0.06}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* bright core */}
      <mesh>
        <cylinderGeometry args={[0.28, 0.28, 60, 8, 1, true]} />
        <meshBasicMaterial
          ref={coreMat}
          color="#ffe9b8"
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* spinning marker ring at the heart */}
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.0, 0.06, 8, 40]} />
        <meshBasicMaterial
          ref={ringMat}
          color="#ffd98a"
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
