"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { valueNoise2 } from "@/lib/ocean"

// ---------------------------------------------------------------------------
// Fish schools — flocking look without O(n²) boids: each school follows a
// noise-driven leader path; each fish holds a slowly-orbiting offset around
// the leader plus individual wobble. Reads as emergent, costs almost nothing.
// ---------------------------------------------------------------------------

interface SchoolDef {
  count: number
  color: string
  center: THREE.Vector3
  range: number
  speed: number
  size: number
  spread: number
  seed: number
}

const SCHOOLS: SchoolDef[] = [
  { count: 60, color: "#9fc4d8", center: new THREE.Vector3(20, -14, -15), range: 30, speed: 0.9, size: 0.8, spread: 3.2, seed: 11 },
  { count: 45, color: "#ffd257", center: new THREE.Vector3(-30, -27, 20), range: 26, speed: 0.7, size: 1.05, spread: 4.2, seed: 37 },
  { count: 50, color: "#ff7f6b", center: new THREE.Vector3(5, -52, 35), range: 28, speed: 0.55, size: 0.68, spread: 2.8, seed: 71 },
]

// slim fish silhouette: stretched octahedron reads as a fish at a distance
function makeFishGeometry(): THREE.BufferGeometry {
  const geo = new THREE.OctahedronGeometry(0.5, 0)
  geo.scale(0.36, 0.5, 1.6)
  return geo
}

function School({ def }: { def: SchoolDef }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const leader = useMemo(() => new THREE.Vector3(), [])
  const prevLeader = useMemo(() => new THREE.Vector3(), [])
  const fishPos = useMemo(() => new THREE.Vector3(), [])
  const lookTarget = useMemo(() => new THREE.Vector3(), [])
  const geometry = useMemo(makeFishGeometry, [])

  const fish = useMemo(
    () =>
      Array.from({ length: def.count }, (_, i) => ({
        orbitR: 0.6 + Math.pow(Math.random(), 0.6) * def.spread,
        orbitSpeed: (Math.random() * 0.5 + 0.3) * (Math.random() > 0.5 ? 1 : -1),
        phase: Math.random() * Math.PI * 2,
        lift: (Math.random() - 0.5) * def.spread * 0.8,
        wobbleHz: 3 + Math.random() * 3,
        scale: def.size * (0.7 + Math.random() * 0.6),
      })),
    [def]
  )

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = state.clock.elapsedTime * def.speed
    const s = def.seed

    // leader wanders a smooth noise path inside its range
    const lx = (valueNoise2(s + t * 0.09, s * 2.0) - 0.5) * 2 * def.range
    const ly = (valueNoise2(s * 3.0, s + t * 0.07) - 0.5) * 12
    const lz = (valueNoise2(s + t * 0.08, s + 40.0) - 0.5) * 2 * def.range
    prevLeader.copy(leader)
    leader.set(def.center.x + lx, def.center.y + ly, def.center.z + lz)

    fish.forEach((f, i) => {
      const a = f.phase + state.clock.elapsedTime * f.orbitSpeed
      const wob = Math.sin(state.clock.elapsedTime * f.wobbleHz + f.phase) * 0.25
      fishPos.set(
        leader.x + Math.cos(a) * f.orbitR,
        leader.y + f.lift + wob,
        leader.z + Math.sin(a) * f.orbitR * 0.8
      )
      dummy.position.copy(fishPos)
      // face along the school's travel direction blended with orbit tangent
      lookTarget.set(
        fishPos.x + (leader.x - prevLeader.x) * 30 - Math.sin(a) * f.orbitR * 0.6,
        fishPos.y + (leader.y - prevLeader.y) * 30,
        fishPos.z + (leader.z - prevLeader.z) * 30 + Math.cos(a) * f.orbitR * 0.5
      )
      dummy.lookAt(lookTarget)
      dummy.scale.setScalar(f.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, def.count]} frustumCulled={false}>
      <meshStandardMaterial color={def.color} roughness={0.6} metalness={0.25} />
    </instancedMesh>
  )
}

export default function FishSchools() {
  return (
    <>
      {SCHOOLS.map((def, i) => (
        <School key={i} def={def} />
      ))}
    </>
  )
}
