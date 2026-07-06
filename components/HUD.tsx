"use client"

import { useEffect, useState, useRef } from "react"
import { ocean, ZONES } from "@/lib/ocean"
import { game, currentMission, MISSIONS, Toast } from "@/lib/game"

// ---------------------------------------------------------------------------
// HUD — samples the mutable ocean + game stores at 8Hz. The 3D loop never
// calls setState; React work is decoupled from the render loop entirely.
// ---------------------------------------------------------------------------

interface Sample {
  depth: number
  x: number
  z: number
  speed: number
  zoneIndex: number
  light: number
  fps: number
  // game layer
  started: boolean
  energy: number
  score: number
  xp: number
  level: number
  missionIndex: number
  missionProgress: number
  missionTarget: number
  toasts: Toast[]
}

export default function HUD() {
  const [s, setS] = useState<Sample>({
    depth: 20, x: 0, z: 0, speed: 0, zoneIndex: 1, light: 75, fps: 0,
    started: false, energy: 100, score: 0, xp: 0, level: 1,
    missionIndex: 0, missionProgress: 0, missionTarget: 40, toasts: [],
  })
  const frames = useRef({ count: 0, last: performance.now(), fps: 60 })

  // cheap FPS meter: count rAF ticks between HUD samples
  useEffect(() => {
    let raf = 0
    const tick = () => {
      frames.current.count++
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now()
      const f = frames.current
      const fps = Math.round((f.count * 1000) / Math.max(now - f.last, 1))
      f.count = 0
      f.last = now
      const mission = currentMission()
      setS({
        depth: ocean.depth,
        x: ocean.playerPos.x,
        z: ocean.playerPos.z,
        speed: ocean.speed,
        zoneIndex: ocean.zoneIndex,
        light: Math.round(ZONES[ocean.zoneIndex].light * 100),
        fps,
        started: game.started,
        energy: game.energy,
        score: game.score,
        xp: game.xp,
        level: game.level,
        missionIndex: game.missionIndex,
        missionProgress: mission.value(game),
        missionTarget: mission.target,
        toasts: [...game.toasts],
      })
    }, 125)
    return () => clearInterval(id)
  }, [])

  const zone = ZONES[s.zoneIndex]
  const maxDepth = 120
  const markerPct = Math.min(100, (s.depth / maxDepth) * 100)
  const mission = MISSIONS[s.missionIndex]
  const endless = mission.target === Infinity
  const missionPct = endless ? 100 : Math.min(100, (s.missionProgress / s.missionTarget) * 100)
  const lowEnergy = s.energy < 30

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none font-mono">
      {/* vignette + subtle water tint */}
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 180px 40px rgba(0,10,30,0.55)" }} />

      {/* title */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 text-center">
        <h1 className="text-cyan-100/90 tracking-[0.45em] text-sm md:text-base font-semibold">
          DEEP OCEAN EXPLORER
        </h1>
        <p className="text-cyan-400/60 text-[10px] tracking-[0.3em] mt-1">V2 — REALTIME GLSL REBUILD</p>
      </div>

      {/* start prompt — fades once the first pulse lands */}
      {!s.started && (
        <div className="absolute top-[38%] left-1/2 -translate-x-1/2 text-center animate-pulse">
          <p className="text-cyan-100/90 text-sm tracking-[0.35em]">PRESS <Key>W</Key> TO BEGIN THE DRIFT</p>
          <p className="text-cyan-400/50 text-[10px] tracking-[0.25em] mt-2">
            {MISSIONS.length - 1} MISSIONS AWAIT IN THE WATER COLUMN
          </p>
        </div>
      )}

      {/* mission toasts */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        {s.toasts.map((t) => (
          <div
            key={t.id}
            className="rounded border border-amber-200/30 bg-[#1a1206]/80 backdrop-blur-md px-4 py-2 text-center"
            style={{ animation: "hudToast 4.6s ease forwards" }}
          >
            <p className="text-amber-100/95 text-[11px] tracking-[0.25em]">{t.text}</p>
            {t.sub && <p className="text-amber-200/60 text-[9px] tracking-[0.2em] mt-0.5">{t.sub}</p>}
          </div>
        ))}
      </div>

      {/* mission tracker */}
      <div className="absolute top-5 left-5 rounded-lg border border-cyan-300/20 bg-[#02121f]/70 backdrop-blur-md px-4 py-3 text-[11px] leading-5 text-cyan-100/85 w-[230px]">
        <div className="flex justify-between items-baseline">
          <span className="text-[9px] tracking-[0.3em] text-amber-200/70">
            {endless ? "FREE DRIFT" : `MISSION ${s.missionIndex + 1}/${MISSIONS.length - 1}`}
          </span>
          <span className="text-[9px] text-cyan-400/60 tabular-nums">LV {s.level}</span>
        </div>
        <p className="text-cyan-50 text-[12px] tracking-[0.12em] mt-1">{mission.title}</p>
        <p className="text-cyan-300/60 text-[10px] leading-4 mt-0.5">{mission.desc}</p>
        {!endless && (
          <>
            <div className="mt-2 h-1 rounded bg-cyan-950 overflow-hidden">
              <div
                className="h-full rounded bg-gradient-to-r from-amber-300 to-cyan-300 transition-[width] duration-300"
                style={{ width: `${missionPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-cyan-400/50 italic">{mission.hint}</span>
              <span className="text-[9px] text-cyan-200/70 tabular-nums">
                {Math.min(s.missionProgress, s.missionTarget).toFixed(0)}/{s.missionTarget}
                {mission.unit}
              </span>
            </div>
          </>
        )}
        {endless && (
          <p className="text-[9px] text-cyan-400/50 italic mt-1">{mission.hint}</p>
        )}
      </div>

      {/* depth gauge */}
      <div className="absolute left-5 top-1/2 -translate-y-1/2 flex items-stretch gap-2">
        <div className="relative w-2 h-64 rounded-full overflow-hidden border border-cyan-300/20"
          style={{ background: "linear-gradient(to bottom, #2fb4d8, #12688e 25%, #07456b 45%, #032440 70%, #000306)" }}>
          <div
            className="absolute left-0 right-0 h-[3px] bg-cyan-100 shadow-[0_0_8px_2px_rgba(140,240,255,0.9)] transition-[top] duration-150"
            style={{ top: `${markerPct}%` }}
          />
        </div>
        <div className="flex flex-col justify-between text-[9px] text-cyan-200/50 py-0.5">
          <span>0m</span>
          <span>60m</span>
          <span>120m</span>
        </div>
      </div>

      {/* telemetry panel */}
      <div className="absolute bottom-5 left-5 rounded-lg border border-cyan-300/20 bg-[#02121f]/70 backdrop-blur-md px-4 py-3 text-[11px] leading-5 text-cyan-100/85 min-w-[210px]">
        <div className="flex justify-between gap-6">
          <span className="text-cyan-400/70">DEPTH</span>
          <span className="tabular-nums">{s.depth.toFixed(1)} m</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-cyan-400/70">ZONE</span>
          <span className="text-cyan-50">{zone.name}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-cyan-400/70">SPEED</span>
          <span className="tabular-nums">{s.speed.toFixed(1)} m/s</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-cyan-400/70">SCORE</span>
          <span className="tabular-nums text-amber-100/90">{s.score}</span>
        </div>
        <div className="mt-2">
          <div className="flex justify-between gap-6 mb-1">
            <span className={lowEnergy ? "text-rose-300/90" : "text-cyan-400/70"}>ENERGY</span>
            <span className={`tabular-nums ${lowEnergy ? "text-rose-200/90" : ""}`}>{Math.round(s.energy)}%</span>
          </div>
          <div className="h-1 rounded bg-cyan-950 overflow-hidden">
            <div
              className={`h-full rounded transition-[width] duration-300 ${
                lowEnergy
                  ? "bg-gradient-to-r from-rose-500 to-rose-300 animate-pulse"
                  : "bg-gradient-to-r from-emerald-300 to-cyan-300"
              }`}
              style={{ width: `${s.energy}%` }}
            />
          </div>
        </div>
        <div className="mt-2">
          <div className="flex justify-between gap-6 mb-1">
            <span className="text-cyan-400/70">SUNLIGHT</span>
            <span className="tabular-nums">{s.light}%</span>
          </div>
          <div className="h-1 rounded bg-cyan-950 overflow-hidden">
            <div
              className="h-full rounded bg-gradient-to-r from-amber-200 via-cyan-300 to-cyan-500 transition-[width] duration-300"
              style={{ width: `${s.light}%` }}
            />
          </div>
        </div>
      </div>

      {/* fps */}
      <div className="absolute top-5 right-5 rounded border border-cyan-300/15 bg-[#02121f]/60 px-2.5 py-1 text-[10px] text-cyan-200/70 tabular-nums">
        {s.fps} FPS
      </div>

      {/* controls */}
      <div className="absolute bottom-5 right-5 text-right text-[10px] leading-5 text-cyan-200/45">
        <p>
          <Key>W A S D</Key> swim &nbsp; <Key>SPACE</Key> rise &nbsp; <Key>SHIFT</Key> dive
        </p>
        <p>
          <Key>DRAG</Key> orbit camera &nbsp; <Key>SCROLL</Key> zoom
        </p>
      </div>

      <style>{`
        @keyframes hudToast {
          0% { opacity: 0; transform: translateY(-8px); }
          8% { opacity: 1; transform: translateY(0); }
          82% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded border border-cyan-300/25 bg-cyan-300/5 px-1.5 py-px text-cyan-100/80">
      {children}
    </span>
  )
}
