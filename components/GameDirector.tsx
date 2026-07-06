"use client"

import { useRef, useEffect } from "react"
import { useFrame } from "@react-three/fiber"
import { ocean } from "@/lib/ocean"
import { game, advanceMissions, expireToasts, currentMission } from "@/lib/game"
import { oceanAudio } from "@/lib/audio"
import { sharkState } from "./Shark"

// ---------------------------------------------------------------------------
// GameDirector — invisible conductor. Runs once per frame, after the player
// (mounted last in Scene), and turns raw telemetry into game state:
// distance, energy metabolism, NPC encounters, mission progression.
// No rendering, no React state — pure store mutation.
// ---------------------------------------------------------------------------

const MEET_RADIUS = 5
const ESCORT_RADIUS = 8
const DRAIN_SWIM = 0.55 // energy/s while actively pulsing
const DRAIN_IDLE = 0.05 // basal metabolism — drifting is nearly free
const ENERGY_FLOOR = 4 // never fully strand the player

export default function GameDirector() {
  const prev = useRef({ x: 0, y: -20, z: 0, init: false })
  const audioPrev = useRef({ eaten: 0, deepEaten: 0, missionIndex: 0, pulseCycle: 0 })

  // audio can only start after a user gesture (autoplay policy)
  useEffect(() => {
    oceanAudio.armAutoStart()
  }, [])

  useFrame((state, dt) => {
    const delta = Math.min(dt, 0.05)
    const p = prev.current

    if (!p.init) {
      p.x = ocean.playerPos.x
      p.y = ocean.playerPos.y
      p.z = ocean.playerPos.z
      p.init = true
      return
    }

    // the game "starts" on the first deliberate stroke (set by PlayerJellyfish
    // on real key input — idle drift alone must never start the clock)

    if (game.started) {
      // --- odometer ---
      const dx = ocean.playerPos.x - p.x
      const dy = ocean.playerPos.y - p.y
      const dz = ocean.playerPos.z - p.z
      game.distanceTraveled += Math.sqrt(dx * dx + dy * dy + dz * dz)

      // --- metabolism: pulsing burns, coasting sips ---
      const swimming = ocean.speed > 1.4
      const drain = swimming ? DRAIN_SWIM : DRAIN_IDLE
      game.energy = Math.max(ENERGY_FLOOR, game.energy - drain * delta)

      // --- depth records ---
      game.maxDepthReached = Math.max(game.maxDepthReached, ocean.depth)
      if (currentMission().id === "ascent" && ocean.depth < 8) {
        game.surfacedAfterAbyss = true
      }

      // --- NPC encounters (squared distances, ~12 checks) ---
      for (let i = 0; i < game.npcPositions.length; i++) {
        const np = game.npcPositions[i]
        if (!np || game.npcMet.has(i)) continue
        if (np.distanceToSquared(ocean.playerPos) < MEET_RADIUS * MEET_RADIUS) {
          game.npcMet.add(i)
        }
      }

      // --- turtle escort: accumulate time spent alongside any turtle ---
      for (let i = 0; i < game.turtlePositions.length; i++) {
        const tp = game.turtlePositions[i]
        if (tp && tp.distanceToSquared(ocean.playerPos) < ESCORT_RADIUS * ESCORT_RADIUS) {
          game.turtleTime += delta
          break // one companion at a time is enough
        }
      }

      advanceMissions()
    }

    // --- audio: ambient bed + event one-shots (diff the counters) ---
    const ap = audioPrev.current
    oceanAudio.update(delta, {
      depth: ocean.depth,
      speed: ocean.speed,
      chasing: sharkState.mode === "chase",
    })
    if (game.planktonEaten !== ap.eaten) {
      oceanAudio.ping(game.deepPlanktonEaten !== ap.deepEaten)
      ap.eaten = game.planktonEaten
      ap.deepEaten = game.deepPlanktonEaten
    }
    if (game.missionIndex !== ap.missionIndex) {
      oceanAudio.chime()
      ap.missionIndex = game.missionIndex
    }
    // one whoosh per completed pulse cycle, audible only when really moving
    const cycle = Math.floor(ocean.pulsePhase / (Math.PI * 2))
    if (cycle !== ap.pulseCycle) {
      if (ocean.speed > 1.2) oceanAudio.whoosh(ocean.speed / 8)
      ap.pulseCycle = cycle
    }

    expireToasts(performance.now())

    p.x = ocean.playerPos.x
    p.y = ocean.playerPos.y
    p.z = ocean.playerPos.z
  })

  return null
}
