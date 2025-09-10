"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import { Vector3 } from "three"
import * as THREE from "three"

// Migration patterns for jellyfish
const JELLYFISH_PATTERNS = {
  VERTICAL_DRIFT: 'vertical_drift',
  CIRCULAR_FLOAT: 'circular_float',
  RANDOM_DRIFT: 'random_drift',
  GENTLE_SWAY: 'gentle_sway',
  DEEP_CURRENT: 'deep_current',
  SEASONAL_MIGRATION: 'seasonal_migration',
  THERMAL_LAYERS: 'thermal_layers',
  TIDAL_DRIFT: 'tidal_drift'
}

// Individual jellyfish component - completely independent
function IndependentJellyfish({ 
  position, 
  scale = [1, 1, 1], 
  jellyfishId,
  type = 'moon',
  glowIntensity = 1,
  driftPattern = JELLYFISH_PATTERNS.RANDOM_DRIFT,
  patternData = {}
}) {
  const jellyfishRef = useRef()
  const bellRef = useRef()
  const tentacleRefs = useRef([])
  
  // Movement state
  const velocity = useRef(new Vector3(0, 0, 0))
  const pulsePhase = useRef(Math.random() * Math.PI * 2)
  const driftPhase = useRef(Math.random() * Math.PI * 2)
  const tentaclePhases = useRef(Array.from({ length: 4 }, () => Math.random() * Math.PI * 2))
  
  // Pattern-specific state
  const patternPhase = useRef(Math.random() * Math.PI * 2)
  const currentTarget = useRef(new Vector3(...position))
  const behaviorState = useRef('drifting')
  const stateTimer = useRef(Math.random() * 20 + 15) // Shorter state durations
  const seasonalTimer = useRef(Math.random() * 80) // For seasonal changes
  
  // Drift behavior
  const driftTarget = useRef(new Vector3(
    position[0] + (Math.random() - 0.5) * 18,
    position[1] + (Math.random() - 0.5) * 4,
    position[2] + (Math.random() - 0.5) * 18
  ))
  const driftTimer = useRef(Math.random() * 15 + 10)
  
  // Jellyfish properties based on type
  const jellyfishProps = useMemo(() => {
    switch (type) {
      case 'moon':
        return {
          bellColor: '#E8F4FD',
          tentacleColor: '#B3D9F2',
          glowColor: '#87CEEB',
          bellRadius: 0.6 + Math.random() * 0.4,
          bellHeight: 0.4 + Math.random() * 0.2,
          tentacleCount: 4,
          tentacleLength: 1.5 + Math.random() * 1,
          pulseSpeed: 0.3 + Math.random() * 0.15, // Increased from 0.1
          driftSpeed: 0.08 + Math.random() * 0.04, // Increased from 0.02
          opacity: 0.7,
          maxSpeed: 0.012 + Math.random() * 0.008 // Increased from 0.003
        }
      case 'crystal':
        return {
          bellColor: '#F0F8FF',
          tentacleColor: '#E6F3FF',
          glowColor: '#B0E0E6',
          bellRadius: 0.4 + Math.random() * 0.3,
          bellHeight: 0.3 + Math.random() * 0.2,
          tentacleCount: 6,
          tentacleLength: 1 + Math.random() * 0.8,
          pulseSpeed: 0.35 + Math.random() * 0.18,
          driftSpeed: 0.1 + Math.random() * 0.06,
          opacity: 0.8,
          maxSpeed: 0.015 + Math.random() * 0.008
        }
      case 'bioluminescent':
        return {
          bellColor: '#1A0D26',
          tentacleColor: '#2D1B3D',
          glowColor: '#00FFFF',
          bellRadius: 0.5 + Math.random() * 0.4,
          bellHeight: 0.4 + Math.random() * 0.2,
          tentacleCount: 5,
          tentacleLength: 2 + Math.random() * 1,
          pulseSpeed: 0.25 + Math.random() * 0.12,
          driftSpeed: 0.06 + Math.random() * 0.04,
          opacity: 0.6,
          maxSpeed: 0.008 + Math.random() * 0.006
        }
      case 'deep':
        return {
          bellColor: '#2C1810',
          tentacleColor: '#4A2C17',
          glowColor: '#FF6B35',
          bellRadius: 0.8 + Math.random() * 0.5,
          bellHeight: 0.6 + Math.random() * 0.3,
          tentacleCount: 4,
          tentacleLength: 2.5 + Math.random() * 1.5,
          pulseSpeed: 0.2 + Math.random() * 0.1,
          driftSpeed: 0.04 + Math.random() * 0.03,
          opacity: 0.9,
          maxSpeed: 0.006 + Math.random() * 0.004
        }
      default:
        return {
          bellColor: '#E8F4FD',
          tentacleColor: '#B3D9F2',
          glowColor: '#87CEEB',
          bellRadius: 0.6,
          bellHeight: 0.4,
          tentacleCount: 4,
          tentacleLength: 1.5,
          pulseSpeed: 0.3,
          driftSpeed: 0.08,
          opacity: 0.7,
          maxSpeed: 0.012
        }
    }
  }, [type])

  // Calculate drift target based on pattern
  const calculateDriftTarget = (time, pattern, data) => {
    const target = new Vector3()
    const seasonalPhase = Math.sin(time * 0.008) // Slow seasonal change
    
    switch (pattern) {
      case JELLYFISH_PATTERNS.VERTICAL_DRIFT:
        const amplitude = data.amplitude || 5
        const baseY = data.baseY || position[1]
        const speed = data.speed || 0.006 // Increased speed
        // Seasonal depth changes
        const seasonalDepth = Math.sin(time * 0.003) * 2
        target.set(
          data.centerX || position[0],
          baseY + seasonalDepth + Math.sin(time * speed + patternPhase.current) * amplitude,
          data.centerZ || position[2]
        )
        break
        
      case JELLYFISH_PATTERNS.CIRCULAR_FLOAT:
        const radius = data.radius || 8
        const centerX = data.centerX || position[0]
        const centerZ = data.centerZ || position[2]
        const circleSpeed = data.speed || 0.004 // Increased speed
        // Seasonal drift of the entire circle
        const seasonalDriftX = Math.sin(time * 0.002) * 10
        const seasonalDriftZ = Math.cos(time * 0.0025) * 8
        target.set(
          centerX + seasonalDriftX + Math.cos(time * circleSpeed + patternPhase.current) * radius,
          data.baseY || position[1],
          centerZ + seasonalDriftZ + Math.sin(time * circleSpeed + patternPhase.current) * radius
        )
        break
        
      case JELLYFISH_PATTERNS.GENTLE_SWAY:
        const swayX = data.swayX || 4
        const swayZ = data.swayZ || 3
        const swaySpeed = data.speed || 0.005 // Increased speed
        // Large seasonal movements
        const bigDriftX = Math.sin(time * 0.001) * 15
        const bigDriftZ = Math.cos(time * 0.0012) * 12
        target.set(
          position[0] + bigDriftX + Math.sin(time * swaySpeed + patternPhase.current) * swayX,
          data.baseY || position[1],
          position[2] + bigDriftZ + Math.cos(time * swaySpeed * 0.7 + patternPhase.current) * swayZ
        )
        break
        
      case JELLYFISH_PATTERNS.DEEP_CURRENT:
        const currentSpeed = data.speed || 0.003 // Increased speed
        const currentRange = data.range || 12
        // Seasonal current direction changes
        const currentDirection = Math.sin(time * 0.0008) * Math.PI
        target.set(
          data.startX + Math.sin(time * currentSpeed + currentDirection) * currentRange,
          data.baseY || position[1],
          data.startZ + Math.cos(time * currentSpeed * 0.6 + currentDirection) * currentRange * 0.8
        )
        break

      case JELLYFISH_PATTERNS.SEASONAL_MIGRATION:
        // Large-scale seasonal movements between different ocean areas
        const migrationAreas = data.migrationAreas || [
          { x: 15, y: -1, z: 20 },
          { x: -20, y: -3, z: -15 },
          { x: 25, y: -2, z: -25 },
          { x: -25, y: -4, z: 18 }
        ]
        const migrationTime = data.migrationTime || 180 // 3 minutes per area
        const areaIndex = Math.floor((time / migrationTime) % migrationAreas.length)
        const currentArea = migrationAreas[areaIndex]
        // Gentle movement around the migration area
        const areaRadius = 12
        const areaAngle = time * 0.008 + jellyfishId
        target.set(
          currentArea.x + Math.cos(areaAngle) * areaRadius,
          currentArea.y,
          currentArea.z + Math.sin(areaAngle) * areaRadius
        )
        break

      case JELLYFISH_PATTERNS.THERMAL_LAYERS:
        // Follow thermal layers that change with time
        const thermalCycle = Math.sin(time * 0.005) // Thermal layer movement
        const layerDepth = data.preferredDepth || -3
        const thermalAmplitude = data.thermalAmplitude || 3
        const currentThermalDepth = layerDepth + thermalCycle * thermalAmplitude
        // Horizontal drift following thermal currents
        const thermalDrift = time * 0.003
        target.set(
          data.centerX + Math.sin(thermalDrift) * 18,
          currentThermalDepth,
          data.centerZ + Math.cos(thermalDrift * 0.8) * 15
        )
        break

      case JELLYFISH_PATTERNS.TIDAL_DRIFT:
        // Simulate tidal movements
        const tidalCycle = Math.sin(time * 0.01) // Faster tidal cycle
        const tidalStrength = data.tidalStrength || 20
        const tidalDirection = data.tidalDirection || 0
        target.set(
          data.centerX + Math.cos(tidalDirection) * tidalCycle * tidalStrength,
          data.baseY || position[1],
          data.centerZ + Math.sin(tidalDirection) * tidalCycle * tidalStrength
        )
        break
        
      case JELLYFISH_PATTERNS.RANDOM_DRIFT:
      default:
        target.copy(driftTarget.current)
        break
    }
    
    return target
  }

  useFrame((state, delta) => {
    if (!jellyfishRef.current) return

    const jellyfish = jellyfishRef.current
    const time = state.clock.elapsedTime
    const props = jellyfishProps

    // Faster phase updates
    pulsePhase.current += delta * props.pulseSpeed * 0.4 // Increased from 0.1
    driftPhase.current += delta * props.driftSpeed * 0.4 // Increased from 0.1

    // Update behavior state
    stateTimer.current -= delta
    if (stateTimer.current <= 0) {
      const behaviors = ['drifting', 'resting', 'pulsing', 'migrating', 'feeding']
      behaviorState.current = behaviors[Math.floor(Math.random() * behaviors.length)]
      stateTimer.current = 12 + Math.random() * 25 // Shorter state durations
    }

    // Seasonal pattern changes
    seasonalTimer.current -= delta
    if (seasonalTimer.current <= 0) {
      // Occasionally change drift pattern for dynamic environment
      if (Math.random() < 0.15) { // 15% chance
        const patterns = Object.values(JELLYFISH_PATTERNS)
        driftPattern = patterns[Math.floor(Math.random() * patterns.length)]
      }
      seasonalTimer.current = 60 + Math.random() * 80 // 1-2.3 minutes
    }

    // Calculate target based on drift pattern
    currentTarget.current = calculateDriftTarget(time, driftPattern, patternData)

    // Update drift target for random drift pattern
    if (driftPattern === JELLYFISH_PATTERNS.RANDOM_DRIFT) {
      driftTimer.current -= delta
      if (driftTimer.current <= 0) {
        const driftRange = 15
        driftTarget.current.set(
          jellyfish.position.x + (Math.random() - 0.5) * driftRange,
          jellyfish.position.y + (Math.random() - 0.5) * 5,
          jellyfish.position.z + (Math.random() - 0.5) * driftRange
        )
        driftTimer.current = 10 + Math.random() * 20 // Shorter drift intervals
      }
    }

    // Adjust movement based on behavior
    let speedMultiplier = 1
    if (behaviorState.current === 'resting') {
      speedMultiplier = 0.3 // Slower when resting
    } else if (behaviorState.current === 'pulsing') {
      speedMultiplier = 1.8 // More active when pulsing
    } else if (behaviorState.current === 'migrating') {
      speedMultiplier = 2.2 // Fastest when migrating
    } else if (behaviorState.current === 'feeding') {
      speedMultiplier = 0.6 // Moderate when feeding
    }

    // === MORE ACTIVE JELLYFISH MOVEMENT ===
    
    // More noticeable vertical pulsing
    const pulseStrength = Math.sin(pulsePhase.current) * 0.3 + 0.5
    const verticalForce = Math.sin(pulsePhase.current) * 0.002 * speedMultiplier // Increased from 0.0003
    
    // More active horizontal drifting toward target
    const toTarget = new Vector3().subVectors(currentTarget.current, jellyfish.position)
    const targetDistance = toTarget.length()
    
    if (targetDistance > 0.8) { // Smaller tolerance for more active seeking
      toTarget.normalize()
      toTarget.multiplyScalar(props.maxSpeed * speedMultiplier * 0.8) // Increased seeking strength
      const driftX = toTarget.x * 0.4 // Increased from 0.1
      const driftZ = toTarget.z * 0.4 // Increased from 0.1
      
      velocity.current.x += driftX
      velocity.current.z += driftZ
    }
    
    // Apply vertical pulsing
    velocity.current.y += verticalForce
    
    // More randomness for liveliness
    velocity.current.x += (Math.random() - 0.5) * 0.0002 // Increased from 0.00002
    velocity.current.z += (Math.random() - 0.5) * 0.0002
    
    // Less damping for more responsive movement
    velocity.current.multiplyScalar(0.88) // Reduced from 0.8
    
    // Faster velocity limit
    velocity.current.clampLength(0, props.maxSpeed * speedMultiplier)
    
    // Apply velocity with faster movement
    jellyfish.position.add(velocity.current.clone().multiplyScalar(delta * 2.5)) // Increased from 0.8

    // === BOUNDARY CONSTRAINTS ===
    
    const bounds = 30
    if (jellyfish.position.x > bounds) {
      jellyfish.position.x = bounds
      velocity.current.x *= -0.3
    } else if (jellyfish.position.x < -bounds) {
      jellyfish.position.x = -bounds
      velocity.current.x *= -0.3
    }
    
    if (jellyfish.position.z > bounds) {
      jellyfish.position.z = bounds
      velocity.current.z *= -0.3
    } else if (jellyfish.position.z < -bounds) {
      jellyfish.position.z = -bounds
      velocity.current.z *= -0.3
    }
    
    if (jellyfish.position.y > 3) {
      jellyfish.position.y = 3
      velocity.current.y *= -0.2
    } else if (jellyfish.position.y < -8) {
      jellyfish.position.y = -8
      velocity.current.y *= -0.2
    }

    // === MORE ACTIVE BELL ANIMATION ===
    
    if (bellRef.current) {
      // More noticeable pulsing
      const bellPulse = Math.sin(pulsePhase.current) * 0.15 + 1 // Increased from 0.05
      bellRef.current.scale.set(bellPulse, 1 - (bellPulse - 1) * 0.3, bellPulse)
      
      // More noticeable rotation
      bellRef.current.rotation.y += Math.sin(time * 0.3 + jellyfishId) * 0.008 // Increased from 0.001
    }

    // === MORE ACTIVE TENTACLE ANIMATION ===
    
    tentacleRefs.current.forEach((tentacle, index) => {
      if (!tentacle) return
      
      // Faster tentacle phase updates
      tentaclePhases.current[index] += delta * (0.2 + Math.sin(pulsePhase.current) * 0.1) // Increased from 0.05 + 0.02
      
      // More noticeable tentacle swaying
      const swayX = Math.sin(tentaclePhases.current[index] + index * 0.5) * 0.08 // Increased from 0.02
      const swayZ = Math.cos(tentaclePhases.current[index] * 0.7 + index * 0.3) * 0.06 // Increased from 0.015
      
      // More noticeable contraction
      const contraction = Math.sin(pulsePhase.current + index * 0.2) * 0.05 + 1 // Increased from 0.01
      
      tentacle.rotation.x = swayX
      tentacle.rotation.z = swayZ
      tentacle.scale.y = contraction
    })

    // === MORE ACTIVE BIOLUMINESCENCE EFFECT ===
    
    if (type === 'bioluminescent' || type === 'deep') {
      // More active glow pulse
      const glowPulse = Math.sin(time * 0.8 + jellyfishId) * 0.3 + 0.7 // Increased variation
      
      jellyfish.traverse((child) => {
        if (child.isMesh && child.material) {
          if (child.material.emissive) {
            const emissiveColor = new THREE.Color(props.glowColor)
            child.material.emissive = emissiveColor.multiplyScalar(glowPulse * glowIntensity * 0.25) // Increased from 0.15
          }
        }
      })
    }
  })

  // Simplified tentacle creation
  const createTentacle = (index, totalTentacles) => {
    const angle = (index / totalTentacles) * Math.PI * 2
    const radius = jellyfishProps.bellRadius * 0.7
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius
    
    return (
      <group 
        key={index}
        position={[x, -jellyfishProps.bellHeight * 0.3, z]}
        ref={(ref) => {
          if (ref) tentacleRefs.current[index] = ref
        }}
      >
        {/* Single tentacle segment for performance */}
        <mesh position={[0, -jellyfishProps.tentacleLength/2, 0]}>
          <cylinderGeometry args={[0.01, 0.008, jellyfishProps.tentacleLength, 3]} />
          <meshStandardMaterial 
            color={jellyfishProps.tentacleColor}
            transparent
            opacity={jellyfishProps.opacity * 0.8}
            emissive={type === 'bioluminescent' || type === 'deep' ? jellyfishProps.glowColor : '#000000'}
            emissiveIntensity={0.05}
          />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={jellyfishRef} position={position} scale={scale}>
      {/* Jellyfish bell */}
      <mesh ref={bellRef} position={[0, 0, 0]}>
        <sphereGeometry args={[jellyfishProps.bellRadius, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.7]} />
        <meshStandardMaterial 
          color={jellyfishProps.bellColor}
          transparent
          opacity={jellyfishProps.opacity}
          side={THREE.DoubleSide}
          emissive={type === 'bioluminescent' || type === 'deep' ? jellyfishProps.glowColor : '#000000'}
          emissiveIntensity={0.12} // Increased from 0.08
        />
      </mesh>

      {/* Tentacles */}
      {Array.from({ length: jellyfishProps.tentacleCount }, (_, index) => 
        createTentacle(index, jellyfishProps.tentacleCount)
      )}

      {/* Bioluminescent light */}
      {(type === 'bioluminescent' || type === 'deep') && (
        <pointLight 
          position={[0, 0, 0]}
          color={jellyfishProps.glowColor}
          intensity={glowIntensity * 0.4} // Increased from 0.2
          distance={6} // Increased from 4
          decay={2}
        />
      )}
    </group>
  )
}

export default function IndependentJellyfishSwarm() {
  // Create individual jellyfish scattered around the ocean
  const jellyfishData = useMemo(() => {
    const jellyfish = []
    const jellyfishCount = 10 // Optimized count
    
    const types = ['moon', 'crystal', 'bioluminescent', 'deep']
    
    for (let i = 0; i < jellyfishCount; i++) {
      // Spread jellyfish around the ocean with good spacing
      const angle = (i / jellyfishCount) * Math.PI * 2 + Math.random() * 0.8
      const distance = 6 + Math.random() * 20
      const x = Math.cos(angle) * distance + (Math.random() - 0.5) * 10
      const z = Math.sin(angle) * distance + (Math.random() - 0.5) * 10
      const y = Math.random() * -5 - 1 // Various depths
      
      const position = [x, y, z]
      const type = types[Math.floor(Math.random() * types.length)]
      const scale = [
        0.6 + Math.random() * 1.0,
        0.6 + Math.random() * 1.0,
        0.6 + Math.random() * 1.0
      ]
      const glowIntensity = 0.6 + Math.random() * 1.0
      
      // Assign different drift patterns with seasonal behavior
      const patterns = [
        JELLYFISH_PATTERNS.RANDOM_DRIFT,
        JELLYFISH_PATTERNS.VERTICAL_DRIFT,
        JELLYFISH_PATTERNS.CIRCULAR_FLOAT,
        JELLYFISH_PATTERNS.GENTLE_SWAY,
        JELLYFISH_PATTERNS.DEEP_CURRENT,
        JELLYFISH_PATTERNS.SEASONAL_MIGRATION,
        JELLYFISH_PATTERNS.THERMAL_LAYERS,
        JELLYFISH_PATTERNS.TIDAL_DRIFT
      ]
      
      const driftPattern = patterns[Math.floor(Math.random() * patterns.length)]
      
      let patternData = {}
      switch (driftPattern) {
        case JELLYFISH_PATTERNS.VERTICAL_DRIFT:
          patternData = {
            amplitude: 3 + Math.random() * 4,
            centerX: x,
            centerZ: z,
            baseY: y,
            speed: 0.003 + Math.random() * 0.006
          }
          break
        case JELLYFISH_PATTERNS.CIRCULAR_FLOAT:
          patternData = {
            radius: 4 + Math.random() * 8,
            centerX: x,
            centerZ: z,
            baseY: y,
            speed: 0.002 + Math.random() * 0.005
          }
          break
        case JELLYFISH_PATTERNS.GENTLE_SWAY:
          patternData = {
            swayX: 3 + Math.random() * 5,
            swayZ: 2 + Math.random() * 4,
            baseY: y,
            speed: 0.003 + Math.random() * 0.004
          }
          break
        case JELLYFISH_PATTERNS.DEEP_CURRENT:
          patternData = {
            startX: x,
            startZ: z,
            baseY: y,
            range: 8 + Math.random() * 12,
            speed: 0.001 + Math.random() * 0.003
          }
          break
        case JELLYFISH_PATTERNS.SEASONAL_MIGRATION:
          patternData = {
            migrationAreas: [
              { x: 20, y: -1, z: 25 },
              { x: -25, y: -3, z: -20 },
              { x: 30, y: -2, z: -30 },
              { x: -30, y: -4, z: 22 }
            ],
            migrationTime: 120 + Math.random() * 120 // 2-4 minutes per area
          }
          break
        case JELLYFISH_PATTERNS.THERMAL_LAYERS:
          patternData = {
            centerX: x,
            centerZ: z,
            preferredDepth: y,
            thermalAmplitude: 2 + Math.random() * 3
          }
          break
        case JELLYFISH_PATTERNS.TIDAL_DRIFT:
          patternData = {
            centerX: x,
            centerZ: z,
            baseY: y,
            tidalStrength: 15 + Math.random() * 10,
            tidalDirection: Math.random() * Math.PI * 2
          }
          break
      }
      
      jellyfish.push({
        id: i,
        position,
        type,
        scale,
        glowIntensity,
        driftPattern,
        patternData
      })
    }
    
    return jellyfish
  }, [])

  return (
    <group>
      {jellyfishData.map((jellyfish) => (
        <IndependentJellyfish
          key={jellyfish.id}
          jellyfishId={jellyfish.id}
          position={jellyfish.position}
          type={jellyfish.type}
          scale={jellyfish.scale}
          glowIntensity={jellyfish.glowIntensity}
          driftPattern={jellyfish.driftPattern}
          patternData={jellyfish.patternData}
        />
      ))}
    </group>
  )
}
