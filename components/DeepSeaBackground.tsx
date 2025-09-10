"use client"

import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Points, PointMaterial } from '@react-three/drei'
import * as THREE from 'three'

function Particles({ count = 2000 }) {
  const points = useRef<THREE.Points>(null!)
  
  const particlePositions = useMemo(() => {
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20
      positions[i * 3 + 1] = Math.random() * 10 - 5
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20
    }
    return positions
  }, [count])

  useFrame((state) => {
    const time = state.clock.getElapsedTime()
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      points.current.geometry.attributes.position.array[i3 + 1] -= 0.01
      if (points.current.geometry.attributes.position.array[i3 + 1] < -5) {
        points.current.geometry.attributes.position.array[i3 + 1] = 5
      }
      points.current.geometry.attributes.position.array[i3] += Math.sin(time + i) * 0.01
      points.current.geometry.attributes.position.array[i3 + 2] += Math.cos(time + i) * 0.01
    }
    points.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <Points ref={points} positions={particlePositions} stride={3}>
      <PointMaterial transparent color="#5a88bb" size={0.035} sizeAttenuation={true} depthWrite={false} />
    </Points>
  )
}

function SeaFloor() {
  const planeRef = useRef<THREE.Mesh>(null!)
  
  useFrame((state) => {
    const time = state.clock.getElapsedTime()
    if (planeRef.current.material instanceof THREE.ShaderMaterial) {
      planeRef.current.material.uniforms.uTime.value = time
    }
  })

  const seaFloorShader = {
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#1a3c5a") },
    },
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      
      void main() {
        vUv = uv;
        vec3 pos = position;
        pos.y += sin(pos.x * 2.0 + uTime) * 0.2;
        pos.y += sin(pos.z * 2.0 + uTime) * 0.2;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec2 vUv;
      
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `,
  }

  return (
    <mesh ref={planeRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
      <planeGeometry args={[50, 50, 100, 100]} />
      <shaderMaterial args={[seaFloorShader]} />
    </mesh>
  )
}

function SeaPlants({ count = 25 }) {
  const plants = useMemo(() => {
    return Array.from({ length: count }, () => ({
      position: [
        (Math.random() - 0.5) * 20,
        -5,
        (Math.random() - 0.5) * 20
      ] as [number, number, number],
      scale: 0.5 + Math.random() * 1.5,
      rotation: Math.random() * Math.PI
    }))
  }, [count])

  return (
    <group>
      {plants.map((plant, index) => (
        <SeaPlant key={index} {...plant} />
      ))}
    </group>
  )
}

function SeaPlant({ position, scale, rotation }: { 
  position: [number, number, number]
  scale: number 
  rotation: number 
}) {
  const plantRef = useRef<THREE.Group>(null!)

  useFrame((state) => {
    const time = state.clock.getElapsedTime()
    plantRef.current.rotation.y = Math.sin(time * 0.5 + rotation) * 0.1 + rotation
  })

  return (
    <group ref={plantRef} position={position} scale={[scale, scale, scale]}>
      <mesh>
        <cylinderGeometry args={[0.05, 0.05, 2, 8]} />
        <meshStandardMaterial color="#2a6e3f" />
      </mesh>
      <mesh position={[0, 1, 0]}>
        <sphereGeometry args={[0.5, 6, 6, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshStandardMaterial color="#3a9e5f" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

export default function DeepSeaBackground() {
  return (
    <group>
      <Particles count={900} />
      <SeaFloor />
      <SeaPlants count={12} />
    </group>
  )
}