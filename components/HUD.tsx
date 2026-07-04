"use client"

import { useEffect, useState, useRef } from "react"
import { ocean, ZONES } from "@/lib/ocean"

// ---------------------------------------------------------------------------
// HUD — samples the mutable ocean store at 8Hz. The 3D loop never calls
// setState; React work is decoupled from the render loop entirely.
// ---------------------------------------------------------------------------

interface Sample {
  depth: number
  x: number
  z: number
  speed: number
  zoneIndex: number
  light: number
  fps: number
}

export default function HUD() {
  const [s, setS] = useState<Sample>({ depth: 20, x: 0, z: 0, speed: 0, zoneIndex: 1, light: 75, fps: 0 })
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
      const zone = ZONES[ocean.zoneIndex]
      setS({
        depth: ocean.depth,
        x: ocean.playerPos.x,
        z: ocean.playerPos.z,
        speed: ocean.speed,
        zoneIndex: ocean.zoneIndex,
        light: Math.round(zone.light * 100),
        fps,
      })
    }, 125)
    return () => clearInterval(id)
  }, [])

  const zone = ZONES[s.zoneIndex]
  const maxDepth = 120
  const markerPct = Math.min(100, (s.depth / maxDepth) * 100)

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
          <span className="text-cyan-400/70">POSITION</span>
          <span className="tabular-nums">
            {s.x.toFixed(0)} · {s.z.toFixed(0)}
          </span>
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
