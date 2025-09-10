"use client"

import { useRef, useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { Vector3 } from "three"
import * as THREE from "three"

export default function DepthBasedLighting({ playerPosition }) {
  const ambientLightRef = useRef()
  const directionalLightRef = useRef()
  const sunlightRef = useRef()
  const deepLightRef = useRef()
  const volumetricLightRef = useRef()
  
  // Create depth-based fog that changes with player depth
  const { scene } = useThree()
  
  // Depth zones configuration
  const depthZones = useMemo(() => ({
    surface: { min: 2, max: 8, color: '#87CEEB', intensity: 1.0 },
    shallow: { min: -2, max: 2, color: '#4FC3F7', intensity: 0.8 },
    medium: { min: -6, max: -2, color: '#2196F3', intensity: 0.6 },
    deep: { min: -10, max: -6, color: '#1565C0', intensity: 0.4 },
    abyss: { min: -15, max: -10, color: '#0D47A1', intensity: 0.2 }
  }), [])

  // Calculate current depth zone and interpolation
  const getDepthInfo = (depth) => {
    let currentZone = 'abyss'
    let nextZone = null
    let interpolation = 0

    // Find current zone
    for (const [zoneName, zone] of Object.entries(depthZones)) {
      if (depth >= zone.min && depth <= zone.max) {
        currentZone = zoneName
        break
      }
    }

    // Calculate interpolation between zones
    const zones = Object.keys(depthZones)
    const currentIndex = zones.indexOf(currentZone)
    const current = depthZones[currentZone]
    
    if (currentIndex > 0 && depth < current.max) {
      nextZone = zones[currentIndex - 1]
      const next = depthZones[nextZone]
      interpolation = (depth - current.min) / (current.max - current.min)
    } else if (currentIndex < zones.length - 1 && depth > current.min) {
      nextZone = zones[currentIndex + 1]
      const next = depthZones[nextZone]
      interpolation = (current.max - depth) / (current.max - current.min)
    }

    return { currentZone, nextZone, interpolation: Math.max(0, Math.min(1, interpolation)) }
  }

  // Interpolate between two colors
  const interpolateColor = (color1, color2, factor) => {
    const c1 = new THREE.Color(color1)
    const c2 = new THREE.Color(color2)
    return c1.lerp(c2, factor)
  }

  useFrame((state, delta) => {
    const depth = playerPosition.y
    const { currentZone, nextZone, interpolation } = getDepthInfo(depth)
    
    const current = depthZones[currentZone]
    const next = nextZone ? depthZones[nextZone] : current

    // Interpolate lighting properties
    const targetIntensity = THREE.MathUtils.lerp(current.intensity, next.intensity, interpolation)
    const targetColor = interpolateColor(current.color, next.color, interpolation)

    // Update ambient light based on depth
    if (ambientLightRef.current) {
      // Deeper = dimmer ambient light
      const ambientIntensity = Math.max(0.05, targetIntensity * 0.15)
      ambientLightRef.current.intensity = THREE.MathUtils.lerp(
        ambientLightRef.current.intensity,
        ambientIntensity,
        delta * 2
      )
      ambientLightRef.current.color.lerp(targetColor, delta * 2)
    }

    // Update directional light (main underwater lighting)
    if (directionalLightRef.current) {
      // Simulate sunlight penetration - gets weaker with depth
      const sunPenetration = Math.max(0.1, Math.min(1, (depth + 15) / 20))
      const directionalIntensity = targetIntensity * 0.6 * sunPenetration
      
      directionalLightRef.current.intensity = THREE.MathUtils.lerp(
        directionalLightRef.current.intensity,
        directionalIntensity,
        delta * 2
      )
      directionalLightRef.current.color.lerp(targetColor, delta * 2)
      
      // Adjust directional light angle based on depth (more scattered at depth)
      const angle = Math.max(0.3, 1 - (Math.abs(depth) / 15))
      directionalLightRef.current.position.y = 40 * angle + 10
    }

    // Update sunlight rays (only visible in shallow water)
    if (sunlightRef.current) {
      const sunlightIntensity = depth > -3 ? Math.max(0, (depth + 8) / 5) * 0.3 : 0
      sunlightRef.current.intensity = THREE.MathUtils.lerp(
        sunlightRef.current.intensity,
        sunlightIntensity,
        delta * 3
      )
    }

    // Update deep water point light (only active in deep zones)
    if (deepLightRef.current) {
      const deepIntensity = depth < -8 ? Math.max(0, (-depth - 8) / 7) * 0.15 : 0
      deepLightRef.current.intensity = THREE.MathUtils.lerp(
        deepLightRef.current.intensity,
        deepIntensity,
        delta * 2
      )
      
      // Move deep light to follow player loosely
      deepLightRef.current.position.x = THREE.MathUtils.lerp(
        deepLightRef.current.position.x,
        playerPosition.x,
        delta * 0.5
      )
      deepLightRef.current.position.z = THREE.MathUtils.lerp(
        deepLightRef.current.position.z,
        playerPosition.z,
        delta * 0.5
      )
    }

    // Update volumetric light effect
    if (volumetricLightRef.current) {
      const volumetricIntensity = depth > -6 ? Math.max(0, (depth + 10) / 4) * 0.2 : 0
      volumetricLightRef.current.intensity = THREE.MathUtils.lerp(
        volumetricLightRef.current.intensity,
        volumetricIntensity,
        delta * 2
      )
    }

    // Update scene fog based on depth
    if (scene.fog) {
      const fogNear = Math.max(5, 15 - Math.abs(depth) * 0.5)
      const fogFar = Math.max(25, 60 - Math.abs(depth) * 2)
      
      scene.fog.near = THREE.MathUtils.lerp(scene.fog.near, fogNear, delta * 2)
      scene.fog.far = THREE.MathUtils.lerp(scene.fog.far, fogFar, delta * 2)
      scene.fog.color.lerp(targetColor.clone().multiplyScalar(0.3), delta * 2)
    }
  })

  return (
    <group>
      {/* Main ambient light - changes with depth */}
      <ambientLight 
        ref={ambientLightRef}
        intensity={0.15} 
        color="#1E3A8A" 
      />
      
      {/* Main directional light - simulates filtered sunlight */}
      <directionalLight
        ref={directionalLightRef}
        position={[30, 40, 30]}
        intensity={0.4}
        color="#4FC3F7"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={100}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-bias={-0.0001}
      />

      {/* Sunlight rays - only visible in shallow water */}
      <directionalLight
        ref={sunlightRef}
        position={[20, 35, 15]}
        intensity={0}
        color="#FFE082"
        castShadow={false}
      />

      {/* Deep water mysterious light */}
      <pointLight 
        ref={deepLightRef}
        position={[0, -12, 0]}
        intensity={0}
        color="#1A237E"
        distance={25}
        decay={2}
      />

      {/* Volumetric light effect for shallow areas */}
      <spotLight
        ref={volumetricLightRef}
        position={[10, 8, 10]}
        intensity={0}
        color="#B3E5FC"
        angle={Math.PI / 3}
        penumbra={0.5}
        distance={30}
        decay={2}
        castShadow={false}
      />

      {/* Additional atmospheric point lights that respond to depth */}
      <DepthResponsivePointLight 
        position={[15, 0, 15]} 
        playerDepth={playerPosition.y}
        baseColor="#00E5FF"
        shallowIntensity={0.2}
        deepIntensity={0.05}
      />
      
      <DepthResponsivePointLight 
        position={[-20, -2, 10]} 
        playerDepth={playerPosition.y}
        baseColor="#18FFFF"
        shallowIntensity={0.15}
        deepIntensity={0.08}
      />

      <DepthResponsivePointLight 
        position={[5, -5, -25]} 
        playerDepth={playerPosition.y}
        baseColor="#40C4FF"
        shallowIntensity={0.1}
        deepIntensity={0.12}
      />
    </group>
  )
}

// Helper component for depth-responsive point lights
function DepthResponsivePointLight({ 
  position, 
  playerDepth, 
  baseColor, 
  shallowIntensity = 0.2, 
  deepIntensity = 0.1 
}) {
  const lightRef = useRef()

  useFrame((state, delta) => {
    if (!lightRef.current) return

    // Calculate intensity based on depth
    const depthFactor = Math.max(0, Math.min(1, (playerDepth + 15) / 20))
    const targetIntensity = THREE.MathUtils.lerp(deepIntensity, shallowIntensity, depthFactor)
    
    // Smooth intensity transition
    lightRef.current.intensity = THREE.MathUtils.lerp(
      lightRef.current.intensity,
      targetIntensity,
      delta * 2
    )

    // Subtle color shift based on depth
    const depthColor = new THREE.Color(baseColor)
    if (playerDepth < -8) {
      // Deeper water - shift towards blue/purple
      depthColor.lerp(new THREE.Color("#1A237E"), 0.3)
    } else if (playerDepth > -2) {
      // Shallow water - shift towards cyan/white
      depthColor.lerp(new THREE.Color("#E1F5FE"), 0.2)
    }
    
    lightRef.current.color.lerp(depthColor, delta * 1.5)

    // Subtle flickering effect for realism
    const flicker = 1 + Math.sin(state.clock.elapsedTime * 2 + position[0]) * 0.05
    lightRef.current.intensity *= flicker
  })

  return (
    <pointLight 
      ref={lightRef}
      position={position}
      intensity={shallowIntensity}
      color={baseColor}
      distance={30}
      decay={2}
    />
  )
}
