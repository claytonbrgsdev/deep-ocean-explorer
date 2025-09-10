"use client"

import { useMemo } from "react"

// Coral component
function Coral({ position, rotation, scale, type = 'brain' }) {
  const getCoralGeometry = () => {
    switch (type) {
      case 'brain':
        return <sphereGeometry args={[1, 8, 6]} />
      case 'tube':
        return <cylinderGeometry args={[0.3, 0.5, 2, 8]} />
      case 'fan':
        return <boxGeometry args={[2, 0.1, 1.5]} />
      default:
        return <dodecahedronGeometry args={[1, 0]} />
    }
  }

  const getCoralColor = () => {
    switch (type) {
      case 'brain':
        return "#FF6B6B"
      case 'tube':
        return "#4ECDC4"
      case 'fan':
        return "#45B7D1"
      default:
        return "#96CEB4"
    }
  }

  return (
    <mesh position={position} rotation={rotation} scale={scale} castShadow>
      {getCoralGeometry()}
      <meshStandardMaterial color={getCoralColor()} roughness={0.7} />
    </mesh>
  )
}

export default function CoralReef() {
  // Generate random coral positions
  const coralData = useMemo(() => {
    const data = []
    const count = 25
    const coralTypes = ['brain', 'tube', 'fan', 'rock']

    for (let i = 0; i < count; i++) {
      // Generate random positions on the ocean floor
      let x, z
      do {
        x = (Math.random() - 0.5) * 180
        z = (Math.random() - 0.5) * 180
      } while (Math.sqrt(x * x + z * z) < 12) // Keep coral away from center

      const position = [x, -9 + Math.random() * 2, z] // Slightly above ocean floor
      const rotation = [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI]
      const scale = [0.3 + Math.random() * 1.2, 0.3 + Math.random() * 1, 0.3 + Math.random() * 1.2]
      const type = coralTypes[Math.floor(Math.random() * coralTypes.length)]

      data.push({ position, rotation, scale, type })
    }

    return data
  }, [])

  return (
    <group>
      {coralData.map((props, index) => (
        <Coral key={index} {...props} />
      ))}
    </group>
  )
}
