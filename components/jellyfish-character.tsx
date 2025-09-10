"use client"

    import { useRef, useState, useEffect, useMemo } from "react"
    import { useFrame, useThree } from "@react-three/fiber"
    import { useKeyboardControls, useTexture } from "@react-three/drei"
    import { Vector3 } from "three"
    import * as THREE from "three"
    import { assetPath } from "../lib/utils"

    // This component combines player control logic with the user's new, more complex jellyfish model.
    export default function JellyfishCharacter({ resetTrigger, onPositionChange }) {
      // Refs for the character and its parts
      const characterRef = useRef<THREE.Group>(null)
      const tentaclesRef = useRef<THREE.InstancedMesh>(null)
      const shaderMaterialRef = useRef<THREE.ShaderMaterial>(null)

      // Refs for movement logic
      const targetPositionRef = useRef(new Vector3(0, 0, 0))
      const { camera } = useThree()

      // Keyboard controls for 3D movement
      const forward = useKeyboardControls((state) => state.forward)
      const backward = useKeyboardControls((state) => state.backward)
      const left = useKeyboardControls((state) => state.left)
      const right = useKeyboardControls((state) => state.right)
      const up = useKeyboardControls((state) => state.up)
      const down = useKeyboardControls((state) => state.down)

      // Character state
      const [clickToMove, setClickToMove] = useState(false)

      // Swimming settings
      const SWIM_SPEED = 3
      const ROTATION_SPEED = 2.5
      // Vertical bounds to restrain the player within the ocean volume
      // Keep above the seafloor (seaweeds at ~-10) and below the surface
      const MIN_DEPTH = -9
      const MAX_HEIGHT = 3

      // --- Jellyfish specific setup from user's code ---
      const texture = useTexture(assetPath("/placeholder.svg"))
      const bellGeometry = useMemo(() => new THREE.SphereGeometry(1, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.5), [])
      const tentacleCylinderGeometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8), [])

      const tentacleData = useMemo(() => {
        const data = []
        const mainTentacleCount = 16
        const smallTentacleCount = 32

        for (let i = 0; i < mainTentacleCount; i++) {
          const angle = (i / mainTentacleCount) * Math.PI * 2
          data.push({
            baseX: Math.cos(angle) * 0.8,
            baseZ: Math.sin(angle) * 0.8,
            angle,
            length: 3 + Math.random() * 2,
            segments: Math.floor(20 + Math.random() * 8),
            thickness: 0.03 + Math.random() * 0.02,
          })
        }
        for (let i = 0; i < smallTentacleCount; i++) {
          const angle = (i / smallTentacleCount) * Math.PI * 2
          data.push({
            baseX: Math.cos(angle) * 0.9,
            baseZ: Math.sin(angle) * 0.9,
            angle,
            length: 1 + Math.random() * 1.5,
            segments: Math.floor(10 + Math.random() * 8),
            thickness: 0.01 + Math.random() * 0.015,
          })
        }
        return data
      }, [])

      const tentacleSegments = useMemo(() => tentacleData.reduce((acc, tentacle) => acc + tentacle.segments, 0), [tentacleData])

      const jellyfishShaderMaterial = useMemo(() => ({
        uniforms: {
          uTime: { value: 0 },
          uTexture: { value: texture },
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormal;
          uniform float uTime;
          void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            vec3 pos = position;
            pos.y += sin(pos.x * 10.0 + uTime) * 0.05;
            pos.y += sin(pos.z * 10.0 + uTime) * 0.05;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uTexture;
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            vec3 color = texture2D(uTexture, vUv).rgb;
            float pulse = sin(uTime * 2.0) * 0.5 + 0.5;
            float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
            vec3 glowColor = vec3(0.6, 0.8, 1.0);
            color = mix(color, glowColor, fresnel * pulse * 0.5);
            gl_FragColor = vec4(color, 0.7 + fresnel * 0.3);
          }
        `,
      }), [texture])
      // --- End of jellyfish specific setup ---

      // Handle click to move
      useEffect(() => {
        const handleClick = (event) => {
          if (event.button !== 0) return
          const raycaster = new THREE.Raycaster()
          const mouse = new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1)
          raycaster.setFromCamera(mouse, camera)
          if (characterRef.current) {
            const direction = raycaster.ray.direction.clone()
            const target = camera.position.clone().add(direction.multiplyScalar(10))
            target.y = Math.max(MIN_DEPTH, Math.min(MAX_HEIGHT, target.y))
            targetPositionRef.current.copy(target)
            setClickToMove(true)
          }
        }
        window.addEventListener("click", handleClick)
        return () => window.removeEventListener("click", handleClick)
      }, [camera])

      // Reset character position
      useEffect(() => {
        if (resetTrigger > 0 && characterRef.current) {
          characterRef.current.position.set(0, 0, 0)
          targetPositionRef.current.set(0, 0, 0)
          setClickToMove(false)
          onPositionChange({ x: 0, y: 0, z: 0 })
        }
      }, [resetTrigger, onPositionChange])

      // Main update loop
      useFrame((state, delta) => {
        if (!characterRef.current || !tentaclesRef.current || !shaderMaterialRef.current) return

        const character = characterRef.current
        const time = state.clock.getElapsedTime()
        let moving = false

        // --- Player Movement Logic ---
        const cameraDirection = new Vector3()
        camera.getWorldDirection(cameraDirection)
        const cameraRight = new Vector3().crossVectors(camera.up, cameraDirection).normalize()
        const velocity = new Vector3(0, 0, 0)

        if (forward) { velocity.add(cameraDirection.clone().multiplyScalar(SWIM_SPEED * delta)); moving = true }
        if (backward) { velocity.add(cameraDirection.clone().multiplyScalar(-SWIM_SPEED * delta)); moving = true }
        if (left) { velocity.add(cameraRight.clone().multiplyScalar(SWIM_SPEED * delta)); moving = true }
        if (right) { velocity.add(cameraRight.clone().multiplyScalar(-SWIM_SPEED * delta)); moving = true }
        if (up) { velocity.y += SWIM_SPEED * delta; moving = true }
        if (down) { velocity.y -= SWIM_SPEED * delta; moving = true }

        if (moving) setClickToMove(false)

        if (clickToMove) {
          const distanceToTarget = character.position.distanceTo(targetPositionRef.current)
          if (distanceToTarget > 0.5) {
            const dirToTarget = new Vector3().subVectors(targetPositionRef.current, character.position).normalize()
            velocity.add(dirToTarget.multiplyScalar(SWIM_SPEED * delta))
            moving = true
          } else {
            setClickToMove(false)
          }
        }

        const newPosition = character.position.clone().add(velocity)
        newPosition.y = Math.max(MIN_DEPTH, Math.min(MAX_HEIGHT, newPosition.y))
        character.position.copy(newPosition)

        if (velocity.length() > 0.01) {
          const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(character.position, character.position.clone().add(velocity), camera.up)
          )
          character.quaternion.slerp(targetQuaternion, ROTATION_SPEED * delta)
        }
        // --- End Player Movement Logic ---

        // --- Jellyfish Aesthetic Animation ---
        shaderMaterialRef.current.uniforms.uTime.value = time
        const pulse = Math.sin(time * 0.5) * 0.1
        character.scale.y = 1 + pulse

        let segmentIndex = 0
        tentacleData.forEach((tentacle) => {
          let prevPosition: Vector3 | null = null
          for (let j = 0; j < tentacle.segments; j++) {
            const matrix = new THREE.Matrix4()
            const segmentRatio = j / tentacle.segments
            const yOffset = -tentacle.length * segmentRatio
            const waveFreq = 2 - segmentRatio
            const waveAmp = 0.1 + segmentRatio * 0.3
            const waveX = Math.sin(time * waveFreq + tentacle.angle) * waveAmp * segmentRatio
            const waveZ = Math.cos(time * waveFreq + tentacle.angle) * waveAmp * segmentRatio
            const x = tentacle.baseX + waveX
            const y = yOffset + Math.sin(time * 2 + segmentRatio * Math.PI) * 0.1
            const z = tentacle.baseZ + waveZ
            const position = new THREE.Vector3(x, y, z)

            let rotation
            if (!prevPosition) {
              rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, tentacle.angle, Math.PI / 2))
            } else {
              const direction = new THREE.Vector3().subVectors(position, prevPosition)
              rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
            }
            prevPosition = position.clone()

            const scale = new THREE.Vector3(
              tentacle.thickness * (1 - segmentRatio * 0.7),
              tentacle.length / tentacle.segments,
              tentacle.thickness * (1 - segmentRatio * 0.7)
            )
            matrix.compose(position, rotation, scale)
            tentaclesRef.current.setMatrixAt(segmentIndex, matrix)
            segmentIndex++
          }
        })
        tentaclesRef.current.instanceMatrix.needsUpdate = true
        // --- End Jellyfish Aesthetic Animation ---

        // Update HUD
        onPositionChange({
          x: Math.round(character.position.x * 100) / 100,
          y: Math.round(character.position.y * 100) / 100,
          z: Math.round(character.position.z * 100) / 100,
        })

        // Update camera
        const idealCameraPosition = character.position.clone().add(new Vector3(-cameraDirection.x * 10, 3, -cameraDirection.z * 10))
        state.camera.position.lerp(idealCameraPosition, 0.05)
        state.camera.lookAt(character.position.x, character.position.y, character.position.z)
      })

      return (
        <group ref={characterRef} scale={0.5}>
          <mesh geometry={bellGeometry} castShadow>
            <shaderMaterial ref={shaderMaterialRef} args={[jellyfishShaderMaterial]} transparent depthWrite={false} />
          </mesh>
          <pointLight position={[0, 0, 0]} distance={2} intensity={2} color="#fff7d6" />
          <pointLight position={[0, -0.2, 0]} distance={1.5} intensity={1.5} color="#ff9f7a" />
          <instancedMesh ref={tentaclesRef} args={[tentacleCylinderGeometry, undefined, tentacleSegments]} castShadow>
            <meshPhysicalMaterial
              transparent
              opacity={0.6}
              roughness={0.2}
              transmission={0.9}
              thickness={0.5}
              color="#a8c6ff"
              emissive="#3366ff"
              emissiveIntensity={0.2}
            />
          </instancedMesh>
        </group>
      )
    }
