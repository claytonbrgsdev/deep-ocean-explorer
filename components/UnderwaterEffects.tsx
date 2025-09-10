"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import { Points, PointMaterial } from "@react-three/drei"
import * as THREE from "three"

// Reduced floating particles for better performance
function FloatingParticles({ count = 100 }) { // Reduced from 200
  const pointsRef = useRef()
  
  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    
    for (let i = 0; i < count; i++) {
      // Smaller area
      positions[i * 3] = (Math.random() - 0.5) * 120
      positions[i * 3 + 1] = Math.random() * 20 - 10
      positions[i * 3 + 2] = (Math.random() - 0.5) * 120
      
      // Much slower velocities
      velocities[i * 3] = (Math.random() - 0.5) * 0.005
      velocities[i * 3 + 1] = Math.random() * 0.002 + 0.001
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.005
    }
    
    return { positions, velocities }
  }, [count])

  useFrame((state, delta) => {
    if (!pointsRef.current) return
    
    const positions = pointsRef.current.geometry.attributes.position.array
    
    for (let i = 0; i < count; i++) {
      // Much slower movement
      positions[i * 3] += particles.velocities[i * 3] * delta * 3
      positions[i * 3 + 1] += particles.velocities[i * 3 + 1] * delta * 3
      positions[i * 3 + 2] += particles.velocities[i * 3 + 2] * delta * 3
      
      // Much gentler wave motion
      positions[i * 3] += Math.sin(state.clock.elapsedTime * 0.3 + i * 0.1) * 0.0003
      positions[i * 3 + 2] += Math.cos(state.clock.elapsedTime * 0.3 + i * 0.1) * 0.0003
      
      // Reset particles
      if (positions[i * 3 + 1] > 8) {
        positions[i * 3 + 1] = -10
      }
      
      // Smaller wrap bounds
      if (positions[i * 3] > 60) positions[i * 3] = -60
      if (positions[i * 3] < -60) positions[i * 3] = 60
      if (positions[i * 3 + 2] > 60) positions[i * 3 + 2] = -60
      if (positions[i * 3 + 2] < -60) positions[i * 3 + 2] = 60
    }
    
    pointsRef.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <Points ref={pointsRef} positions={particles.positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#87CEEB"
        size={0.03} // Smaller particles
        sizeAttenuation={true}
        depthWrite={false}
        opacity={0.4} // More transparent
      />
    </Points>
  )
}

// Fewer, slower bubbles
function Bubbles({ count = 20 }) { // Reduced from 50
  const bubblesRef = useRef()
  
  const bubbleData = useMemo(() => {
    const data = []
    for (let i = 0; i < count; i++) {
      data.push({
        position: [
          (Math.random() - 0.5) * 60, // Smaller area
          Math.random() * -15 - 3,
          (Math.random() - 0.5) * 60
        ],
        speed: Math.random() * 0.15 + 0.05, // Much slower
        scale: Math.random() * 0.2 + 0.08, // Smaller bubbles
        phase: Math.random() * Math.PI * 2
      })
    }
    return data
  }, [count])

  useFrame((state, delta) => {
    if (!bubblesRef.current) return
    
    bubblesRef.current.children.forEach((bubble, i) => {
      const data = bubbleData[i]
      
      // Much slower movement
      bubble.position.y += data.speed * delta * 0.5
      
      // Gentler floating motion
      bubble.position.x += Math.sin(state.clock.elapsedTime * 0.2 + data.phase) * 0.003
      bubble.position.z += Math.cos(state.clock.elapsedTime * 0.15 + data.phase) * 0.003
      
      // Reset when they reach surface
      if (bubble.position.y > 5) {
        bubble.position.y = -15
        bubble.position.x = (Math.random() - 0.5) * 60
        bubble.position.z = (Math.random() - 0.5) * 60
      }
    })
  })

  return (
    <group ref={bubblesRef}>
      {bubbleData.map((data, i) => (
        <mesh key={i} position={data.position} scale={data.scale}>
          <sphereGeometry args={[1, 4, 4]} /> {/* Optimized resolution */}
          <meshBasicMaterial
            color="#B3E5FC"
            transparent
            opacity={0.2} // More transparent
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

// Simplified caustics
function Caustics() {
  const causticsRef = useRef()
  
  useFrame((state) => {
    if (!causticsRef.current) return
    
    // Much slower caustics animation
    causticsRef.current.material.uniforms.time.value = state.clock.elapsedTime * 0.3
  })

  const causticsShader = {
    uniforms: {
      time: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      
      void main() {
        vec2 uv = vUv * 6.0; // Smaller pattern
        float wave1 = sin(uv.x + time * 0.2) * sin(uv.y + time * 0.15);
        float wave2 = sin(uv.x * 1.2 + time * 0.25) * sin(uv.y * 1.1 + time * 0.18);
        float caustic = (wave1 + wave2) * 0.5 + 0.5;
        
        gl_FragColor = vec4(0.3, 0.6, 0.8, caustic * 0.15); // Dimmer caustics
      }
    `
  }

  return (
    <mesh ref={causticsRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -8.8, 0]}>
      <planeGeometry args={[120, 120]} /> {/* Smaller plane */}
      <shaderMaterial
        attach="material"
        args={[causticsShader]}
        transparent
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

export default function UnderwaterEffects() {
  return (
    <group>
      <FloatingParticles count={30} /> {/* Further optimized particles */}
      <Bubbles count={6} /> {/* Further optimized bubbles */}
      <Caustics />
    </group>
  )
}
