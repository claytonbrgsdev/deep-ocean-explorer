"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"

// Enhanced seaweed component with more realistic underwater materials
function Seaweed({ position, scale = 1, swayOffset = 0 }) {
  const seaweedRef = useRef()

  useFrame((state) => {
    if (seaweedRef.current) {
      // More realistic underwater swaying motion
      const time = state.clock.elapsedTime + swayOffset
      seaweedRef.current.rotation.z = Math.sin(time * 0.3) * 0.15 + Math.sin(time * 0.7) * 0.05
      seaweedRef.current.rotation.x = Math.cos(time * 0.2) * 0.08 + Math.cos(time * 0.5) * 0.03
      
      // Subtle vertical bobbing
      seaweedRef.current.position.y = position[1] + Math.sin(time * 0.4) * 0.1
    }
  })

  return (
    <group ref={seaweedRef} position={position} scale={scale}>
      {/* Main seaweed stem with underwater coloring */}
      <mesh position={[0, 2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.15, 4, 6]} />
        <meshStandardMaterial 
          color="#1B5E20" 
          transparent 
          opacity={0.9}
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>

      {/* Primary fronds */}
      <mesh position={[0, 4, 0]} castShadow>
        <coneGeometry args={[0.6, 2.5, 6]} />
        <meshStandardMaterial 
          color="#2E7D32" 
          transparent 
          opacity={0.8}
          roughness={0.7}
        />
      </mesh>

      {/* Secondary fronds with variation */}
      <mesh position={[0.2, 3.8, 0]} rotation={[0, 0, 0.15]} castShadow>
        <coneGeometry args={[0.4, 2, 6]} />
        <meshStandardMaterial 
          color="#388E3C" 
          transparent 
          opacity={0.7}
          roughness={0.6}
        />
      </mesh>

      <mesh position={[-0.2, 3.5, 0]} rotation={[0, 0, -0.15]} castShadow>
        <coneGeometry args={[0.35, 1.8, 6]} />
        <meshStandardMaterial 
          color="#43A047" 
          transparent 
          opacity={0.7}
          roughness={0.6}
        />
      </mesh>

      {/* Small detail fronds */}
      <mesh position={[0.1, 4.5, 0]} rotation={[0, 0, 0.1]} castShadow>
        <coneGeometry args={[0.2, 1, 6]} />
        <meshStandardMaterial 
          color="#4CAF50" 
          transparent 
          opacity={0.6}
          roughness={0.5}
        />
      </mesh>
    </group>
  )
}

export default function Seaweeds() {
  // Generate random seaweed positions with better distribution
  const seaweedPositions = useMemo(() => {
    const positions = []
    const count = 12

    for (let i = 0; i < count; i++) {
      // Generate random positions on the ocean floor
      let x, z
      do {
        x = (Math.random() - 0.5) * 160
        z = (Math.random() - 0.5) * 160
      } while (Math.sqrt(x * x + z * z) < 15) // Keep seaweed away from center

      const scale = 0.4 + Math.random() * 1.8
      const swayOffset = Math.random() * Math.PI * 2
      positions.push({ position: [x, -10, z], scale, swayOffset })
    }

    return positions
  }, [])

  return (
    <group>
      {seaweedPositions.map((props, index) => (
        <Seaweed key={index} {...props} />
      ))}
    </group>
  )
}
