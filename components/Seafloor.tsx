"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { WORLD, fbm2, ocean, ZONES } from "@/lib/ocean"

// ---------------------------------------------------------------------------
// Seafloor: noise-displaced terrain with slope-aware vertex colors, instanced
// rocks, two coral families and a shader-swayed seaweed meadow. Everything
// static is built exactly once; the only per-frame cost is one time uniform.
// ---------------------------------------------------------------------------

export function terrainHeight(x: number, z: number): number {
  const n = fbm2(x * 0.02 + 7.3, z * 0.02 + 2.1, 4)
  const dunes = Math.sin(x * 0.05) * Math.cos(z * 0.04) * 0.8
  return WORLD.floorY + n * 9 + dunes
}

export function Terrain() {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(400, 400, 130, 130)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const sand = new THREE.Color("#b8a77f")
    const silt = new THREE.Color("#5d6d70")
    const dark = new THREE.Color("#2e3f47")
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const y = terrainHeight(x, z)
      pos.setY(i, y - WORLD.floorY) // mesh itself sits at floorY
      const h = (y - WORLD.floorY) / 9
      tmp.copy(silt).lerp(sand, THREE.MathUtils.clamp(h, 0, 1))
      // darken crevices
      tmp.lerp(dark, THREE.MathUtils.clamp(0.55 - h, 0, 1) * 0.7)
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    geo.computeVertexNormals()
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    return geo
  }, [])

  return (
    <mesh geometry={geometry} position={[0, WORLD.floorY, 0]} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.96} metalness={0.02} />
    </mesh>
  )
}

export function Rocks() {
  const data = useMemo(() => {
    const items: { pos: THREE.Vector3; scale: THREE.Vector3; rot: THREE.Euler; color: THREE.Color }[] = []
    const base = new THREE.Color("#4a5a63")
    for (let i = 0; i < 46; i++) {
      const x = (fbm2(i * 3.7, 1.1) - 0.5) * 340
      const z = (fbm2(1.7, i * 2.9) - 0.5) * 340
      const s = 0.8 + fbm2(i * 1.3, i * 0.7) * 4.5
      items.push({
        pos: new THREE.Vector3(x, terrainHeight(x, z) + s * 0.2, z),
        scale: new THREE.Vector3(s * (0.7 + fbm2(i, 9) * 0.7), s * (0.5 + fbm2(9, i) * 0.6), s),
        rot: new THREE.Euler(fbm2(i, 4) * 0.6, fbm2(4, i) * Math.PI * 2, fbm2(i, i) * 0.5),
        color: base.clone().offsetHSL(0, 0, (fbm2(i * 7, 3) - 0.5) * 0.22),
      })
    }
    return items
  }, [])

  const meshRef = useRef<THREE.InstancedMesh>(null)
  const built = useRef(false)
  useFrame(() => {
    // build matrices once, after the ref exists
    const mesh = meshRef.current
    if (!mesh || built.current) return
    const dummy = new THREE.Object3D()
    data.forEach((r, i) => {
      dummy.position.copy(r.pos)
      dummy.scale.copy(r.scale)
      dummy.rotation.copy(r.rot)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, r.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    built.current = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, data.length]}>
      <dodecahedronGeometry args={[1, 1]} />
      <meshStandardMaterial roughness={0.92} metalness={0.05} flatShading />
    </instancedMesh>
  )
}

const CORAL_PALETTE = ["#ff6f61", "#e84393", "#f9a825", "#8e44ad", "#ff8a3f", "#d63d6b"]

export function Corals() {
  const tubeRef = useRef<THREE.InstancedMesh>(null)
  const fanRef = useRef<THREE.InstancedMesh>(null)
  const built = useRef(false)

  const clusters = useMemo(() => {
    const list: { x: number; z: number }[] = []
    for (let i = 0; i < 14; i++) {
      list.push({ x: (fbm2(i * 5.1, 8.8) - 0.5) * 300, z: (fbm2(8.2, i * 6.3) - 0.5) * 300 })
    }
    return list
  }, [])

  const TUBES = 150
  const FANS = 70

  useFrame(() => {
    if (built.current || !tubeRef.current || !fanRef.current) return
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    for (let i = 0; i < TUBES; i++) {
      const c = clusters[i % clusters.length]
      const x = c.x + (fbm2(i * 1.9, 0.4) - 0.5) * 10
      const z = c.z + (fbm2(0.7, i * 2.3) - 0.5) * 10
      const h = 0.7 + fbm2(i * 0.9, 5.5) * 2.6
      dummy.position.set(x, terrainHeight(x, z) + h * 0.42, z)
      dummy.scale.set(0.35 + fbm2(i, 2) * 0.4, h, 0.35 + fbm2(2, i) * 0.4)
      dummy.rotation.set((fbm2(i, 11) - 0.5) * 0.5, fbm2(11, i) * Math.PI, (fbm2(i * 3, 1) - 0.5) * 0.5)
      dummy.updateMatrix()
      tubeRef.current.setMatrixAt(i, dummy.matrix)
      color.set(CORAL_PALETTE[i % CORAL_PALETTE.length]).offsetHSL(0, 0, (fbm2(i, 7) - 0.5) * 0.15)
      tubeRef.current.setColorAt(i, color)
    }
    for (let i = 0; i < FANS; i++) {
      const c = clusters[(i * 3) % clusters.length]
      const x = c.x + (fbm2(i * 2.7, 3.3) - 0.5) * 12
      const z = c.z + (fbm2(3.1, i * 1.7) - 0.5) * 12
      const s = 0.9 + fbm2(i * 1.1, 9.2) * 2.2
      dummy.position.set(x, terrainHeight(x, z) + s * 0.55, z)
      dummy.scale.setScalar(s)
      dummy.rotation.set(0, fbm2(13, i) * Math.PI * 2, (fbm2(i, 13) - 0.5) * 0.3)
      dummy.updateMatrix()
      fanRef.current.setMatrixAt(i, dummy.matrix)
      color.set(CORAL_PALETTE[(i + 2) % CORAL_PALETTE.length]).offsetHSL(0.02, 0.05, 0)
      fanRef.current.setColorAt(i, color)
    }
    tubeRef.current.instanceMatrix.needsUpdate = true
    fanRef.current.instanceMatrix.needsUpdate = true
    if (tubeRef.current.instanceColor) tubeRef.current.instanceColor.needsUpdate = true
    if (fanRef.current.instanceColor) fanRef.current.instanceColor.needsUpdate = true
    built.current = true
  })

  return (
    <>
      <instancedMesh ref={tubeRef} args={[undefined, undefined, TUBES]}>
        <cylinderGeometry args={[0.32, 0.5, 1, 7]} />
        <meshStandardMaterial roughness={0.75} emissiveIntensity={0.25} emissive="#3d1030" />
      </instancedMesh>
      <instancedMesh ref={fanRef} args={[undefined, undefined, FANS]}>
        <circleGeometry args={[1, 14, 0, Math.PI]} />
        <meshStandardMaterial roughness={0.8} side={THREE.DoubleSide} emissive="#301040" emissiveIntensity={0.3} />
      </instancedMesh>
    </>
  )
}

// ------------------------------- seaweed ------------------------------------

const WEED_VERT = /* glsl */ `
  uniform float uTime;
  attribute vec3 aOffset;
  attribute float aPhase;
  attribute float aScale;
  attribute float aHue;
  varying vec2 vUv;
  varying float vHue;
  varying float vDist;
  void main() {
    vUv = uv;
    vHue = aHue;
    vec3 p = position;
    p *= aScale;
    // bend increases quadratically toward the blade tip (uv.y = 1 at tip)
    float bend = uv.y * uv.y;
    float swayX = sin(uTime * 0.8 + aPhase) * 0.9 + sin(uTime * 1.7 + aPhase * 2.3) * 0.25;
    float swayZ = cos(uTime * 0.6 + aPhase * 1.4) * 0.55;
    p.x += swayX * bend * aScale;
    p.z += swayZ * bend * aScale;
    p += aOffset;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const WEED_FRAG = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uLight;
  varying vec2 vUv;
  varying float vHue;
  varying float vDist;
  void main() {
    vec3 deep = vec3(0.02, 0.16, 0.08);
    vec3 tip = vec3(0.15, 0.5, 0.22);
    vec3 col = mix(deep, tip, vUv.y);
    col.g += vHue * 0.12;
    col.b += vHue * 0.06;
    // seaweed has no scene lights — dim it with the depth-zone sunlight
    col *= 0.12 + 0.88 * uLight;
    float f = smoothstep(uFogNear, uFogFar, vDist);
    col = mix(col, uFogColor, f);
    gl_FragColor = vec4(col, 1.0);
  }
`

export function Seaweed() {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const geometry = useMemo(() => {
    const COUNT = 260
    const blade = new THREE.PlaneGeometry(0.32, 4.2, 1, 10)
    blade.translate(0, 2.1, 0) // root at origin
    const inst = new THREE.InstancedBufferGeometry()
    inst.index = blade.index
    inst.attributes = blade.attributes
    const offset = new Float32Array(COUNT * 3)
    const phase = new Float32Array(COUNT)
    const scale = new Float32Array(COUNT)
    const hue = new Float32Array(COUNT)
    // meadows: clumps of blades around anchor points
    const anchors: { x: number; z: number }[] = []
    for (let i = 0; i < 18; i++) {
      anchors.push({ x: (fbm2(i * 4.4, 6.6) - 0.5) * 280, z: (fbm2(6.9, i * 3.8) - 0.5) * 280 })
    }
    for (let i = 0; i < COUNT; i++) {
      const a = anchors[i % anchors.length]
      const x = a.x + (fbm2(i * 1.3, 0.2) - 0.5) * 9
      const z = a.z + (fbm2(0.5, i * 1.9) - 0.5) * 9
      offset[i * 3] = x
      offset[i * 3 + 1] = terrainHeight(x, z)
      offset[i * 3 + 2] = z
      phase[i] = fbm2(i * 0.7, 3.1) * Math.PI * 4
      scale[i] = 0.5 + fbm2(i * 0.4, 8.8) * 1.6
      hue[i] = fbm2(i * 2.2, 4.4)
    }
    inst.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offset, 3))
    inst.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1))
    inst.setAttribute("aScale", new THREE.InstancedBufferAttribute(scale, 1))
    inst.setAttribute("aHue", new THREE.InstancedBufferAttribute(hue, 1))
    inst.instanceCount = COUNT
    return inst
  }, [])

  useFrame((state) => {
    const m = matRef.current
    if (!m) return
    m.uniforms.uTime.value = state.clock.elapsedTime
    const fog = state.scene.fog as THREE.Fog | null
    if (fog) {
      m.uniforms.uFogColor.value.copy(fog.color)
      m.uniforms.uFogNear.value = fog.near
      m.uniforms.uFogFar.value = fog.far
    }
    m.uniforms.uLight.value += (ZONES[ocean.zoneIndex].light - m.uniforms.uLight.value) * 0.03
  })

  return (
    <mesh geometry={geometry as unknown as THREE.BufferGeometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={WEED_VERT}
        fragmentShader={WEED_FRAG}
        side={THREE.DoubleSide}
        uniforms={{
          uTime: { value: 0 },
          uFogColor: { value: new THREE.Color("#0e6e96") },
          uFogNear: { value: 22 },
          uFogFar: { value: 130 },
          uLight: { value: 1 },
        }}
      />
    </mesh>
  )
}

export default function Seafloor() {
  return (
    <>
      <Terrain />
      <Rocks />
      <Corals />
      <Seaweed />
    </>
  )
}
