"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import {
  SPECIES,
  character,
  subscribeCharacter,
  updateCharacter,
  applySpecies,
  randomizeCharacter,
  loadCharacter,
} from "@/lib/species"
import type { CharPalette, JellyConfig } from "@/lib/species"

// ---------------------------------------------------------------------------
// JELLY LAB — character maker panel. Floats over the game on the right side;
// every control writes straight into the live character store, so the player
// jellyfish morphs in realtime while the game keeps running.
// ---------------------------------------------------------------------------

type NumKey =
  | "tentacles"
  | "tentacleLen"
  | "oralArms"
  | "bellWidth"
  | "bellHeight"
  | "scale"
  | "pulseMult"
  | "tipGlow"

interface SliderDef {
  label: string
  key: NumKey
  min: number
  max: number
  step: number
  int?: boolean
}

const ANATOMY: SliderDef[] = [
  { label: "TENTACLES", key: "tentacles", min: 14, max: 44, step: 1, int: true },
  { label: "LENGTH", key: "tentacleLen", min: 0.7, max: 1.6, step: 0.05 },
  { label: "ORAL ARMS", key: "oralArms", min: 2, max: 6, step: 1, int: true },
  { label: "BELL WIDTH", key: "bellWidth", min: 0.75, max: 1.35, step: 0.05 },
  { label: "BELL HEIGHT", key: "bellHeight", min: 0.7, max: 1.4, step: 0.05 },
  { label: "SIZE", key: "scale", min: 0.6, max: 1.4, step: 0.05 },
  { label: "TEMPO", key: "pulseMult", min: 0.75, max: 1.3, step: 0.05 },
]

const COLOR_ROWS: { label: string; ch: keyof CharPalette }[] = [
  { label: "BELL", ch: "bell" },
  { label: "GLOW", ch: "glow" },
  { label: "CORE", ch: "organ" },
  { label: "TENTACLES", ch: "tentacle" },
]

// curated neon / oceanic swatches per channel — cold to warm
const SWATCHES: Record<keyof CharPalette, string[]> = {
  bell: ["#bfe3ff", "#d4f6ff", "#9ff0e2", "#e2d0ff", "#ffd2ec", "#ffd9a8", "#ff9e7a", "#3a1030"],
  glow: ["#7fd4ff", "#4fe8ff", "#54ffb0", "#b06fff", "#ff6fb5", "#ffb347", "#ff5c39", "#ff2f6b"],
  organ: ["#ffb7d9", "#68f2d0", "#4fc3ff", "#7f3fff", "#ff4d94", "#ff7847", "#ffd23f", "#ff3b3b"],
  tentacle: ["#a8c6ff", "#9fe8ff", "#8dfad2", "#c49fff", "#ff9fd0", "#ffc37f", "#ff8f66", "#ff6b8f"],
}

const STATS: { label: string; key: keyof JellyConfig["stats"] }[] = [
  { label: "SPEED", key: "speed" },
  { label: "AGILITY", key: "agility" },
  { label: "GLOW", key: "glow" },
]

// keep arrow keys inside sliders from steering the jellyfish
const stopKeys = (e: React.KeyboardEvent) => e.stopPropagation()

export default function CharacterMaker() {
  const [open, setOpen] = useState(false)

  useSyncExternalStore(
    subscribeCharacter,
    () => character.version,
    () => 0
  )
  const cfg = character.config

  // hydrate from localStorage once; first visit opens the lab
  useEffect(() => {
    if (!loadCharacter()) setOpen(true)
  }, [])

  // C toggles the panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === "KeyC") setOpen((o) => !o)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const tagline = SPECIES.find((s) => s.id === cfg.species)?.tagline ?? "custom strain"

  const setNum = (key: NumKey, v: number) => updateCharacter({ [key]: v } as Partial<JellyConfig>)
  const setColor = (ch: keyof CharPalette, hex: string) =>
    updateCharacter({ palette: { ...cfg.palette, [ch]: hex } })

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none font-mono">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="pointer-events-auto absolute top-16 right-5 rounded border border-cyan-300/20 bg-[#02121f]/70 backdrop-blur-md px-2.5 py-1 text-[10px] tracking-[0.2em] text-cyan-200/80 hover:border-cyan-300/50 hover:text-cyan-100 transition-colors"
        >
          🪼 JELLY LAB <span className="text-cyan-400/60">[C]</span>
        </button>
      )}

      {open && (
        <div
          className="pointer-events-auto absolute right-4 top-16 bottom-4 w-[340px] overflow-y-auto rounded-lg border border-cyan-300/20 bg-[#02121f]/70 backdrop-blur-md px-4 py-4 [scrollbar-width:thin] [scrollbar-color:rgba(103,232,249,0.25)_transparent]"
        >
          {/* header */}
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="text-cyan-100/90 text-sm font-semibold tracking-[0.35em]">JELLY LAB</h2>
              <p className="mt-1 text-[10px] text-cyan-400/60 italic leading-4">{tagline}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded border border-cyan-300/25 bg-cyan-300/5 px-1.5 py-px text-[10px] text-cyan-100/80 hover:bg-cyan-300/15 transition-colors"
              title="close (C)"
            >
              C
            </button>
          </div>

          {/* species */}
          <SectionLabel>SPECIES</SectionLabel>
          <div className="mb-4 grid grid-cols-3 gap-1.5">
            {SPECIES.map((sp) => {
              const active = sp.id === cfg.species
              return (
                <button
                  key={sp.id}
                  onClick={() => applySpecies(sp.id)}
                  className={`rounded border px-1.5 py-2 text-center transition-colors ${
                    active
                      ? "border-cyan-300/80 bg-cyan-300/10 shadow-[0_0_10px_rgba(103,232,249,0.25)]"
                      : "border-cyan-300/15 bg-cyan-300/[0.03] hover:border-cyan-300/40"
                  }`}
                >
                  <span className={`block text-[9px] tracking-[0.15em] ${active ? "text-cyan-100" : "text-cyan-200/70"}`}>
                    {sp.name}
                  </span>
                  <span className="mt-1.5 flex justify-center gap-1">
                    {(["bell", "glow", "organ", "tentacle"] as const).map((ch) => (
                      <span
                        key={ch}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: sp.config.palette[ch] }}
                      />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          {/* colors */}
          <SectionLabel>COLORS</SectionLabel>
          <div className="mb-4 space-y-2">
            {COLOR_ROWS.map(({ label, ch }) => (
              <div key={ch} className="flex items-center gap-2">
                <span className="w-[68px] shrink-0 text-[9px] tracking-[0.15em] text-cyan-400/70">{label}</span>
                <div className="flex flex-1 items-center gap-1">
                  {SWATCHES[ch].map((hex) => {
                    const active = cfg.palette[ch].toLowerCase() === hex.toLowerCase()
                    return (
                      <button
                        key={hex}
                        onClick={() => setColor(ch, hex)}
                        className={`h-4 w-4 rounded-full transition-transform hover:scale-125 ${
                          active
                            ? "ring-2 ring-cyan-200 ring-offset-1 ring-offset-[#02121f]"
                            : "ring-1 ring-white/10"
                        }`}
                        style={{ background: hex }}
                        title={hex}
                      />
                    )
                  })}
                  <input
                    type="color"
                    value={cfg.palette[ch]}
                    onChange={(e) => setColor(ch, e.target.value)}
                    onKeyDown={stopKeys}
                    className="ml-auto h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border border-cyan-300/40 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-none"
                    title="free color"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* anatomy */}
          <SectionLabel>ANATOMY</SectionLabel>
          <div className="mb-4 space-y-2.5">
            {ANATOMY.map((s) => (
              <Slider key={s.key} def={s} value={cfg[s.key]} onChange={(v) => setNum(s.key, v)} />
            ))}
          </div>

          {/* traits */}
          <SectionLabel>TRAITS</SectionLabel>
          <div className="mb-4 space-y-2.5">
            <Slider
              def={{ label: "TIP GLOW", key: "tipGlow", min: 0, max: 1, step: 0.1 }}
              value={cfg.tipGlow}
              onChange={(v) => setNum("tipGlow", v)}
            />
            <div className="flex items-center justify-between">
              <span className="text-[9px] tracking-[0.15em] text-cyan-400/70">AURA</span>
              <button
                onClick={() => updateCharacter({ aura: !cfg.aura })}
                className={`rounded border px-3 py-0.5 text-[9px] tracking-[0.2em] transition-colors ${
                  cfg.aura
                    ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-100 shadow-[0_0_8px_rgba(103,232,249,0.3)]"
                    : "border-cyan-300/20 bg-cyan-300/[0.03] text-cyan-400/60 hover:border-cyan-300/40"
                }`}
              >
                {cfg.aura ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          {/* stats — read-only, set by species */}
          <SectionLabel>STATS</SectionLabel>
          <div className="mb-5 space-y-2">
            {STATS.map(({ label, key }) => (
              <div key={key}>
                <div className="mb-1 flex justify-between">
                  <span className="text-[9px] tracking-[0.15em] text-cyan-400/70">{label}</span>
                  <span className="text-[9px] tabular-nums text-cyan-100/70">
                    {Math.round(cfg.stats[key] * 100)}%
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded bg-cyan-950">
                  <div
                    className="h-full rounded bg-gradient-to-r from-amber-200 via-cyan-300 to-cyan-500 transition-[width] duration-300"
                    style={{ width: `${cfg.stats[key] * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* footer */}
          <div className="flex gap-2">
            <button
              onClick={() => randomizeCharacter()}
              className="flex-1 rounded border border-cyan-300/30 bg-cyan-300/[0.04] py-2 text-[10px] tracking-[0.2em] text-cyan-200/90 hover:border-cyan-300/60 hover:bg-cyan-300/10 transition-colors"
            >
              ◈ RANDOMIZE
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex-1 rounded border border-cyan-300/60 bg-cyan-400/15 py-2 text-[10px] tracking-[0.2em] text-cyan-50 shadow-[0_0_12px_rgba(103,232,249,0.2)] hover:bg-cyan-400/25 transition-colors"
            >
              DIVE →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[10px] tracking-[0.3em] text-cyan-400/70">{children}</span>
      <span className="h-px flex-1 bg-cyan-300/15" />
    </div>
  )
}

function Slider({
  def,
  value,
  onChange,
}: {
  def: SliderDef
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[76px] shrink-0 text-[9px] tracking-[0.15em] text-cyan-400/70">{def.label}</span>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => onChange(def.int ? Math.round(Number(e.target.value)) : Number(e.target.value))}
        onKeyDown={stopKeys}
        className="h-1 flex-1 cursor-pointer accent-cyan-400"
      />
      <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-cyan-100/85">
        {def.int ? value.toFixed(0) : value.toFixed(2)}
      </span>
    </div>
  )
}
