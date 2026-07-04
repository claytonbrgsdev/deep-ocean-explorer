// ---------------------------------------------------------------------------
// Jelly Lab — character system.
//
// A JellyConfig fully describes a playable jellyfish: palette, anatomy
// multipliers, traits and swim stats. Six species act as curated presets;
// every field can then be tweaked in the maker UI. The current config lives
// in a tiny mutable store (same philosophy as lib/ocean.ts): the 3D side
// reads it directly, React panels subscribe to a version counter.
// ---------------------------------------------------------------------------

export interface CharPalette {
  bell: string
  glow: string
  organ: string
  tentacle: string
}

export interface JellyConfig {
  species: string
  palette: CharPalette
  /** bell proportions, multipliers around 1 */
  bellWidth: number // 0.75..1.35
  bellHeight: number // 0.7..1.4
  tentacles: number // 14..44
  tentacleLen: number // multiplier 0.7..1.6
  oralArms: number // 2..6
  scale: number // 0.6..1.4
  pulseMult: number // 0.75..1.3 — pulse tempo
  /** traits */
  tipGlow: number // 0..1 — luminous beads at tentacle tips
  aura: boolean // orbiting plankton mote ring
  /** swim stats, 0..1 — applied by PlayerJellyfish/DepthLighting */
  stats: { speed: number; agility: number; glow: number }
}

export interface JellySpecies {
  id: string
  name: string
  tagline: string
  config: JellyConfig
}

const make = (
  id: string,
  name: string,
  tagline: string,
  palette: CharPalette,
  over: Partial<Omit<JellyConfig, "species" | "palette" | "stats">>,
  stats: JellyConfig["stats"]
): JellySpecies => ({
  id,
  name,
  tagline,
  config: {
    species: id,
    palette,
    bellWidth: 1,
    bellHeight: 1,
    tentacles: 30,
    tentacleLen: 1,
    oralArms: 4,
    scale: 1,
    pulseMult: 1,
    tipGlow: 0,
    aura: false,
    ...over,
    stats,
  },
})

export const SPECIES: JellySpecies[] = [
  make(
    "moon",
    "MOON",
    "the classic drifter — calm, luminous, unhurried",
    { bell: "#bfe3ff", glow: "#7fd4ff", organ: "#ffb7d9", tentacle: "#a8c6ff" },
    {},
    { speed: 0.65, agility: 0.6, glow: 0.5 }
  ),
  make(
    "lumina",
    "LUMINA",
    "a living lantern — tips burning like stars",
    { bell: "#d4f6ff", glow: "#4fe8ff", organ: "#68f2d0", tentacle: "#9fe8ff" },
    { tipGlow: 1, tentacles: 34, bellHeight: 1.1 },
    { speed: 0.6, agility: 0.55, glow: 0.95 }
  ),
  make(
    "wisp",
    "WISP",
    "small, quick, wrapped in a veil of plankton",
    { bell: "#e2d0ff", glow: "#b06fff", organ: "#7f3fff", tentacle: "#c49fff" },
    { aura: true, scale: 0.75, tentacles: 22, tentacleLen: 0.85, pulseMult: 1.25 },
    { speed: 0.7, agility: 0.95, glow: 0.55 }
  ),
  make(
    "ember",
    "EMBER",
    "slow heavy royalty — a crown of smoldering light",
    { bell: "#ffd9a8", glow: "#ffb347", organ: "#ff7847", tentacle: "#ffc37f" },
    { tipGlow: 0.8, scale: 1.25, tentacles: 38, tentacleLen: 1.3, oralArms: 5, pulseMult: 0.8, bellWidth: 1.15 },
    { speed: 0.45, agility: 0.4, glow: 0.75 }
  ),
  make(
    "rose",
    "ROSE",
    "a ribbon dancer in warm pink silk",
    { bell: "#ffd2ec", glow: "#ff6fb5", organ: "#ff4d94", tentacle: "#ff9fd0" },
    { oralArms: 6, tentacles: 24, tentacleLen: 1.15, bellHeight: 0.9 },
    { speed: 0.6, agility: 0.75, glow: 0.6 }
  ),
  make(
    "abyssal",
    "ABYSSAL",
    "born in the rave — the dark answers its light",
    { bell: "#3a1030", glow: "#ff2f6b", organ: "#ff3b3b", tentacle: "#ff6b8f" },
    { aura: true, tipGlow: 0.6, scale: 1.1, tentacles: 32, pulseMult: 0.85, bellWidth: 1.1 },
    { speed: 0.5, agility: 0.5, glow: 1 }
  ),
]

// ------------------------------- store -------------------------------------

const STORAGE_KEY = "doe-jelly-config-v1"

function clone(c: JellyConfig): JellyConfig {
  return { ...c, palette: { ...c.palette }, stats: { ...c.stats } }
}

export const character: { config: JellyConfig; version: number } = {
  config: clone(SPECIES[0].config),
  version: 0,
}

const listeners = new Set<() => void>()

function notify() {
  character.version++
  for (const fn of listeners) fn()
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(character.config))
    } catch {}
  }
}

export function subscribeCharacter(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** merge a partial patch into the live config (shallow; palette/stats merged) */
export function updateCharacter(patch: Partial<JellyConfig>): void {
  const c = character.config
  character.config = {
    ...c,
    ...patch,
    palette: { ...c.palette, ...(patch.palette ?? {}) },
    stats: { ...c.stats, ...(patch.stats ?? {}) },
  }
  notify()
}

/** reset every field to a species preset */
export function applySpecies(id: string): void {
  const sp = SPECIES.find((s) => s.id === id)
  if (!sp) return
  character.config = clone(sp.config)
  notify()
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function randHex(): string {
  const h = Math.floor(Math.random() * 360)
  const s = 65 + Math.random() * 35
  const l = 55 + Math.random() * 30
  // hsl → hex
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0")
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** chaos button — every dial spun, always within sane ranges */
export function randomizeCharacter(): void {
  const base = SPECIES[Math.floor(Math.random() * SPECIES.length)]
  character.config = {
    ...clone(base.config),
    species: base.id,
    palette: { bell: randHex(), glow: randHex(), organ: randHex(), tentacle: randHex() },
    bellWidth: rand(0.8, 1.3),
    bellHeight: rand(0.75, 1.35),
    tentacles: Math.round(rand(14, 44)),
    tentacleLen: rand(0.75, 1.55),
    oralArms: Math.round(rand(2, 6)),
    scale: rand(0.65, 1.35),
    pulseMult: rand(0.78, 1.28),
    tipGlow: Math.random() < 0.5 ? 0 : rand(0.4, 1),
    aura: Math.random() < 0.35,
  }
  notify()
}

/** hydrate from localStorage — call once on the client */
export function loadCharacter(): boolean {
  if (typeof window === "undefined") return false
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as JellyConfig
    if (!parsed || !parsed.palette || !parsed.stats) return false
    character.config = { ...clone(SPECIES[0].config), ...parsed, palette: { ...parsed.palette }, stats: { ...parsed.stats } }
    character.version++
    for (const fn of listeners) fn()
    return true
  } catch {
    return false
  }
}
