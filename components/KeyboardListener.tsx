"use client"

import { useEffect } from "react"
import { useKeyboardControls } from "@react-three/drei"

export default function KeyboardListener() {
  // The hook returns [subscribe, getKeys] not [_, get, set]
  const [, getKeys] = useKeyboardControls()

  useEffect(() => {
    // Handle keydown events manually with DOM events
    const handleKeyDown = (e) => {
      // Prevent default behavior for arrow keys to avoid page scrolling
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault()
      }
    }

    // Add event listeners
    window.addEventListener("keydown", handleKeyDown)

    // Clean up
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  return null
}
