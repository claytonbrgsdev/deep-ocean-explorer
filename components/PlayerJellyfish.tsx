"use client"

import { useRef, useEffect, useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import JellyBody, { JellyBodyHandle, JELLY_VARIANTS } from "./JellyBody"
import { ocean, WORLD, strokeEnvelope } from "@/lib/ocean"
import { terrainHeight } from "./Seafloor"

// ---------------------------------------------------------------------------
// Player-controlled jellyfish.
//
// Real jellyfish don't glide — they pulse. Thrust here is applied in bursts
// synchronized with the bell contraction phase, so the movement has the
// characteristic surge-coast-surge rhythm. Input only steers where the next
// pulse pushes.
// ---------------------------------------------------------------------------

// Propulsion is impulsive: almost all acceleration lands inside the short
// power stroke (envelope attack), then drag bleeds it off — the speed curve
// looks like an ADSR: snap up, exponential decay, coast, next pulse.
const STROKE_ACCEL = 54
const IDLE_ACCEL = 5
const DRAG = 2.1
const MAX_SPEED = 8
const IDLE_PULSE_HZ = 0.7
const SWIM_PULSE_HZ = 1.7

interface Keys {
  f: boolean
  b: boolean
  l: boolean
  r: boolean
  u: boolean
  d: boolean
}

export default function PlayerJellyfish() {
  const groupRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<JellyBodyHandle>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const { camera, gl } = useThree()

  const keys = useRef<Keys>({ f: false, b: false, l: false, r: false, u: false, d: false })
  const orbit = useRef({ yaw: 0, pitch: 0.25, dist: 9, dragging: false, lastX: 0, lastY: 0 })

  // scratch objects — allocated once, reused every frame
  const scratch = useMemo(
    () => ({
      dir: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      camTarget: new THREE.Vector3(),
      camPos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      invQuat: new THREE.Quaternion(),
      m4: new THREE.Matrix4(),
      up: new THREE.Vector3(0, 1, 0),
      velLocal: new THREE.Vector3(),
    }),
    []
  )

  const pulse = useRef({ phase: 0 })

  useEffect(() => {
    const set = (code: string, v: boolean) => {
      const k = keys.current
      switch (code) {
        case "KeyW":
        case "ArrowUp":
          k.f = v
          break
        case "KeyS":
        case "ArrowDown":
          k.b = v
          break
        case "KeyA":
        case "ArrowLeft":
          k.l = v
          break
        case "KeyD":
        case "ArrowRight":
          k.r = v
          break
        case "Space":
        case "KeyQ":
          k.u = v
          break
        case "ShiftLeft":
        case "ShiftRight":
        case "KeyE":
          k.d = v
          break
      }
    }
    const down = (e: KeyboardEvent) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault()
      set(e.code, true)
    }
    const up = (e: KeyboardEvent) => set(e.code, false)
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  useEffect(() => {
    const el = gl.domElement
    const o = orbit.current
    const onDown = (e: PointerEvent) => {
      o.dragging = true
      o.lastX = e.clientX
      o.lastY = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      if (!o.dragging) return
      o.yaw -= (e.clientX - o.lastX) * 0.005
      o.pitch = THREE.MathUtils.clamp(o.pitch + (e.clientY - o.lastY) * 0.004, -0.9, 1.2)
      o.lastX = e.clientX
      o.lastY = e.clientY
    }
    const onUp = () => (o.dragging = false)
    const onWheel = (e: WheelEvent) => {
      o.dist = THREE.MathUtils.clamp(o.dist + e.deltaY * 0.01, 4, 18)
    }
    el.addEventListener("pointerdown", onDown)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    el.addEventListener("wheel", onWheel, { passive: true })
    return () => {
      el.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      el.removeEventListener("wheel", onWheel)
    }
  }, [gl])

  useFrame((state, dt) => {
    const group = groupRef.current
    const body = bodyRef.current
    if (!group || !body) return
    const delta = Math.min(dt, 0.05)
    const t = state.clock.elapsedTime
    const k = keys.current
    const s = scratch
    const o = orbit.current

    // --- steering direction (camera-relative) ---
    camera.getWorldDirection(s.fwd)
    s.fwd.y = 0
    s.fwd.normalize()
    s.right.crossVectors(s.fwd, s.up)
    s.dir.set(0, 0, 0)
    if (k.f) s.dir.add(s.fwd)
    if (k.b) s.dir.sub(s.fwd)
    if (k.r) s.dir.add(s.right)
    if (k.l) s.dir.sub(s.right)
    if (k.u) s.dir.y += 1
    if (k.d) s.dir.y -= 1
    const hasInput = s.dir.lengthSq() > 0
    if (hasInput) s.dir.normalize()

    // --- pulse-synchronized propulsion (ADSR stroke envelope) ---
    const targetHz = hasInput ? SWIM_PULSE_HZ : IDLE_PULSE_HZ
    pulse.current.phase += delta * Math.PI * 2 * targetHz
    const phase = pulse.current.phase
    const env = strokeEnvelope(phase)

    // thrust fires along the bell axis — the jelly pushes water out of its
    // own bell, so steering only re-aims the body; the jet does the rest
    s.fwd.set(0, 1, 0).applyQuaternion(group.quaternion)
    if (hasInput) {
      ocean.playerVel.addScaledVector(s.fwd, STROKE_ACCEL * env * delta)
    } else {
      // gentle idle pulses keep it breathing and slowly drifting
      ocean.playerVel.addScaledVector(s.fwd, IDLE_ACCEL * env * delta)
    }
    // buoyancy bob + slow sink while coasting (real jellies pulse-and-sink)
    ocean.playerVel.y += Math.sin(t * 0.6) * 0.15 * delta
    if (!hasInput) ocean.playerVel.y -= 0.22 * (1 - env) * delta

    // drag + speed clamp
    ocean.playerVel.multiplyScalar(Math.max(0, 1 - DRAG * delta))
    const speed = ocean.playerVel.length()
    if (speed > MAX_SPEED) ocean.playerVel.multiplyScalar(MAX_SPEED / speed)

    // integrate + bounds (never sink into the terrain relief)
    ocean.playerPos.addScaledVector(ocean.playerVel, delta)
    const seabed = terrainHeight(ocean.playerPos.x, ocean.playerPos.z)
    ocean.playerPos.y = THREE.MathUtils.clamp(ocean.playerPos.y, seabed + 2.5, -1.2)
    ocean.playerPos.x = THREE.MathUtils.clamp(ocean.playerPos.x, -WORLD.bounds, WORLD.bounds)
    ocean.playerPos.z = THREE.MathUtils.clamp(ocean.playerPos.z, -WORLD.bounds, WORLD.bounds)
    group.position.copy(ocean.playerPos)

    // --- orientation: steer the bell toward the input; the jet does the rest.
    // No input → righting reflex: real jellyfish re-orient bell-up, which
    // also breaks the sink→orient-down→pulse-down feedback spiral.
    if (hasInput) {
      s.quat.setFromUnitVectors(s.up, s.dir)
      group.quaternion.slerp(s.quat, 1 - Math.exp(-3.0 * delta))
    } else {
      s.quat.identity()
      group.quaternion.slerp(s.quat, 1 - Math.exp(-1.2 * delta))
    }

    // --- feed the body shaders (uniform writes only, zero allocations) ---
    body.uniforms.time.value = t
    body.uniforms.phase.value = phase
    // bell snap follows the same stroke envelope as the thrust.
    // with the asymmetric bellWave (×1.75 on the squeeze half) the mouth
    // radius swings ~0.35x (nearly closed) to ~1.2x (soft overshoot)
    body.uniforms.amp.value = 0.06 + (hasInput ? 0.32 : 0.2) * env
    s.invQuat.copy(group.quaternion).invert()
    s.velLocal.copy(ocean.playerVel).applyQuaternion(s.invQuat).multiplyScalar(0.16)
    body.uniforms.velLocal.value.copy(s.velLocal)
    body.uniforms.glowBoost.value = 0.2 + 0.3 * Math.min(1, speed / MAX_SPEED) + 0.35 * env

    if (lightRef.current) {
      lightRef.current.intensity = 2.0 + env * 3.2
    }

    // --- store telemetry for HUD / environment systems ---
    ocean.speed = speed
    ocean.depth = -ocean.playerPos.y
    ocean.pulsePhase = phase
    ocean.playerQuat.copy(group.quaternion)

    // --- camera rig: damped orbit follow ---
    const cosP = Math.cos(o.pitch)
    s.camPos.set(
      ocean.playerPos.x + Math.sin(o.yaw) * o.dist * cosP,
      ocean.playerPos.y + Math.sin(o.pitch) * o.dist + 1.2,
      ocean.playerPos.z + Math.cos(o.yaw) * o.dist * cosP
    )
    // keep the camera out of the seabed
    s.camPos.y = Math.max(s.camPos.y, terrainHeight(s.camPos.x, s.camPos.z) + 1.6)
    const damp = 1 - Math.exp(-4.5 * delta)
    camera.position.lerp(s.camPos, damp)
    s.camTarget.copy(ocean.playerPos)
    s.camTarget.y += 0.5
    camera.lookAt(s.camTarget)
  })

  return (
    <group ref={groupRef} position={[0, -6, 0]}>
      <JellyBody ref={bodyRef} palette={JELLY_VARIANTS[0]} tentacles={30} oralArms={4} seed={7} />
      <pointLight ref={lightRef} color="#8fd8ff" distance={16} decay={1.8} intensity={2.5} />
    </group>
  )
}
