"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import { Vector3 } from "three"
import * as THREE from "three"

// Migration patterns for different fish types
const MIGRATION_PATTERNS = {
  CIRCULAR: 'circular',
  FIGURE_EIGHT: 'figure_eight',
  VERTICAL: 'vertical',
  SEASONAL_DRIFT: 'seasonal_drift',
  RANDOM_WANDER: 'random_wander',
  FEEDING_MIGRATION: 'feeding_migration',
  DEEP_SHALLOW_CYCLE: 'deep_shallow_cycle'
}

// Individual fish component - now completely independent
function IndependentFish({ 
  position, 
  color, 
  scale, 
  speed = 1, 
  fishId,
  migrationPattern = MIGRATION_PATTERNS.RANDOM_WANDER,
  migrationData = {}
}) {
  const fishRef = useRef()
  const velocity = useRef(new Vector3(
    (Math.random() - 0.5) * 0.02,
    (Math.random() - 0.5) * 0.01,
    (Math.random() - 0.5) * 0.02
  ))
  const acceleration = useRef(new Vector3())
  const targetRotation = useRef(new THREE.Euler())
  const swimPhase = useRef(Math.random() * Math.PI * 2)
  const maxSpeed = useRef(speed * 0.4 * (0.8 + Math.random() * 0.4)) // Increased from 0.15
  const maxForce = useRef(0.008 + Math.random() * 0.004) // Increased from 0.002

  // Migration-specific state
  const migrationPhase = useRef(Math.random() * Math.PI * 2)
  const currentTarget = useRef(new Vector3(...position))
  const behaviorState = useRef('wandering')
  const stateTimer = useRef(Math.random() * 15 + 8) // Shorter state durations
  const seasonalTimer = useRef(Math.random() * 60) // For seasonal changes

  // Wander behavior
  const wanderTarget = useRef(new Vector3(
    position[0] + (Math.random() - 0.5) * 25,
    position[1] + (Math.random() - 0.5) * 6,
    position[2] + (Math.random() - 0.5) * 25
  ))
  const wanderTimer = useRef(Math.random() * 12 + 8)

  // Smooth interpolation for rotations
  const smoothRotation = useRef(new THREE.Euler())

  // Calculate migration target based on pattern and time
  const calculateMigrationTarget = (time, pattern, data) => {
    const target = new Vector3()
    const seasonalPhase = Math.sin(time * 0.01) // Very slow seasonal change
    
    switch (pattern) {
      case MIGRATION_PATTERNS.CIRCULAR:
        const radius = data.radius || 12
        const centerX = data.centerX || position[0]
        const centerZ = data.centerZ || position[2]
        const speed = data.speed || 0.008 // Increased speed
        // Add seasonal variation to the center
        const seasonalOffsetX = Math.sin(time * 0.005) * 8
        const seasonalOffsetZ = Math.cos(time * 0.005) * 6
        target.set(
          centerX + seasonalOffsetX + Math.cos(time * speed + migrationPhase.current) * radius,
          data.baseY || position[1],
          centerZ + seasonalOffsetZ + Math.sin(time * speed + migrationPhase.current) * radius
        )
        break
        
      case MIGRATION_PATTERNS.FIGURE_EIGHT:
        const scale = data.scale || 8
        const centerX8 = data.centerX || position[0]
        const centerZ8 = data.centerZ || position[2]
        const speed8 = data.speed || 0.006 // Increased speed
        const t = time * speed8 + migrationPhase.current
        // Seasonal drift of the entire pattern
        const driftX = Math.sin(time * 0.003) * 12
        const driftZ = Math.cos(time * 0.004) * 10
        target.set(
          centerX8 + driftX + Math.sin(t) * scale,
          data.baseY || position[1],
          centerZ8 + driftZ + Math.sin(t * 2) * scale * 0.5
        )
        break
        
      case MIGRATION_PATTERNS.VERTICAL:
        const amplitude = data.amplitude || 4
        const baseY = data.baseY || position[1]
        const speedV = data.speed || 0.01 // Increased speed
        // Seasonal depth changes
        const seasonalDepth = Math.sin(time * 0.002) * 3
        target.set(
          data.centerX || position[0],
          baseY + seasonalDepth + Math.sin(time * speedV + migrationPhase.current) * amplitude,
          data.centerZ || position[2]
        )
        break
        
      case MIGRATION_PATTERNS.SEASONAL_DRIFT:
        const driftSpeed = data.speed || 0.004 // Increased speed
        const driftRange = data.range || 15
        // Large seasonal movements
        const seasonalX = Math.sin(time * 0.001) * 20
        const seasonalZ = Math.cos(time * 0.0008) * 18
        target.set(
          data.startX + seasonalX + Math.sin(time * driftSpeed) * driftRange,
          data.baseY || position[1],
          data.startZ + seasonalZ + Math.cos(time * driftSpeed * 0.7) * driftRange * 0.8
        )
        break

      case MIGRATION_PATTERNS.FEEDING_MIGRATION:
        // Cycle between feeding areas seasonally
        const feedingAreas = data.feedingAreas || [
          { x: 10, y: -2, z: 15 },
          { x: -15, y: -4, z: -10 },
          { x: 20, y: -3, z: -20 },
          { x: -25, y: -5, z: 12 }
        ]
        const cycleTime = data.cycleTime || 120 // 2 minutes per area
        const areaIndex = Math.floor((time / cycleTime) % feedingAreas.length)
        const currentArea = feedingAreas[areaIndex]
        // Add some randomness around the feeding area
        const feedingRadius = 8
        const feedingAngle = time * 0.01 + fishId
        target.set(
          currentArea.x + Math.cos(feedingAngle) * feedingRadius,
          currentArea.y,
          currentArea.z + Math.sin(feedingAngle) * feedingRadius
        )
        break

      case MIGRATION_PATTERNS.DEEP_SHALLOW_CYCLE:
        // Daily depth migration
        const depthCycle = Math.sin(time * 0.01) // Slow day/night cycle
        const shallowY = data.shallowY || -1
        const deepY = data.deepY || -7
        const currentDepth = shallowY + (deepY - shallowY) * (depthCycle * 0.5 + 0.5)
        // Horizontal movement while changing depth
        const horizontalDrift = time * 0.002
        target.set(
          data.centerX + Math.sin(horizontalDrift) * 15,
          currentDepth,
          data.centerZ + Math.cos(horizontalDrift * 0.8) * 12
        )
        break
        
      case MIGRATION_PATTERNS.RANDOM_WANDER:
      default:
        target.copy(wanderTarget.current)
        break
    }
    
    return target
  }

  useFrame((state, delta) => {
    if (!fishRef.current) return

    const fish = fishRef.current
    const time = state.clock.elapsedTime
    swimPhase.current += delta * 1.2 // Increased swim animation speed

    // Update behavior state
    stateTimer.current -= delta
    if (stateTimer.current <= 0) {
      const behaviors = ['wandering', 'resting', 'exploring', 'feeding', 'migrating']
      behaviorState.current = behaviors[Math.floor(Math.random() * behaviors.length)]
      stateTimer.current = 8 + Math.random() * 15 // Shorter state durations
    }

    // Seasonal behavior changes
    seasonalTimer.current -= delta
    if (seasonalTimer.current <= 0) {
      // Occasionally change migration pattern for dynamic environment
      if (Math.random() < 0.1) { // 10% chance
        const patterns = Object.values(MIGRATION_PATTERNS)
        migrationPattern = patterns[Math.floor(Math.random() * patterns.length)]
      }
      seasonalTimer.current = 45 + Math.random() * 60 // 45-105 seconds
    }

    // Get player position for avoidance
    const playerPosition = new Vector3(
      state.camera.position.x,
      state.camera.position.y - 2,
      state.camera.position.z - 6
    )

    // Reset acceleration
    acceleration.current.set(0, 0, 0)

    // Calculate target based on migration pattern
    currentTarget.current = calculateMigrationTarget(time, migrationPattern, migrationData)

    // Adjust speed based on behavior
    let currentMaxSpeed = maxSpeed.current
    if (behaviorState.current === 'resting') {
      currentMaxSpeed *= 0.4 // Slower when resting
    } else if (behaviorState.current === 'exploring') {
      currentMaxSpeed *= 1.5 // Faster when exploring
    } else if (behaviorState.current === 'migrating') {
      currentMaxSpeed *= 1.8 // Fastest when migrating
    } else if (behaviorState.current === 'feeding') {
      currentMaxSpeed *= 0.6 // Moderate when feeding
    }

    // Update wander target periodically
    if (migrationPattern === MIGRATION_PATTERNS.RANDOM_WANDER) {
      wanderTimer.current -= delta
      if (wanderTimer.current <= 0) {
        // Create new wander target within reasonable range
        const wanderRange = 20
        wanderTarget.current.set(
          fish.position.x + (Math.random() - 0.5) * wanderRange,
          fish.position.y + (Math.random() - 0.5) * 8,
          fish.position.z + (Math.random() - 0.5) * wanderRange
        )
        wanderTimer.current = 8 + Math.random() * 15 // Shorter wander intervals
      }
    }

    // Seek target with increased force
    const toTarget = new Vector3().subVectors(currentTarget.current, fish.position)
    const targetDistance = toTarget.length()
    
    if (targetDistance > 1.5) {
      toTarget.normalize()
      toTarget.multiplyScalar(currentMaxSpeed * 0.6) // Increased seeking strength
      toTarget.sub(velocity.current)
      toTarget.clampLength(0, maxForce.current)
      acceleration.current.add(toTarget)
    }

    // Player avoidance
    const avoidanceDistance = 8
    const toPlayer = new Vector3().subVectors(fish.position, playerPosition)
    const playerDistance = toPlayer.length()
    if (playerDistance < avoidanceDistance) {
      const avoidanceStrength = Math.pow((avoidanceDistance - playerDistance) / avoidanceDistance, 2) * 0.5
      toPlayer.normalize()
      toPlayer.multiplyScalar(currentMaxSpeed * avoidanceStrength)
      toPlayer.sub(velocity.current)
      toPlayer.clampLength(0, maxForce.current * 2)
      acceleration.current.add(toPlayer)
    }

    // Boundary avoidance
    const bounds = 35
    const boundaryForce = new Vector3()
    
    if (fish.position.x > bounds) {
      boundaryForce.x = -Math.pow((fish.position.x - bounds) / 8, 2) * 0.5
    } else if (fish.position.x < -bounds) {
      boundaryForce.x = Math.pow((-bounds - fish.position.x) / 8, 2) * 0.5
    }
    
    if (fish.position.z > bounds) {
      boundaryForce.z = -Math.pow((fish.position.z - bounds) / 8, 2) * 0.5
    } else if (fish.position.z < -bounds) {
      boundaryForce.z = Math.pow((-bounds - fish.position.z) / 8, 2) * 0.5
    }
    
    if (fish.position.y > 3) {
      boundaryForce.y = -Math.pow((fish.position.y - 3) / 3, 2) * 0.5
    } else if (fish.position.y < -9) {
      boundaryForce.y = Math.pow((-9 - fish.position.y) / 3, 2) * 0.5
    }
    
    boundaryForce.clampLength(0, maxForce.current)
    acceleration.current.add(boundaryForce)

    // Increased random movement for more liveliness
    const wanderStrength = 0.0002 // Increased from 0.00005
    const wander = new Vector3(
      Math.sin(time * 0.4 + fishId * 0.3) * wanderStrength,
      Math.sin(time * 0.3 + fishId * 0.7) * wanderStrength * 0.5,
      Math.cos(time * 0.35 + fishId * 0.5) * wanderStrength
    )
    acceleration.current.add(wander)

    // Update velocity with moderate damping
    velocity.current.add(acceleration.current.clone().multiplyScalar(delta))
    velocity.current.multiplyScalar(0.92) // Less damping for more responsive movement
    velocity.current.clampLength(0, currentMaxSpeed)

    // Update position with faster movement
    const deltaPosition = velocity.current.clone().multiplyScalar(delta * 8) // Increased from 3
    fish.position.add(deltaPosition)

    // Faster rotation changes
    if (velocity.current.length() > 0.001) {
      const direction = velocity.current.clone().normalize()
      targetRotation.current.y = Math.atan2(direction.x, direction.z)
      targetRotation.current.z = -acceleration.current.x * 1
      targetRotation.current.x = -direction.y * 0.4
    }

    // Faster rotation interpolation
    smoothRotation.current.x = THREE.MathUtils.lerp(
      smoothRotation.current.x, 
      targetRotation.current.x, 
      delta * 2.5 // Increased from 1
    )
    smoothRotation.current.y = THREE.MathUtils.lerp(
      smoothRotation.current.y, 
      targetRotation.current.y, 
      delta * 3 // Increased from 1.5
    )
    smoothRotation.current.z = THREE.MathUtils.lerp(
      smoothRotation.current.z, 
      targetRotation.current.z, 
      delta * 2 // Increased from 0.8
    )

    fish.rotation.copy(smoothRotation.current)

    // More active swimming animation
    let animationIntensity = 0.7 // Increased from 0.3
    if (behaviorState.current === 'resting') {
      animationIntensity = 0.2
    } else if (behaviorState.current === 'exploring') {
      animationIntensity = 1.0
    } else if (behaviorState.current === 'migrating') {
      animationIntensity = 1.2
    }
    
    const swimSpeed = velocity.current.length() * 8 * animationIntensity // Increased multiplier
    const bodyWave = Math.sin(swimPhase.current * 2) * 0.05 * swimSpeed
    if (fish.children[0]) fish.children[0].rotation.y = bodyWave
    
    // More active tail animation
    if (fish.children[1]) {
      const tailWave = Math.sin(swimPhase.current * 2 + Math.PI * 0.5) * 0.25 * swimSpeed
      fish.children[1].rotation.y = tailWave
      fish.children[1].rotation.z = Math.sin(swimPhase.current * 1.5) * 0.08 * swimSpeed
    }

    // More active fin animation
    if (fish.children[2] && fish.children[3]) {
      const finWave = Math.sin(swimPhase.current * 3) * 0.15 * swimSpeed
      fish.children[2].rotation.z = Math.PI / 4 + finWave
      fish.children[3].rotation.z = -Math.PI / 4 - finWave
    }

    // More noticeable vertical bobbing
    const bobbing = Math.sin(time * 1.2 + fishId * 0.5) * 0.015 * animationIntensity
    fish.position.y += bobbing * delta
  })

  return (
    <group ref={fishRef} position={position} scale={scale}>
      {/* Fish body */}
      <mesh castShadow>
        <capsuleGeometry args={[0.08, 0.5, 4, 8]} />
        <meshStandardMaterial 
          color={color} 
          roughness={0.3}
          metalness={0.2}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Fish tail */}
      <mesh position={[0, 0, 0.3]} rotation={[0, 0, 0]} castShadow>
        <coneGeometry args={[0.12, 0.25, 6]} />
        <meshStandardMaterial 
          color={color} 
          roughness={0.4}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Pectoral fins */}
      <mesh position={[0.06, 0, -0.04]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <boxGeometry args={[0.15, 0.015, 0.12]} />
        <meshStandardMaterial 
          color={color} 
          roughness={0.5}
          transparent
          opacity={0.7}
        />
      </mesh>

      <mesh position={[-0.06, 0, -0.04]} rotation={[0, 0, -Math.PI / 4]} castShadow>
        <boxGeometry args={[0.15, 0.015, 0.12]} />
        <meshStandardMaterial 
          color={color} 
          roughness={0.5}
          transparent
          opacity={0.7}
        />
      </mesh>
    </group>
  )
}

export default function IndependentFishSwarm() {
  // Create individual fish scattered around the ocean
  const fishData = useMemo(() => {
    const fish = []
    const fishCount = 12 // Optimized count
    
    const colors = [
      "#FF6B35", "#4A90E2", "#F5D76E", "#96CEB4", 
      "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
      "#AED6F1", "#F8C471", "#D7BDE2", "#A9DFBF",
      "#FAD7A0", "#D5A6BD", "#85C1E9", "#F1948A",
      "#82E0AA", "#F8D7DA"
    ]
    
    for (let i = 0; i < fishCount; i++) {
      // Spread fish around the ocean with good spacing
      const angle = (i / fishCount) * Math.PI * 2 + Math.random() * 0.5
      const distance = 8 + Math.random() * 22
      const x = Math.cos(angle) * distance + (Math.random() - 0.5) * 12
      const z = Math.sin(angle) * distance + (Math.random() - 0.5) * 12
      const y = -1 + Math.random() * -7 // Various depths
      
      const position = [x, y, z]
      const color = colors[i % colors.length]
      const scale = [
        0.7 + Math.random() * 0.8,
        0.7 + Math.random() * 0.8,
        0.7 + Math.random() * 0.8
      ]
      const speed = 1.0 + Math.random() * 0.6 // Increased base speed
      
      // Assign different migration patterns with seasonal behavior
      const patterns = [
        MIGRATION_PATTERNS.RANDOM_WANDER,
        MIGRATION_PATTERNS.CIRCULAR,
        MIGRATION_PATTERNS.FIGURE_EIGHT,
        MIGRATION_PATTERNS.VERTICAL,
        MIGRATION_PATTERNS.SEASONAL_DRIFT,
        MIGRATION_PATTERNS.FEEDING_MIGRATION,
        MIGRATION_PATTERNS.DEEP_SHALLOW_CYCLE
      ]
      
      const migrationPattern = patterns[Math.floor(Math.random() * patterns.length)]
      
      let migrationData = {}
      switch (migrationPattern) {
        case MIGRATION_PATTERNS.CIRCULAR:
          migrationData = {
            radius: 6 + Math.random() * 10,
            centerX: x,
            centerZ: z,
            baseY: y,
            speed: 0.004 + Math.random() * 0.008 // Increased speed
          }
          break
        case MIGRATION_PATTERNS.FIGURE_EIGHT:
          migrationData = {
            scale: 4 + Math.random() * 8,
            centerX: x,
            centerZ: z,
            baseY: y,
            speed: 0.003 + Math.random() * 0.006 // Increased speed
          }
          break
        case MIGRATION_PATTERNS.VERTICAL:
          migrationData = {
            amplitude: 3 + Math.random() * 4,
            centerX: x,
            centerZ: z,
            baseY: y,
            speed: 0.005 + Math.random() * 0.008 // Increased speed
          }
          break
        case MIGRATION_PATTERNS.SEASONAL_DRIFT:
          migrationData = {
            startX: x,
            startZ: z,
            baseY: y,
            range: 10 + Math.random() * 15,
            speed: 0.002 + Math.random() * 0.006 // Increased speed
          }
          break
        case MIGRATION_PATTERNS.FEEDING_MIGRATION:
          migrationData = {
            feedingAreas: [
              { x: 15, y: -2, z: 20 },
              { x: -20, y: -4, z: -15 },
              { x: 25, y: -3, z: -25 },
              { x: -30, y: -5, z: 18 }
            ],
            cycleTime: 90 + Math.random() * 60 // 1.5-2.5 minutes per area
          }
          break
        case MIGRATION_PATTERNS.DEEP_SHALLOW_CYCLE:
          migrationData = {
            centerX: x,
            centerZ: z,
            shallowY: -1,
            deepY: -8
          }
          break
      }
      
      fish.push({
        id: i,
        position,
        color,
        scale,
        speed,
        migrationPattern,
        migrationData
      })
    }
    
    return fish
  }, [])

  return (
    <group>
      {fishData.map((fish) => (
        <IndependentFish
          key={fish.id}
          fishId={fish.id}
          position={fish.position}
          color={fish.color}
          scale={fish.scale}
          speed={fish.speed}
          migrationPattern={fish.migrationPattern}
          migrationData={fish.migrationData}
        />
      ))}
    </group>
  )
}
