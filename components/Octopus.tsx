"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { ocean } from "@/lib/ocean"
import { game, pushToast } from "@/lib/game"
import { terrainHeight } from "./Seafloor"

// ---------------------------------------------------------------------------
// The octopus — the ocean's hidden secret. One animal, perched on the deep
// seafloor rocks (~60–110 m), wearing the seabed's own colour. Drift close
// and the camouflage burns away to warm coral red — that's the "found it"
// moment the mission asks for. Crowd it and it jets to another rock behind
// a puff of ink. Arms are eight curled tubes that sway on slow phases.
// ---------------------------------------------------------------------------

const REVEAL_RADIUS = 9 // camouflage starts breaking
const FOUND_RADIUS = 6 // mission credit
const PANIC_RADIUS = 2.8 // too close — jet away
const JET_SECONDS = 1.4

const CAMO = new THREE.Color("#232f3a") // deep seabed slate
const REVEALED = new THREE.Color("#b5452f") // warm coral red
const EYE = "#f4e8c8"

// possible perches — resolved against the real terrain at build time
const PERCH_SPOTS: [number, number][] = [
  [28, -35],
  [-42, 18],
  [12, 52],
  [-25, -48],
  [50, 8],
]

function perchPosition(i: number, out: THREE.Vector3): THREE.Vector3 {
  const [x, z] = PERCH_SPOTS[i % PERCH_SPOTS.length]
  return out.set(x, terrainHeight(x, z) + 0.7, z)
}

export const octopusPosition = new THREE.Vector3()
if (typeof window !== "undefined") {
  ;(window as unknown as { __octopus: THREE.Vector3 }).__octopus = octopusPosition
}

// one curled arm curve, built once and shared by all 8 arms
function buildArmGeometry(): THREE.TubeGeometry {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    // reaches out, drapes down, tip curls back up
    pts.push(
      new THREE.Vector3(
        t * 1.6,
        -0.25 * Math.sin(t * Math.PI) - t * 0.35 + Math.sin(t * t * Math.PI) * 0.22,
        Math.sin(t * 2.2) * 0.12
      )
    )
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  return new THREE.TubeGeometry(curve, 24, 0.13, 8, false)
}

export default function Octopus() {
  const groupRef = useRef<THREE.Group>(null)
  const inkRef = useRef<THREE.Mesh>(null)
  const inkMat = useRef<THREE.MeshBasicMaterial>(null)
  const armRefs = useRef<(THREE.Group | null)[]>([])

  const armGeometry = useMemo(() => buildArmGeometry(), [])
  // ONE skin material shared by mantle, head and all 8 arms — the camouflage
  // lerp touches a single instance and the whole animal shifts together
  const skinMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: CAMO.clone(), roughness: 0.85 }),
    []
  )

  const st = useMemo(() => {
    const home = perchPosition(0, new THREE.Vector3())
    return {
      perchIndex: 0,
      home: home.clone(),
      pos: home.clone(),
      jetFrom: new THREE.Vector3(),
      jetTo: new THREE.Vector3(),
      jetT: -1, // <0 = settled
      reveal: 0,
      found: false,
      inkAge: 99,
    }
  }, [])

  const scratch = useMemo(() => ({ color: new THREE.Color(), dir: new THREE.Vector3() }), [])

  useFrame((frameState, dt) => {
    const group = groupRef.current
    if (!group) return
    const delta = Math.min(dt, 0.05)
    const t = frameState.clock.elapsedTime
    const s = scratch

    const dist = st.pos.distanceTo(ocean.playerPos)

    // --- camouflage: burn from seabed slate to coral red as the player nears ---
    const targetReveal = THREE.MathUtils.clamp((REVEAL_RADIUS - dist) / (REVEAL_RADIUS - 4), 0, 1)
    st.reveal += (targetReveal - st.reveal) * (1 - Math.exp(-3 * delta))
    s.color.copy(CAMO).lerp(REVEALED, st.reveal)
    skinMat.color.copy(s.color)
    skinMat.emissive.copy(REVEALED).multiplyScalar(st.reveal * 0.25)

    // --- mission credit ---
    if (!st.found && game.started && dist < FOUND_RADIUS) {
      st.found = true
      game.octopusFound = 1
      pushToast("THE OCTOPUS — FOUND", "it was watching you the whole time")
    }

    // --- panic jet to the next perch ---
    if (st.jetT < 0 && dist < PANIC_RADIUS) {
      st.perchIndex = (st.perchIndex + 1) % PERCH_SPOTS.length
      st.jetFrom.copy(st.pos)
      perchPosition(st.perchIndex, st.jetTo)
      st.jetT = 0
      st.inkAge = 0
      if (inkRef.current) inkRef.current.position.copy(st.pos)
    }
    if (st.jetT >= 0) {
      st.jetT += delta / JET_SECONDS
      if (st.jetT >= 1) {
        st.pos.copy(st.jetTo)
        st.jetT = -1
      } else {
        // ease-out dash with a rising arc
        const k = 1 - (1 - st.jetT) * (1 - st.jetT)
        st.pos.lerpVectors(st.jetFrom, st.jetTo, k)
        st.pos.y += Math.sin(k * Math.PI) * 4
      }
    }

    group.position.copy(st.pos)
    octopusPosition.copy(st.pos)

    // --- ink puff: expand + fade ---
    if (st.inkAge < 3) {
      st.inkAge += delta
      const k = Math.min(st.inkAge / 2.2, 1)
      if (inkRef.current && inkMat.current) {
        inkRef.current.scale.setScalar(0.4 + k * 4.5)
        inkMat.current.opacity = 0.55 * (1 - k)
        inkRef.current.visible = k < 1
      }
    }

    // --- idle life: mantle breathing, arm sway, face the player when revealed ---
    const breathe = 1 + Math.sin(t * 1.4) * 0.05 + st.reveal * Math.sin(t * 3.2) * 0.03
    group.scale.setScalar(breathe)
    for (let i = 0; i < armRefs.current.length; i++) {
      const arm = armRefs.current[i]
      if (!arm) continue
      const base = (i / 8) * Math.PI * 2
      arm.rotation.y = base + Math.sin(t * 0.6 + i * 1.7) * 0.1
      arm.rotation.z = Math.sin(t * 0.9 + i * 2.3) * 0.08 - 0.05
    }
    if (st.reveal > 0.3) {
      s.dir.copy(ocean.playerPos).sub(st.pos)
      const yaw = Math.atan2(s.dir.x, s.dir.z)
      group.rotation.y += (yaw - group.rotation.y) * (1 - Math.exp(-1.5 * delta)) * 0.5
    }
  })

  return (
    <>
      <group ref={groupRef}>
        {/* mantle */}
        <mesh position={[0, 0.75, -0.15]} rotation={[0.5, 0, 0]} scale={[0.75, 1.0, 0.8]} material={skinMat}>
          <sphereGeometry args={[1, 20, 16]} />
        </mesh>
        {/* head + eyes */}
        <mesh position={[0, 0.35, 0.35]} scale={[0.55, 0.45, 0.5]} material={skinMat}>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
        <mesh position={[0.3, 0.48, 0.62]} scale={0.11}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color={EYE} emissive={EYE} emissiveIntensity={0.35} roughness={0.3} />
        </mesh>
        <mesh position={[-0.3, 0.48, 0.62]} scale={0.11}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color={EYE} emissive={EYE} emissiveIntensity={0.35} roughness={0.3} />
        </mesh>
        {/* eight curled arms fanned around the base */}
        {Array.from({ length: 8 }, (_, i) => (
          <group
            key={i}
            ref={(el) => {
              armRefs.current[i] = el
            }}
            rotation={[0, (i / 8) * Math.PI * 2, 0]}
            position={[0, 0.08, 0]}
          >
            <mesh geometry={armGeometry} material={skinMat} />
          </group>
        ))}
      </group>
      {/* ink puff — free-floating, stays where the jet started */}
      <mesh ref={inkRef} visible={false}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshBasicMaterial ref={inkMat} color="#05080d" transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  )
}
