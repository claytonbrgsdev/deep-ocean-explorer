"use client"

import { useRef, useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { ocean, ZONES, zoneIndexAtDepth, WORLD, GLSL_NOISE } from "@/lib/ocean"

// ---------------------------------------------------------------------------
// Atmosphere stack. Every effect is a hand-written ShaderMaterial (no
// post-processing library) and every depth-sensitive uniform is lerped per
// frame — depth is a continuous variable, never a step function.
// ---------------------------------------------------------------------------

// ------------------------------ lighting -----------------------------------

export function DepthLighting() {
  const ambientRef = useRef<THREE.AmbientLight>(null)
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const { scene } = useThree()

  const cur = useMemo(
    () => ({
      ambient: ZONES[0].ambient.clone(),
      ambientIntensity: ZONES[0].ambientIntensity,
      sun: ZONES[0].sun.clone(),
      sunIntensity: ZONES[0].sunIntensity,
      fog: ZONES[0].fog.clone(),
      fogNear: ZONES[0].fogNear,
      fogFar: ZONES[0].fogFar,
      light: 1,
    }),
    []
  )

  useFrame((_, dt) => {
    const delta = Math.min(dt, 0.05)
    const idx = zoneIndexAtDepth(ocean.depth)
    ocean.zoneIndex = idx
    const zone = ZONES[idx]
    const next = ZONES[Math.min(idx + 1, ZONES.length - 1)]
    const span = next.from > zone.from ? next.from - zone.from : 12
    ocean.zoneBlend = THREE.MathUtils.clamp((ocean.depth - zone.from) / span, 0, 1)

    const k = 1 - Math.exp(-1.6 * delta)
    cur.ambient.lerp(zone.ambient, k)
    cur.sun.lerp(zone.sun, k)
    cur.fog.lerp(zone.fog, k)
    cur.ambientIntensity += (zone.ambientIntensity - cur.ambientIntensity) * k
    cur.sunIntensity += (zone.sunIntensity - cur.sunIntensity) * k
    cur.fogNear += (zone.fogNear - cur.fogNear) * k
    cur.fogFar += (zone.fogFar - cur.fogFar) * k
    cur.light += (zone.light - cur.light) * k

    if (ambientRef.current) {
      ambientRef.current.color.copy(cur.ambient)
      ambientRef.current.intensity = cur.ambientIntensity
    }
    if (sunRef.current) {
      sunRef.current.color.copy(cur.sun)
      sunRef.current.intensity = cur.sunIntensity
      sunRef.current.position.set(ocean.playerPos.x + 14, 30, ocean.playerPos.z + 8)
      sunRef.current.target.position.copy(ocean.playerPos)
      sunRef.current.target.updateMatrixWorld()
    }
    const fog = scene.fog as THREE.Fog | null
    if (fog) {
      fog.color.copy(cur.fog)
      fog.near = cur.fogNear
      fog.far = cur.fogFar
    }
  })

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.7} />
      <directionalLight ref={sunRef} position={[14, 30, 8]} intensity={1.6} />
      <fog attach="fog" args={["#0e6e96", 22, 130]} />
    </>
  )
}

// ------------------------------ background ---------------------------------

const BG_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vLocal = position; // sphere is camera-centered: local pos = view direction
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const BG_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uHaze;
  uniform float uLight;
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    float h = clamp((vWorld.y + 260.0) / 520.0, 0.0, 1.0);
    vec3 col = mix(uBottom, uTop, pow(h, 1.4));
    // faint sun glow overhead, fades with depth
    vec3 dir = normalize(vLocal);
    float sun = pow(max(0.0, dir.y), 18.0) * uLight;
    col += vec3(0.55, 0.75, 0.85) * sun * 0.5;
    // underwater horizon: the view dissolves into scattered haze at eye
    // level — no hard line where surface meets distance
    float horiz = exp(-abs(dir.y + 0.06) * 5.0);
    col = mix(col, uHaze, horiz * 0.85);
    gl_FragColor = vec4(col, 1.0);
  }
`

export function OceanBackground() {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  const cur = useMemo(
    () => ({ top: ZONES[0].bgTop.clone(), bottom: ZONES[0].bgBottom.clone(), haze: ZONES[0].fog.clone(), light: 1 }),
    []
  )

  useFrame((state, dt) => {
    const delta = Math.min(dt, 0.05)
    const zone = ZONES[ocean.zoneIndex]
    const k = 1 - Math.exp(-1.6 * delta)
    cur.top.lerp(zone.bgTop, k)
    cur.bottom.lerp(zone.bgBottom, k)
    cur.haze.lerp(zone.fog, k)
    cur.light += (zone.light - cur.light) * k
    if (matRef.current) {
      matRef.current.uniforms.uTop.value.copy(cur.top)
      matRef.current.uniforms.uBottom.value.copy(cur.bottom)
      matRef.current.uniforms.uHaze.value.copy(cur.haze)
      matRef.current.uniforms.uLight.value = cur.light
    }
    if (meshRef.current) meshRef.current.position.copy(state.camera.position)
  })

  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <sphereGeometry args={[260, 32, 24]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={BG_VERT}
        fragmentShader={BG_FRAG}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
        uniforms={{
          uTop: { value: ZONES[0].bgTop.clone() },
          uBottom: { value: ZONES[0].bgBottom.clone() },
          uHaze: { value: ZONES[0].fog.clone() },
          uLight: { value: 1 },
        }}
      />
    </mesh>
  )
}

// ----------------------------- water surface --------------------------------

const SURF_VERT = /* glsl */ `
  ${GLSL_NOISE}
  uniform float uTime;
  varying float vWave;
  varying float vDist;
  void main() {
    // noise sampled in WORLD space so the pattern stays put while the
    // plane itself follows the camera (an endless surface)
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float w = dn_fbm(vec3(wp.x * 0.06, wp.z * 0.06, uTime * 0.25));
    vec3 pos = position;
    pos.z += w * 1.6; // plane is rotated: local z becomes world y
    vWave = w;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const SURF_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uLight;
  varying float vWave;
  varying float vDist;
  void main() {
    // seen from below: bright shifting membrane
    float sparkle = pow(vWave, 3.0) * 2.4;
    vec3 col = mix(vec3(0.06, 0.35, 0.5), vec3(0.7, 0.95, 1.0), sparkle);
    // dissolve into the horizon haze long before the plane's edge
    float fade = smoothstep(340.0, 90.0, vDist);
    float alpha = (0.35 + sparkle * 0.4) * uLight * fade;
    gl_FragColor = vec4(col * uLight, alpha);
  }
`

export function WaterSurface() {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime
      matRef.current.uniforms.uLight.value = ZONES[ocean.zoneIndex].light
    }
    // endless surface: the plane rides along with the camera
    if (meshRef.current) {
      meshRef.current.position.x = state.camera.position.x
      meshRef.current.position.z = state.camera.position.z
    }
  })
  return (
    <mesh ref={meshRef} rotation={[Math.PI / 2, 0, 0]} position={[0, WORLD.surfaceY, 0]}>
      <planeGeometry args={[900, 900, 72, 72]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={SURF_VERT}
        fragmentShader={SURF_FRAG}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        uniforms={{ uTime: { value: 0 }, uLight: { value: 1 } }}
      />
    </mesh>
  )
}

// --------------------------- volumetric shafts ------------------------------

const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Multi-octave 3D noise + Mie-style forward scattering approximation.
const SHAFT_FRAG = /* glsl */ `
  ${GLSL_NOISE}
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float body = dn_fbm(vec3(vUv.x * 3.0, vUv.y * 1.2 - uTime * 0.06, uTime * 0.05));
    // edge falloff across the cone + fade toward the bottom
    float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
    float fall = pow(vUv.y, 1.6);
    // cheap Mie-ish anisotropy: brighter near the top where rays converge
    float mie = 0.4 + 0.6 * pow(vUv.y, 3.0);
    float a = body * edge * fall * mie * uIntensity;
    vec3 col = vec3(0.55, 0.8, 0.9);
    gl_FragColor = vec4(col * a, a * 0.55);
  }
`

export function LightShafts() {
  const groupRef = useRef<THREE.Group>(null)
  const mats = useRef<THREE.ShaderMaterial[]>([])

  const shafts = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        x: (i - 3) * 14 + (i % 2) * 6,
        z: ((i * 37) % 40) - 20,
        rot: (i / 7) * Math.PI,
        scale: 0.7 + (i % 3) * 0.3,
      })),
    []
  )

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const zone = ZONES[ocean.zoneIndex]
    for (const m of mats.current) {
      if (m) {
        m.uniforms.uTime.value = t
        m.uniforms.uIntensity.value += (zone.light * 0.9 - m.uniforms.uIntensity.value) * 0.03
      }
    }
    if (groupRef.current) {
      // shafts follow the player loosely for a parallax feel
      groupRef.current.position.x = ocean.playerPos.x * 0.6
      groupRef.current.position.z = ocean.playerPos.z * 0.6
      groupRef.current.rotation.y = t * 0.008
    }
  })

  return (
    <group ref={groupRef}>
      {shafts.map((s, i) => (
        <mesh
          key={i}
          position={[s.x, WORLD.surfaceY - 22, s.z]}
          rotation={[0, s.rot, 0.08 + (i % 3) * 0.04]}
          scale={[s.scale, 1, s.scale]}
        >
          <coneGeometry args={[10, 46, 12, 1, true]} />
          <shaderMaterial
            ref={(m) => {
              if (m) mats.current[i] = m
            }}
            vertexShader={SHAFT_VERT}
            fragmentShader={SHAFT_FRAG}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            uniforms={{ uTime: { value: 0 }, uIntensity: { value: 0.9 } }}
          />
        </mesh>
      ))}
    </group>
  )
}

// -------------------------------- caustics ----------------------------------

const CAUSTIC_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Signature technique kept from v1: screen-space derivatives (dFdx/dFdy) of a
// procedural water-height field give the exact surface gradient for free;
// caustic lines appear where the gradient is small (wave crests focus light).
const CAUSTIC_FRAG = /* glsl */ `
  ${GLSL_NOISE}
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 34.0;
    float h = dn_fbm(vec3(p.x, p.y, uTime * 0.35))
            + 0.5 * dn_fbm(vec3(p.y * 1.7 + 13.0, p.x * 1.7, uTime * 0.5));
    vec2 g = vec2(dFdx(h), dFdy(h)) / max(fwidth(h), 1e-4) * 0.12;
    float caustic = 1.0 / (1.0 + dot(g, g) * 22.0);
    caustic = pow(caustic, 1.8);
    // soften toward plane edges so the quad never shows
    float vign = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x)
               * smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
    float a = caustic * vign * uIntensity;
    gl_FragColor = vec4(vec3(0.5, 0.85, 0.95) * a, a);
  }
`

export function Caustics() {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime
      const zone = ZONES[ocean.zoneIndex]
      // slower-than-linear falloff so the sand still shimmers faintly at depth
      const target = Math.pow(zone.light, 0.45) * 0.8
      matRef.current.uniforms.uIntensity.value += (target - matRef.current.uniforms.uIntensity.value) * 0.03
    }
    if (meshRef.current) {
      meshRef.current.position.x = ocean.playerPos.x
      meshRef.current.position.z = ocean.playerPos.z
    }
  })
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, WORLD.floorY + 1.2, 0]}>
      <planeGeometry args={[220, 220]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={CAUSTIC_VERT}
        fragmentShader={CAUSTIC_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 }, uIntensity: { value: 0.8 } }}
      />
    </mesh>
  )
}

// ------------------------------ marine snow ---------------------------------

const SNOW_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  attribute float aSize;
  attribute float aSpeed;
  varying float vFade;
  void main() {
    vec3 span = vec3(150.0, 80.0, 150.0);
    vec3 p = position;
    p.y -= uTime * aSpeed;
    // wrap the particle field around the player
    p = mod(p - uCenter + span * 0.5, span) - span * 0.5 + uCenter;
    p.x += sin(uTime * 0.4 + position.y * 2.1) * 0.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    vFade = smoothstep(70.0, 12.0, dist);
    gl_PointSize = aSize * 130.0 / max(dist, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`

const SNOW_FRAG = /* glsl */ `
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vFade * 0.5;
    gl_FragColor = vec4(vec3(0.75, 0.88, 0.95), a);
  }
`

export function MarineSnow() {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const geometry = useMemo(() => {
    const N = 1300
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const size = new Float32Array(N)
    const speed = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 150
      pos[i * 3 + 1] = (Math.random() - 0.5) * 80 - 30
      pos[i * 3 + 2] = (Math.random() - 0.5) * 150
      size[i] = 0.35 + Math.random() * 0.9
      speed[i] = 0.25 + Math.random() * 0.6
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1))
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1))
    return geo
  }, [])

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime
      matRef.current.uniforms.uCenter.value.copy(ocean.playerPos)
    }
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={SNOW_VERT}
        fragmentShader={SNOW_FRAG}
        transparent
        depthWrite={false}
        uniforms={{ uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() } }}
      />
    </points>
  )
}

// -------------------------- bioluminescent motes ----------------------------
// Invisible near the surface; the deep ocean answers back with its own light.

const MOTE_FRAG = /* glsl */ `
  uniform float uDeep;
  varying float vFade;
  varying float vHue;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    vec3 cyan = vec3(0.2, 0.9, 1.0);
    vec3 violet = vec3(0.6, 0.3, 1.0);
    vec3 col = mix(cyan, violet, vHue);
    float a = core * vFade * uDeep;
    gl_FragColor = vec4(col * a * 2.4, a);
  }
`

const MOTE_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  attribute float aPhase;
  attribute float aHue;
  varying float vFade;
  varying float vHue;
  void main() {
    vec3 span = vec3(120.0, 60.0, 120.0);
    vec3 p = position;
    p.x += sin(uTime * 0.3 + aPhase) * 2.0;
    p.y += cos(uTime * 0.22 + aPhase * 1.7) * 1.5;
    p = mod(p - uCenter + span * 0.5, span) - span * 0.5 + uCenter;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    float blink = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 1.4 + aPhase * 5.0), 3.0);
    vFade = smoothstep(60.0, 8.0, dist) * blink;
    vHue = aHue;
    gl_PointSize = (1.2 + aHue) * 160.0 / max(dist, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`

export function BioMotes() {
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const geometry = useMemo(() => {
    const N = 500
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(N * 3)
    const phase = new Float32Array(N)
    const hue = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120
      pos[i * 3 + 1] = (Math.random() - 0.5) * 60 - 30
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120
      phase[i] = Math.random() * Math.PI * 2
      hue[i] = Math.random()
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    geo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1))
    geo.setAttribute("aHue", new THREE.BufferAttribute(hue, 1))
    return geo
  }, [])

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime
      matRef.current.uniforms.uCenter.value.copy(ocean.playerPos)
      // ramp up as sunlight dies: 0 above 18m, full below ~45m
      const target = THREE.MathUtils.clamp((ocean.depth - 18) / 27, 0, 1)
      matRef.current.uniforms.uDeep.value += (target - matRef.current.uniforms.uDeep.value) * 0.03
    }
  })

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={MOTE_VERT}
        fragmentShader={MOTE_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{ uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uDeep: { value: 0 } }}
      />
    </points>
  )
}

// -------------------------------- bubbles -----------------------------------

export function Bubbles() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const seeds = useMemo(
    () =>
      Array.from({ length: 70 }, () => ({
        vent: Math.floor(Math.random() * 6),
        offset: Math.random() * 60,
        speed: 2.5 + Math.random() * 3,
        wobble: Math.random() * Math.PI * 2,
        scale: 0.05 + Math.random() * 0.16,
      })),
    []
  )
  const vents = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        x: Math.cos((i / 6) * Math.PI * 2) * (18 + i * 9),
        z: Math.sin((i / 6) * Math.PI * 2) * (16 + i * 11),
      })),
    []
  )

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    const rise = WORLD.surfaceY - WORLD.floorY
    seeds.forEach((s, i) => {
      const v = vents[s.vent]
      const y = WORLD.floorY + 2 + ((t * s.speed + s.offset) % rise)
      const grow = 0.6 + ((y - WORLD.floorY) / rise) * 0.9
      dummy.position.set(
        v.x + Math.sin(t * 1.8 + s.wobble + y * 0.15) * 0.7,
        y,
        v.z + Math.cos(t * 1.5 + s.wobble + y * 0.12) * 0.7
      )
      dummy.scale.setScalar(s.scale * grow)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 70]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial color="#bfe8ff" transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  )
}
