"use client"

export default function Terrain() {
  // Create ocean floor with more realistic underwater materials
  return (
    <group>
      {/* Main ocean floor with displacement for more natural look */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -10, 0]} receiveShadow>
        <planeGeometry args={[200, 200, 64, 64]} />
        <meshStandardMaterial 
          color="#0D4F5C" 
          roughness={0.9}
          metalness={0.1}
          transparent
          opacity={0.9}
        />
      </mesh>
      
      {/* Sandy patches with better underwater coloring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -9.9, 0]} receiveShadow>
        <planeGeometry args={[150, 150, 32, 32]} />
        <meshStandardMaterial 
          color="#8B7355" 
          roughness={0.95}
          transparent 
          opacity={0.8}
        />
      </mesh>

      {/* Darker deep areas */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -10.1, 0]} receiveShadow>
        <planeGeometry args={[250, 250, 16, 16]} />
        <meshStandardMaterial 
          color="#041E24" 
          roughness={1.0}
          transparent 
          opacity={0.6}
        />
      </mesh>
    </group>
  )
}
