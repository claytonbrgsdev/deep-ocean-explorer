"use client"

import { Canvas } from "@react-three/fiber"
import PlayerJellyfish from "./PlayerJellyfish"
import NpcJellyfish from "./NpcJellyfish"
import Plankton from "./Plankton"
import GameDirector from "./GameDirector"
import MantaRays from "./MantaRay"
import SeaTurtles from "./SeaTurtle"
import Shark from "./Shark"
import Octopus from "./Octopus"
import FishSchools from "./FishSchools"
import Seafloor from "./Seafloor"
import AbyssalForest from "./AbyssalForest"
import HUD from "./HUD"
import CharacterMaker from "./CharacterMaker"
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
      <CharacterMaker />
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
        <AbyssalForest />
        <FishSchools />
        <NpcJellyfish />
        <MantaRays />
        <SeaTurtles />
        <Shark />
        <Octopus />
        <Plankton />

        {/* player mounts last so its useFrame (movement + camera rig) runs after NPCs */}
        <PlayerJellyfish />
        {/* director runs after everything — reads final telemetry each frame */}
        <GameDirector />
      </Canvas>
    </>
  )
}
