"use client"

import { Canvas } from "@react-three/fiber"
import PlayerJellyfish from "./PlayerJellyfish"
import NpcJellyfish from "./NpcJellyfish"
import FishSchools from "./FishSchools"
import Seafloor from "./Seafloor"
import HUD from "./HUD"
import {
  DepthLighting,
  OceanBackground,
  WaterSurface,
  LightShafts,
  Caustics,
  MarineSnow,
  BioMotes,
  Bubbles,
} from "./Environment"

export default function Scene() {
  return (
    <>
      <HUD />
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, -18, 10], fov: 60, near: 0.1, far: 600 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        <DepthLighting />
        <OceanBackground />
        <WaterSurface />
        <LightShafts />
        <Caustics />
        <MarineSnow />
        <BioMotes />
        <Bubbles />

        <Seafloor />
        <FishSchools />
        <NpcJellyfish />

        {/* player mounts last so its useFrame (movement + camera rig) runs after NPCs */}
        <PlayerJellyfish />
      </Canvas>
    </>
  )
}
