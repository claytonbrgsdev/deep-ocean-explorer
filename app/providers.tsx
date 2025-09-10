"use client"

import { KeyboardControls } from "@react-three/drei"
import { useEffect } from "react"

// Define the keyboard controls map with 3D movement (removed plant key)
const keyboardMap = [
  { name: "forward", keys: ["ArrowUp", "KeyW"] },
  { name: "backward", keys: ["ArrowDown", "KeyS"] },
  { name: "left", keys: ["ArrowLeft", "KeyA"] },
  { name: "right", keys: ["ArrowRight", "KeyD"] },
  { name: "up", keys: ["KeyQ", "Space"] }, // Swim up
  { name: "down", keys: ["KeyE", "ShiftLeft"] }, // Swim down
]

export function Providers({ children }) {
  // Prevent key scrolling at the document level
  useEffect(() => {
    const preventScroll = (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyQ", "KeyE"].includes(e.code)) {
        e.preventDefault()
      }
    }

    window.addEventListener("keydown", preventScroll)
    return () => window.removeEventListener("keydown", preventScroll)
  }, [])

  return <KeyboardControls map={keyboardMap}>{children}</KeyboardControls>
}
