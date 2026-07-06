import * as THREE from "three"

// ---------------------------------------------------------------------------
// Game layer — missions, energy, score. Same philosophy as lib/ocean.ts:
// a mutable store written inside useFrame, sampled by the HUD at low Hz.
// The mission chain is a guided tour of the water column: learn to pulse,
// feed, meet the locals, descend to the abyss, harvest light, come home.
// ---------------------------------------------------------------------------

export interface MissionDef {
  id: string
  title: string
  desc: string
  hint: string
  target: number
  unit: string
  xp: number
  /** reads current progress from the game store (clamped to target for HUD) */
  value: (g: GameState) => number
}

export interface Toast {
  id: number
  text: string
  sub?: string
  born: number // performance.now()
}

export interface GameState {
  started: boolean
  /** 0..100 — pulsing spends it, plankton restores it */
  energy: number
  score: number
  xp: number
  level: number
  missionIndex: number
  distanceTraveled: number
  planktonEaten: number
  deepPlanktonEaten: number
  maxDepthReached: number
  /** indices of NPC jellyfish the player has drifted close to */
  npcMet: Set<number>
  /** true once the player surfaces (<8m) AFTER visiting the abyss */
  surfacedAfterAbyss: boolean
  /** seconds spent swimming beside a sea turtle */
  turtleTime: number
  /** shark chases survived (broke line-of-pursuit or reached the shallows) */
  sharkEscapes: number
  /** times the shark connected */
  sharkHits: number
  /** 1 once the camouflaged octopus has been spotted up close */
  octopusFound: number
  toasts: Toast[]
  /** live NPC positions, written by NpcJellyfish each frame */
  npcPositions: THREE.Vector3[]
  /** live sea-turtle positions, written by SeaTurtle each frame */
  turtlePositions: THREE.Vector3[]
}

export const game: GameState = {
  started: false,
  energy: 100,
  score: 0,
  xp: 0,
  level: 1,
  missionIndex: 0,
  distanceTraveled: 0,
  planktonEaten: 0,
  deepPlanktonEaten: 0,
  maxDepthReached: 0,
  npcMet: new Set(),
  surfacedAfterAbyss: false,
  turtleTime: 0,
  sharkEscapes: 0,
  sharkHits: 0,
  octopusFound: 0,
  toasts: [],
  npcPositions: [],
  turtlePositions: [],
}

// dev-console access, mirrors __ocean
if (typeof window !== "undefined") {
  ;(window as unknown as { __game: typeof game }).__game = game
}

export const MISSIONS: MissionDef[] = [
  {
    id: "awaken",
    title: "FIRST PULSES",
    desc: "Swim 40 m and feel the stroke rhythm",
    hint: "hold W — thrust lands on the bell snap",
    target: 40,
    unit: "m",
    xp: 60,
    value: (g) => g.distanceTraveled,
  },
  {
    id: "feast",
    title: "PLANKTON FEAST",
    desc: "Eat 8 glowing plankton motes",
    hint: "drift through the golden sparks",
    target: 8,
    unit: "",
    xp: 90,
    value: (g) => g.planktonEaten,
  },
  {
    id: "social",
    title: "MEET THE LOCALS",
    desc: "Drift close to 3 wild jellyfish",
    hint: "approach slowly — within a bell's reach",
    target: 3,
    unit: "",
    xp: 120,
    value: (g) => g.npcMet.size,
  },
  {
    id: "escort",
    title: "SHELL COMPANION",
    desc: "Swim beside a sea turtle for 20 s",
    hint: "match her pace — she won't wait",
    target: 20,
    unit: "s",
    xp: 140,
    value: (g) => g.turtleTime,
  },
  {
    id: "twilight",
    title: "TWILIGHT DESCENT",
    desc: "Dive below 45 m into the fading light",
    hint: "SHIFT to dive — watch the sun die",
    target: 45,
    unit: "m",
    xp: 150,
    value: (g) => g.maxDepthReached,
  },
  {
    id: "predator",
    title: "JAWS OF THE TWILIGHT",
    desc: "Survive a shark chase — escape without a scratch",
    hint: "it hates the light — flee above 12 m",
    target: 1,
    unit: "",
    xp: 200,
    value: (g) => g.sharkEscapes,
  },
  {
    id: "abyss",
    title: "THE ABYSSAL FOREST",
    desc: "Reach 90 m — the bioluminescent grove",
    hint: "follow the dark down",
    target: 90,
    unit: "m",
    xp: 220,
    value: (g) => g.maxDepthReached,
  },
  {
    id: "bloom",
    title: "HARVEST OF LIGHT",
    desc: "Eat 10 abyssal plankton below 55 m",
    hint: "deep motes burn amber — worth triple",
    target: 10,
    unit: "",
    xp: 260,
    value: (g) => g.deepPlanktonEaten,
  },
  {
    id: "octopus",
    title: "EYES OF THE ABYSS",
    desc: "Find the octopus hiding on the deep rocks",
    hint: "the seabed that breathes is not seabed",
    target: 1,
    unit: "",
    xp: 240,
    value: (g) => g.octopusFound,
  },
  {
    id: "ascent",
    title: "RETURN TO THE LIGHT",
    desc: "Rise back into the sunlit surface (< 8 m)",
    hint: "SPACE to rise — spend your pulses well",
    target: 1,
    unit: "",
    xp: 300,
    value: (g) => (g.surfacedAfterAbyss ? 1 : 0),
  },
  {
    id: "open",
    title: "OPEN OCEAN",
    desc: "The column is yours — feed, glow, drift",
    hint: "score climbs with every mote",
    target: Infinity,
    unit: "",
    xp: 0,
    value: (g) => g.planktonEaten,
  },
]

export function currentMission(): MissionDef {
  return MISSIONS[Math.min(game.missionIndex, MISSIONS.length - 1)]
}

export function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(xp / 60))
}

let toastId = 0

export function pushToast(text: string, sub?: string) {
  game.toasts.push({ id: toastId++, text, sub, born: typeof performance !== "undefined" ? performance.now() : 0 })
  if (game.toasts.length > 3) game.toasts.shift()
}

export function expireToasts(now: number, ttl = 4600) {
  game.toasts = game.toasts.filter((t) => now - t.born < ttl)
}

/** called by Plankton on collection */
export function eatPlankton(depth: number) {
  const deep = depth > 55
  game.planktonEaten++
  if (deep) game.deepPlanktonEaten++
  game.energy = Math.min(100, game.energy + (deep ? 14 : 9))
  game.score += deep ? 30 : 10
}

/** advance the mission chain — called each frame by GameDirector */
export function advanceMissions() {
  const m = currentMission()
  if (m.target === Infinity) return
  if (m.value(game) >= m.target) {
    game.xp += m.xp
    const newLevel = levelForXp(game.xp)
    game.score += m.xp
    pushToast(`MISSION COMPLETE — ${m.title}`, `+${m.xp} XP`)
    if (newLevel > game.level) {
      game.level = newLevel
      pushToast(`LEVEL ${newLevel}`, "your glow reaches farther")
    }
    game.missionIndex = Math.min(game.missionIndex + 1, MISSIONS.length - 1)
    const next = currentMission()
    if (next.target !== Infinity) pushToast(`NEW MISSION — ${next.title}`, next.desc)
    else pushToast("THE OCEAN IS OPEN", "every mission complete")
  }
}

/** register/refresh an NPC's live position (index-stable) */
export function registerNpcPosition(i: number, pos: THREE.Vector3) {
  if (!game.npcPositions[i]) game.npcPositions[i] = new THREE.Vector3()
  game.npcPositions[i].copy(pos)
}

/** register/refresh a sea turtle's live position (index-stable) */
export function registerTurtlePosition(i: number, pos: THREE.Vector3) {
  if (!game.turtlePositions[i]) game.turtlePositions[i] = new THREE.Vector3()
  game.turtlePositions[i].copy(pos)
}
