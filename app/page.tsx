"use client"

import { Suspense } from "react"
import dynamic from "next/dynamic"
import { Providers } from "./providers"

// Dynamically import the 3D scene to avoid SSR issues
const Scene = dynamic(() => import("@/components/Scene"), { ssr: false })

export default function Home() {
  return (
    <main className="relative w-full h-screen overflow-hidden">
      <Providers>
        <Suspense
          fallback={<div className="w-full h-screen flex items-center justify-center">Loading 3D scene...</div>}
        >
          <Scene />
        </Suspense>
      </Providers>
    </main>
  )
}
