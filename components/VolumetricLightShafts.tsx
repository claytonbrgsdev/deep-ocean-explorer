"use client"

import { useRef, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

export default function VolumetricLightShafts({ playerPosition }) {
  const lightShaftsRef = useRef()
  const godRaysRef = useRef()
  const particleSystemRef = useRef()
  
  // Create volumetric light shaft material
  const lightShaftMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        playerDepth: { value: 0 },
        lightIntensity: { value: 1.0 },
        rayDensity: { value: 0.8 },
        rayWidth: { value: 2.0 },
        sunAngle: { value: 0.3 },
        scatteringStrength: { value: 0.6 },
        lightColor: { value: new THREE.Color('#FFE082') },
        deepColor: { value: new THREE.Color('#4FC3F7') },
        viewPosition: { value: new THREE.Vector3() }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vViewDirection;
        
        uniform vec3 viewPosition;
        
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vViewDirection = normalize(worldPosition.xyz - viewPosition);
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float playerDepth;
        uniform float lightIntensity;
        uniform float rayDensity;
        uniform float rayWidth;
        uniform float sunAngle;
        uniform float scatteringStrength;
        uniform vec3 lightColor;
        uniform vec3 deepColor;
        
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vViewDirection;
        
        // Noise functions for realistic light scattering
        float noise(vec3 p) {
          return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        }
        
        float smoothNoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          
          float a = noise(i);
          float b = noise(i + vec3(1.0, 0.0, 0.0));
          float c = noise(i + vec3(0.0, 1.0, 0.0));
          float d = noise(i + vec3(1.0, 1.0, 0.0));
          float e = noise(i + vec3(0.0, 0.0, 1.0));
          float f1 = noise(i + vec3(1.0, 0.0, 1.0));
          float g = noise(i + vec3(0.0, 1.0, 1.0));
          float h = noise(i + vec3(1.0, 1.0, 1.0));
          
          float x1 = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          float x2 = mix(mix(e, f1, f.x), mix(g, h, f.x), f.y);
          
          return mix(x1, x2, f.z);
        }
        
        float fractalNoise(vec3 p) {
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
        
        // Calculate volumetric light scattering
        float volumetricScattering(vec3 worldPos, vec3 viewDir, float depth) {
          // Sun direction (coming from above at an angle)
          vec3 sunDir = normalize(vec3(sin(sunAngle), -cos(sunAngle), 0.2));
          
          // Distance from ray center
          float rayDistance = length(worldPos.xz);
          
          // Create multiple light shafts
          float shaftPattern = 0.0;
          
          // Main central shaft
          float centralShaft = exp(-rayDistance * rayDistance / (rayWidth * rayWidth));
          shaftPattern += centralShaft;
          
          // Additional shafts at different positions
          for(int i = 0; i < 6; i++) {
            float angle = float(i) * 1.047; // 60 degrees apart
            vec2 shaftCenter = vec2(cos(angle), sin(angle)) * 8.0;
            float shaftDist = length(worldPos.xz - shaftCenter);
            float shaft = exp(-shaftDist * shaftDist / (rayWidth * rayWidth * 0.7));
            shaftPattern += shaft * 0.6;
          }
          
          // Add noise for realistic light scattering
          vec3 noisePos = worldPos * 0.1 + vec3(0.0, time * 0.2, 0.0);
          float scatterNoise = fractalNoise(noisePos);
          
          // Depth-based attenuation
          float depthAttenuation = max(0.0, (depth + 2.0) / 10.0);
          
          // View angle scattering (more visible when looking towards sun)
          float viewScatter = max(0.0, dot(-viewDir, sunDir));
          viewScatter = pow(viewScatter, 2.0);
          
          // Combine all effects
          float scattering = shaftPattern * scatterNoise * depthAttenuation * (0.5 + viewScatter * 0.5);
          
          return scattering * scatteringStrength;
        }
        
        void main() {
          // Only render light shafts in shallow water
          float shallowFactor = max(0.0, min(1.0, (playerDepth + 2.0) / 4.0));
          if(shallowFactor < 0.1) {
            discard;
          }
          
          // Calculate volumetric scattering
          float scattering = volumetricScattering(vWorldPosition, vViewDirection, playerDepth);
          
          // Color mixing based on depth
          vec3 currentColor = mix(deepColor, lightColor, shallowFactor);
          
          // Add subtle animation
          float animation = sin(time * 0.5 + vWorldPosition.y * 0.1) * 0.1 + 0.9;
          
          // Final intensity calculation
          float finalIntensity = scattering * lightIntensity * shallowFactor * animation;
          
          // Add depth-based color variation
          currentColor = mix(currentColor, vec3(1.0, 1.0, 0.9), finalIntensity * 0.3);
          
          gl_FragColor = vec4(currentColor, finalIntensity * rayDensity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  }, [])

  // Create god rays material (more dramatic, directional shafts)
  const godRaysMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        playerDepth: { value: 0 },
        lightIntensity: { value: 0.8 },
        rayCount: { value: 8.0 },
        raySpread: { value: 15.0 },
        viewPosition: { value: new THREE.Vector3() }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vViewDirection;
        
        uniform vec3 viewPosition;
        
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vViewDirection = normalize(worldPosition.xyz - viewPosition);
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float playerDepth;
        uniform float lightIntensity;
        uniform float rayCount;
        uniform float raySpread;
        
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vViewDirection;
        
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
        
        // Create dramatic god rays
        float godRays(vec3 worldPos, float depth) {
          float rays = 0.0;
          
          // Create multiple directional rays
          for(float i = 0.0; i < rayCount; i++) {
            float angle = (i / rayCount) * 6.28318 + time * 0.1;
            vec2 rayDir = vec2(cos(angle), sin(angle));
            
            // Ray position
            vec2 rayPos = rayDir * raySpread;
            float distToRay = length(worldPos.xz - rayPos);
            
            // Ray intensity with falloff
            float rayIntensity = exp(-distToRay * distToRay / 4.0);
            
            // Add noise along the ray
            vec2 noisePos = worldPos.xz * 0.05 + rayDir * time * 0.3;
            float rayNoise = smoothNoise(noisePos);
            
            rays += rayIntensity * rayNoise;
          }
          
          // Depth attenuation
          float depthFactor = max(0.0, (depth + 2.0) / 6.0);
          
          return rays * depthFactor;
        }
        
        void main() {
          // Only visible in very shallow water
          float shallowFactor = max(0.0, min(1.0, (playerDepth + 1.0) / 3.0));
          if(shallowFactor < 0.2) {
            discard;
          }
          
          float rays = godRays(vWorldPosition, playerDepth);
          
          // Golden sunlight color
          vec3 sunColor = vec3(1.0, 0.9, 0.6);
          vec3 waterColor = vec3(0.4, 0.8, 1.0);
          vec3 finalColor = mix(waterColor, sunColor, rays * 0.7);
          
          float finalIntensity = rays * lightIntensity * shallowFactor;
          
          gl_FragColor = vec4(finalColor, finalIntensity * 0.4);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  }, [])

  // Create floating light particles that follow the light shafts
  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const particleCount = 60
    
    const positions = new Float32Array(particleCount * 3)
    const velocities = new Float32Array(particleCount * 3)
    const lifetimes = new Float32Array(particleCount)
    const sizes = new Float32Array(particleCount)
    
    for (let i = 0; i < particleCount; i++) {
      // Position particles in light shaft areas
      const angle = Math.random() * Math.PI * 2
      const radius = Math.random() * 20
      
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = Math.random() * 8 - 2 // Shallow water range
      positions[i * 3 + 2] = Math.sin(angle) * radius
      
      velocities[i * 3] = (Math.random() - 0.5) * 0.02
      velocities[i * 3 + 1] = Math.random() * 0.05 + 0.01 // Upward drift
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02
      
      lifetimes[i] = Math.random() * 10
      sizes[i] = Math.random() * 0.1 + 0.05
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3))
    geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    
    return geometry
  }, [])

  const particleMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        playerDepth: { value: 0 },
        lightIntensity: { value: 0.6 }
      },
      vertexShader: `
        attribute vec3 velocity;
        attribute float lifetime;
        attribute float size;
        
        uniform float time;
        uniform float playerDepth;
        
        varying float vAlpha;
        varying float vBrightness;
        
        void main() {
          vec3 pos = position;
          
          // Animate particles
          pos += velocity * time;
          
          // Reset particles that go too high
          if(pos.y > 8.0) {
            pos.y = -2.0;
          }
          
          // Calculate alpha based on depth and lifetime
          float depthFactor = max(0.0, (playerDepth + 2.0) / 6.0);
          float lifeFactor = sin(time * 0.5 + lifetime) * 0.5 + 0.5;
          vAlpha = depthFactor * lifeFactor;
          
          // Brightness varies with position in light shafts
          float distFromCenter = length(pos.xz) / 20.0;
          vBrightness = 1.0 - clamp(distFromCenter, 0.0, 1.0);
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * 100.0 * (1.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float lightIntensity;
        
        varying float vAlpha;
        varying float vBrightness;
        
        void main() {
          // Create circular particle
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          
          if(dist > 0.5) discard;
          
          float alpha = (1.0 - dist * 2.0) * vAlpha * lightIntensity;
          vec3 color = mix(vec3(0.4, 0.8, 1.0), vec3(1.0, 1.0, 0.8), vBrightness);
          
          gl_FragColor = vec4(color, alpha * 0.3);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  }, [])

  // Update light shafts based on player position and time
  useFrame((state, delta) => {
    const time = state.clock.elapsedTime
    const depth = playerPosition.y
    const camera = state.camera

    // Update main light shafts
    if (lightShaftsRef.current && lightShaftsRef.current.material) {
      const material = lightShaftsRef.current.material
      material.uniforms.time.value = time
      material.uniforms.playerDepth.value = depth
      material.uniforms.viewPosition.value.copy(camera.position)
      
      // Adjust intensity based on depth - strongest in shallow water
      const shallowIntensity = Math.max(0, Math.min(1, (depth + 2) / 4))
      material.uniforms.lightIntensity.value = shallowIntensity * 0.8
      
      // Animate sun angle slightly
      material.uniforms.sunAngle.value = 0.3 + Math.sin(time * 0.1) * 0.1
      
      // Adjust ray properties based on depth
      material.uniforms.rayWidth.value = 2.0 + (1 - shallowIntensity) * 1.0
      material.uniforms.rayDensity.value = 0.6 + shallowIntensity * 0.4
    }

    // Update god rays
    if (godRaysRef.current && godRaysRef.current.material) {
      const material = godRaysRef.current.material
      material.uniforms.time.value = time
      material.uniforms.playerDepth.value = depth
      material.uniforms.viewPosition.value.copy(camera.position)
      
      // God rays only visible in very shallow water
      const godRayIntensity = Math.max(0, Math.min(1, (depth + 1) / 3))
      material.uniforms.lightIntensity.value = godRayIntensity * 0.6
      
      // Animate ray spread
      material.uniforms.raySpread.value = 12 + Math.sin(time * 0.2) * 3
    }

    // Update particles
    if (particleSystemRef.current && particleSystemRef.current.material) {
      const material = particleSystemRef.current.material
      material.uniforms.time.value = time
      material.uniforms.playerDepth.value = depth
      
      const particleIntensity = Math.max(0, Math.min(1, (depth + 2) / 5))
      material.uniforms.lightIntensity.value = particleIntensity
    }

    // Animate the entire light shaft system position slightly
    if (lightShaftsRef.current) {
      lightShaftsRef.current.position.y = Math.sin(time * 0.3) * 0.2
      lightShaftsRef.current.rotation.y = time * 0.02
    }
  })

  return (
    <group>
      {/* Main volumetric light shafts */}
      <mesh 
        ref={lightShaftsRef}
        position={[0, 2, 0]}
        material={lightShaftMaterial}
      >
        <cylinderGeometry args={[25, 30, 12, 32, 1, true]} />
      </mesh>

      {/* Dramatic god rays */}
      <mesh 
        ref={godRaysRef}
        position={[0, 1, 0]}
        material={godRaysMaterial}
      >
        <cylinderGeometry args={[20, 25, 8, 24, 1, true]} />
      </mesh>

      {/* Floating light particles */}
      <points 
        ref={particleSystemRef}
        geometry={particleGeometry}
        material={particleMaterial}
      />

      {/* Additional directional light shafts */}
      <DirectionalLightShafts playerPosition={playerPosition} />
      
      {/* Surface light interaction */}
      <SurfaceLightInteraction playerPosition={playerPosition} />
    </group>
  )
}

// Component for additional directional light shafts
function DirectionalLightShafts({ playerPosition }) {
  const shaftsRef = useRef()
  
  const shaftPositions = useMemo(() => [
    { pos: [15, 0, 10], rotation: [0, 0.3, 0], scale: 0.8 },
    { pos: [-12, 0, 18], rotation: [0, -0.2, 0], scale: 0.6 },
    { pos: [8, 0, -15], rotation: [0, 0.5, 0], scale: 0.7 },
    { pos: [-20, 0, -8], rotation: [0, -0.4, 0], scale: 0.9 },
  ], [])

  const shaftMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        playerDepth: { value: 0 },
        intensity: { value: 0.4 }
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
        uniform float intensity;
        
        varying vec2 vUv;
        varying vec3 vWorldPosition;
        
        void main() {
          float shallowFactor = max(0.0, (playerDepth + 2.0) / 5.0);
          
          // Create shaft pattern
          float shaft = 1.0 - abs(vUv.x - 0.5) * 2.0;
          shaft = pow(shaft, 3.0);
          
          // Add vertical variation
          float vertical = sin(vWorldPosition.y * 0.5 + time) * 0.2 + 0.8;
          
          float finalIntensity = shaft * vertical * intensity * shallowFactor;
          
          vec3 color = mix(vec3(0.4, 0.8, 1.0), vec3(1.0, 1.0, 0.8), finalIntensity);
          
          gl_FragColor = vec4(color, finalIntensity * 0.3);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  }, [])

  useFrame((state) => {
    if (shaftsRef.current) {
      shaftsRef.current.children.forEach((shaft, index) => {
        if (shaft.material && shaft.material.uniforms) {
          shaft.material.uniforms.time.value = state.clock.elapsedTime + index * 0.5
          shaft.material.uniforms.playerDepth.value = playerPosition.y
          
          const shallowIntensity = Math.max(0, Math.min(1, (playerPosition.y + 2) / 5))
          shaft.material.uniforms.intensity.value = shallowIntensity * 0.3
        }
      })
    }
  })

  return (
    <group ref={shaftsRef}>
      {shaftPositions.map((shaft, index) => (
        <mesh 
          key={index}
          position={shaft.pos}
          rotation={shaft.rotation}
          scale={[shaft.scale, 1, shaft.scale]}
          material={shaftMaterial.clone()}
        >
          <planeGeometry args={[4, 10]} />
        </mesh>
      ))}
    </group>
  )
}

// Component for surface light interaction effects
function SurfaceLightInteraction({ playerPosition }) {
  const surfaceRef = useRef()
  
  const surfaceMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        playerDepth: { value: 0 }
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
        uniform float playerDepth;
        varying vec2 vUv;
        
        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        void main() {
          // Only visible when very close to surface
          float surfaceFactor = max(0.0, (playerDepth + 0.5) / 1.5);
          if(surfaceFactor < 0.1) discard;
          
          vec2 uv = vUv * 10.0 + time * 0.1;
          float n = noise(uv) * 0.5 + noise(uv * 2.0) * 0.25;
          
          float intensity = n * surfaceFactor * 0.2;
          
          gl_FragColor = vec4(vec3(1.0, 1.0, 0.9), intensity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  }, [])

  useFrame((state) => {
    if (surfaceRef.current && surfaceRef.current.material) {
      surfaceRef.current.material.uniforms.time.value = state.clock.elapsedTime
      surfaceRef.current.material.uniforms.playerDepth.value = playerPosition.y
    }
  })

  return (
    <mesh 
      ref={surfaceRef}
      position={[0, 8, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={surfaceMaterial}
    >
      <planeGeometry args={[60, 60]} />
    </mesh>
  )
}
