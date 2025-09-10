"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

export default function UnderwaterCaustics({ playerPosition }) {
  const causticsRef = useRef()
  const causticsMaterialRef = useRef()
  const secondaryCausticsRef = useRef()
  const secondaryMaterialRef = useRef()
  
  // Create caustics shader material
  const causticsMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        playerDepth: { value: 0 },
        lightIntensity: { value: 1.0 },
        waveScale: { value: 8.0 },
        waveSpeed: { value: 0.5 },
        causticsIntensity: { value: 0.8 },
        lightColor: { value: new THREE.Color('#87CEEB') },
        deepColor: { value: new THREE.Color('#1565C0') }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float playerDepth;
        uniform float lightIntensity;
        uniform float waveScale;
        uniform float waveSpeed;
        uniform float causticsIntensity;
        uniform vec3 lightColor;
        uniform vec3 deepColor;
        
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        
        // Noise function for realistic water caustics
        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        // Smooth noise
        float smoothNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float a = noise(i);
          float b = noise(i + vec2(1.0, 0.0));
          float c = noise(i + vec2(0.0, 1.0));
          float d = noise(i + vec2(1.0, 1.0));
          
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        // Fractal noise for complex caustics
        float fractalNoise(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;
          
          for(int i = 0; i < 4; i++) {
            value += amplitude * smoothNoise(p * frequency);
            amplitude *= 0.5;
            frequency *= 2.0;
          }
          
          return value;
        }
        
        // Generate realistic caustics pattern
        float caustics(vec2 uv, float time) {
          // Multiple wave layers for realistic water surface simulation
          vec2 p1 = uv * waveScale + vec2(time * waveSpeed, time * waveSpeed * 0.7);
          vec2 p2 = uv * waveScale * 1.3 + vec2(-time * waveSpeed * 0.8, time * waveSpeed * 1.1);
          vec2 p3 = uv * waveScale * 0.7 + vec2(time * waveSpeed * 1.2, -time * waveSpeed * 0.9);
          
          // Create wave distortions
          float wave1 = fractalNoise(p1) * 2.0 - 1.0;
          float wave2 = fractalNoise(p2) * 2.0 - 1.0;
          float wave3 = fractalNoise(p3) * 2.0 - 1.0;
          
          // Combine waves to create water surface height
          float surface = (wave1 + wave2 * 0.7 + wave3 * 0.5) / 2.2;
          
          // Calculate light refraction through water surface
          vec2 gradient = vec2(
            dFdx(surface),
            dFdy(surface)
          );
          
          // Create caustics from light focusing/defocusing
          float caustic = 1.0 / (1.0 + dot(gradient, gradient) * 20.0);
          
          // Add secondary caustics pattern
          vec2 p4 = uv * waveScale * 2.1 + vec2(time * waveSpeed * 0.6, -time * waveSpeed * 0.4);
          float secondary = fractalNoise(p4);
          caustic += secondary * 0.3;
          
          // Enhance contrast and add shimmer
          caustic = pow(caustic, 1.5);
          caustic += sin(time * 3.0 + uv.x * 10.0 + uv.y * 8.0) * 0.05;
          
          return caustic;
        }
        
        void main() {
          vec2 uv = vUv;
          
          // Calculate depth-based intensity
          float depthFactor = max(0.0, min(1.0, (playerDepth + 15.0) / 20.0));
          float intensity = lightIntensity * depthFactor;
          
          // Distance from player for localized effects
          float distanceFromPlayer = length(vWorldPosition.xz - vec2(0.0, 0.0)) / 50.0;
          float proximityFactor = 1.0 - clamp(distanceFromPlayer, 0.0, 1.0);
          
          // Generate caustics pattern
          float causticsPattern = caustics(uv, time);
          
          // Apply depth-based color mixing
          vec3 currentColor = mix(deepColor, lightColor, depthFactor);
          
          // Create final caustics with depth and proximity effects
          float finalIntensity = causticsPattern * intensity * causticsIntensity * (0.3 + proximityFactor * 0.7);
          
          // Add subtle animation variations
          finalIntensity *= (0.8 + sin(time * 2.0 + vWorldPosition.x * 0.1) * 0.2);
          
          // Output with alpha for blending
          gl_FragColor = vec4(currentColor * finalIntensity, finalIntensity * 0.6);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  }, [])

  // Create secondary caustics material for layered effect
  const secondaryCausticsMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        playerDepth: { value: 0 },
        lightIntensity: { value: 0.6 },
        waveScale: { value: 12.0 },
        waveSpeed: { value: 0.3 },
        causticsIntensity: { value: 0.4 },
        lightColor: { value: new THREE.Color('#B3E5FC') },
        deepColor: { value: new THREE.Color('#0D47A1') }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float playerDepth;
        uniform float lightIntensity;
        uniform float waveScale;
        uniform float waveSpeed;
        uniform float causticsIntensity;
        uniform vec3 lightColor;
        uniform vec3 deepColor;
        
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        
        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        float smoothNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float a = noise(i);
          float b = noise(i + vec2(1.0, 0.0));
          float c = noise(i + vec2(0.0, 1.0));
          float d = noise(i + vec2(1.0, 1.0));
          
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        float fractalNoise(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;
          
          for(int i = 0; i < 3; i++) {
            value += amplitude * smoothNoise(p * frequency);
            amplitude *= 0.5;
            frequency *= 2.0;
          }
          
          return value;
        }
        
        float caustics(vec2 uv, float time) {
          // Different wave parameters for secondary layer
          vec2 p1 = uv * waveScale + vec2(-time * waveSpeed * 1.3, time * waveSpeed * 0.9);
          vec2 p2 = uv * waveScale * 0.8 + vec2(time * waveSpeed * 0.7, -time * waveSpeed * 1.4);
          
          float wave1 = fractalNoise(p1) * 2.0 - 1.0;
          float wave2 = fractalNoise(p2) * 2.0 - 1.0;
          
          float surface = (wave1 + wave2 * 0.8) / 1.8;
          
          vec2 gradient = vec2(dFdx(surface), dFdy(surface));
          float caustic = 1.0 / (1.0 + dot(gradient, gradient) * 15.0);
          
          // Add fine detail
          vec2 p3 = uv * waveScale * 3.0 + vec2(time * waveSpeed * 0.5, time * waveSpeed * 0.8);
          float detail = fractalNoise(p3) * 0.2;
          caustic += detail;
          
          return pow(caustic, 1.2);
        }
        
        void main() {
          vec2 uv = vUv;
          
          float depthFactor = max(0.0, min(1.0, (playerDepth + 15.0) / 20.0));
          float intensity = lightIntensity * depthFactor;
          
          float distanceFromPlayer = length(vWorldPosition.xz) / 60.0;
          float proximityFactor = 1.0 - clamp(distanceFromPlayer, 0.0, 1.0);
          
          float causticsPattern = caustics(uv, time * 1.2);
          
          vec3 currentColor = mix(deepColor, lightColor, depthFactor);
          
          float finalIntensity = causticsPattern * intensity * causticsIntensity * (0.2 + proximityFactor * 0.8);
          finalIntensity *= (0.9 + sin(time * 1.5 + vWorldPosition.z * 0.08) * 0.1);
          
          gl_FragColor = vec4(currentColor * finalIntensity, finalIntensity * 0.4);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  }, [])

  // Update caustics based on player depth and time
  useFrame((state, delta) => {
    const time = state.clock.elapsedTime
    const depth = playerPosition.y

    // Update primary caustics
    if (causticsMaterialRef.current) {
      causticsMaterialRef.current.uniforms.time.value = time
      causticsMaterialRef.current.uniforms.playerDepth.value = depth
      
      // Adjust intensity based on depth - caustics are strongest in shallow water
      const depthIntensity = Math.max(0.1, Math.min(1.0, (depth + 15) / 20))
      causticsMaterialRef.current.uniforms.lightIntensity.value = depthIntensity
      
      // Adjust wave parameters based on depth
      const waveScale = 6 + (1 - depthIntensity) * 4 // Smaller patterns in deeper water
      const waveSpeed = 0.3 + depthIntensity * 0.4 // Slower in deeper water
      causticsMaterialRef.current.uniforms.waveScale.value = waveScale
      causticsMaterialRef.current.uniforms.waveSpeed.value = waveSpeed
      
      // Color shifts with depth
      const lightColor = new THREE.Color().lerpColors(
        new THREE.Color('#1565C0'), // Deep blue
        new THREE.Color('#87CEEB'), // Light blue
        depthIntensity
      )
      causticsMaterialRef.current.uniforms.lightColor.value = lightColor
    }

    // Update secondary caustics
    if (secondaryMaterialRef.current) {
      secondaryMaterialRef.current.uniforms.time.value = time
      secondaryMaterialRef.current.uniforms.playerDepth.value = depth
      
      const depthIntensity = Math.max(0.05, Math.min(0.8, (depth + 15) / 20))
      secondaryMaterialRef.current.uniforms.lightIntensity.value = depthIntensity * 0.6
      
      const waveScale = 8 + (1 - depthIntensity) * 6
      const waveSpeed = 0.2 + depthIntensity * 0.3
      secondaryMaterialRef.current.uniforms.waveScale.value = waveScale
      secondaryMaterialRef.current.uniforms.waveSpeed.value = waveSpeed
      
      const lightColor = new THREE.Color().lerpColors(
        new THREE.Color('#0D47A1'), // Very deep blue
        new THREE.Color('#B3E5FC'), // Very light blue
        depthIntensity
      )
      secondaryMaterialRef.current.uniforms.lightColor.value = lightColor
    }

    // Animate caustics planes slightly for more realism
    if (causticsRef.current) {
      causticsRef.current.position.y = -9.8 + Math.sin(time * 0.5) * 0.05
    }
    
    if (secondaryCausticsRef.current) {
      secondaryCausticsRef.current.position.y = -9.7 + Math.cos(time * 0.7) * 0.03
    }
  })

  return (
    <group>
      {/* Primary caustics layer - main ocean floor */}
      <mesh 
        ref={causticsRef}
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -9.8, 0]}
        material={causticsMaterial}
      >
        <planeGeometry args={[200, 200, 128, 128]} />
        <primitive object={causticsMaterial} ref={causticsMaterialRef} />
      </mesh>

      {/* Secondary caustics layer - adds depth and complexity */}
      <mesh 
        ref={secondaryCausticsRef}
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -9.7, 0]}
        material={secondaryCausticsMaterial}
      >
        <planeGeometry args={[180, 180, 96, 96]} />
        <primitive object={secondaryCausticsMaterial} ref={secondaryMaterialRef} />
      </mesh>

      {/* Caustics on terrain features */}
      <TerrainCaustics playerPosition={playerPosition} />
      
      {/* Caustics on coral and seaweed */}
      <ObjectCaustics playerPosition={playerPosition} />
    </group>
  )
}

// Component for caustics on terrain features
function TerrainCaustics({ playerPosition }) {
  const terrainCausticsRef = useRef()
  
  const terrainCausticsMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        playerDepth: { value: 0 },
        lightIntensity: { value: 0.4 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float playerDepth;
        uniform float lightIntensity;
        
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        
        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        float smoothNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float a = noise(i);
          float b = noise(i + vec2(1.0, 0.0));
          float c = noise(i + vec2(0.0, 1.0));
          float d = noise(i + vec2(1.0, 1.0));
          
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        void main() {
          vec2 uv = vWorldPosition.xz * 0.1 + time * 0.1;
          
          float depthFactor = max(0.0, min(1.0, (playerDepth + 15.0) / 20.0));
          
          // Create caustics that follow surface normal
          float normalFactor = max(0.0, dot(vNormal, vec3(0.0, 1.0, 0.0)));
          
          float caustic1 = smoothNoise(uv * 8.0 + time * 0.5);
          float caustic2 = smoothNoise(uv * 12.0 - time * 0.3);
          
          float caustics = (caustic1 + caustic2 * 0.7) / 1.7;
          caustics = pow(caustics, 1.5);
          
          float intensity = caustics * lightIntensity * depthFactor * normalFactor;
          
          vec3 color = mix(vec3(0.05, 0.1, 0.2), vec3(0.3, 0.6, 0.8), depthFactor);
          
          gl_FragColor = vec4(color * intensity, intensity * 0.3);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  }, [])

  useFrame((state) => {
    if (terrainCausticsRef.current) {
      terrainCausticsRef.current.uniforms.time.value = state.clock.elapsedTime
      terrainCausticsRef.current.uniforms.playerDepth.value = playerPosition.y
      
      const depthIntensity = Math.max(0.1, Math.min(0.6, (playerPosition.y + 15) / 20))
      terrainCausticsRef.current.uniforms.lightIntensity.value = depthIntensity * 0.4
    }
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -9.6, 0]}>
      <planeGeometry args={[150, 150, 64, 64]} />
      <primitive object={terrainCausticsMaterial} ref={terrainCausticsRef} />
    </mesh>
  )
}

// Component for caustics on objects like coral and seaweed
function ObjectCaustics({ playerPosition }) {
  const objectCausticsRef = useRef()
  
  useFrame((state) => {
    if (objectCausticsRef.current) {
      // Subtle movement to simulate caustics dancing on objects
      objectCausticsRef.current.children.forEach((child, index) => {
        if (child.material && child.material.uniforms) {
          child.material.uniforms.time.value = state.clock.elapsedTime + index * 0.5
          
          const depthFactor = Math.max(0.05, Math.min(0.8, (playerPosition.y + 15) / 20))
          child.material.uniforms.lightIntensity.value = depthFactor * 0.2
        }
      })
    }
  })

  // Create small caustics spots that would appear on coral and seaweed
  const causticsSpots = useMemo(() => {
    const spots = []
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2
      const radius = 15 + Math.random() * 25
      const x = Math.cos(angle) * radius + (Math.random() - 0.5) * 10
      const z = Math.sin(angle) * radius + (Math.random() - 0.5) * 10
      const y = -8 + Math.random() * 4
      
      spots.push({
        position: [x, y, z],
        scale: 0.5 + Math.random() * 1.5,
        rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI]
      })
    }
    return spots
  }, [])

  const spotMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        lightIntensity: { value: 0.3 }
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
        uniform float lightIntensity;
        varying vec2 vUv;
        
        void main() {
          vec2 center = vec2(0.5, 0.5);
          float dist = distance(vUv, center);
          
          float caustic = 1.0 - smoothstep(0.0, 0.5, dist);
          caustic *= (0.8 + sin(time * 3.0) * 0.2);
          
          float intensity = caustic * lightIntensity;
          
          gl_FragColor = vec4(vec3(0.4, 0.7, 1.0) * intensity, intensity * 0.6);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  }, [])

  return (
    <group ref={objectCausticsRef}>
      {causticsSpots.map((spot, index) => (
        <mesh 
          key={index}
          position={spot.position}
          rotation={spot.rotation}
          scale={spot.scale}
          material={spotMaterial.clone()}
        >
          <planeGeometry args={[2, 2]} />
        </mesh>
      ))}
    </group>
  )
}
