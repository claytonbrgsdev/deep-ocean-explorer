"use client"

import { useState, useCallback } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { Button } from "@/components/ui/button"
import JellyfishCharacter from "./jellyfish-character" // Updated import
import Terrain from "./Terrain"
import Seaweeds from "./Trees" // Renamed import
import CoralReef from "./Rocks" // Renamed import
import HUD from "./HUD"
import KeyboardListener from "./KeyboardListener"
import UnderwaterEffects from "./UnderwaterEffects"
import FishSchools from "./Fish"
import JellyfishSwarms from "./Jellyfish"
import DepthBasedLighting from "./DepthBasedLighting"
import UnderwaterCaustics from "./UnderwaterCaustics"
import VolumetricLightShafts from "./VolumetricLightShafts"
import DeepSeaBackground from "./DeepSeaBackground"

export default function Scene() {
  const [characterPosition, setCharacterPosition] = useState({ x: 0, y: 0, z: 0 })
  const [resetTrigger, setResetTrigger] = useState(0)
  const [debugMode, setDebugMode] = useState(false)

  const resetCharacter = () => {
    setResetTrigger((prev) => prev + 1)
  }

  const toggleDebugMode = () => {
    setDebugMode(!debugMode)
  }

  return (
    <>
      {/* Underwater overlay effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 via-blue-800/30 to-blue-900/50 pointer-events-none z-5" />
      
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <Button onClick={resetCharacter} variant="outline" className="bg-cyan-900/90 border-cyan-400 text-cyan-100 hover:bg-cyan-800 backdrop-blur-sm">
          Reset Position
        </Button>
        <Button onClick={toggleDebugMode} variant="outline" className="bg-cyan-900/90 border-cyan-400 text-cyan-100 hover:bg-cyan-800 backdrop-blur-sm">
          {debugMode ? "Disable Debug" : "Enable Debug"}
        </Button>
      </div>

      <HUD position={characterPosition} />

      <Canvas 
        shadows 
        camera={{ position: [0, 0, 10], fov: 75 }} 
        gl={{ 
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          pixelRatio: Math.min(window.devicePixelRatio, 1.5) // Optimized pixel ratio for better performance
        }} 
        scene={{ background: null }}
      >
        <KeyboardListener />
        {debugMode && <OrbitControls />}
        
        {/* Removed remote HDR environment to avoid 429 fetch errors */}
        
        {/* Depth-based dynamic lighting system */}
        <DepthBasedLighting playerPosition={characterPosition} />
        
        {/* Dramatic volumetric light shafts */}
        <VolumetricLightShafts playerPosition={characterPosition} />
        
        {/* Realistic underwater caustics */}
        <UnderwaterCaustics playerPosition={characterPosition} />
        
        {/* Dynamic fog that changes with depth - now handled by DepthBasedLighting */}
        <fog attach="fog" args={['#0D47A1', 10, 50]} />

        {/* Add underwater effects */}
        <UnderwaterEffects />

        {/* Add deep sea background elements */}
        <DeepSeaBackground />

        {/* Add jellyfish swarms */}
        <JellyfishSwarms />

        {/* Add fish schools */}
        <FishSchools />

        {/* Use the jellyfish model as the player character */}
        <JellyfishCharacter
          resetTrigger={resetTrigger}
          onPositionChange={setCharacterPosition}
        />

        <Terrain />
        <Seaweeds />
        <CoralReef />
      </Canvas>
    </>
  )
}
