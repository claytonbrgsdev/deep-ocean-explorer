"use client"

import { Suspense } from "react"
import dynamic from "next/dynamic"

const Scene = dynamic(() => import("@/components/Scene"), { ssr: false })

export default function Home() {
  return (
    <main className="relative w-full h-screen overflow-hidden bg-[#02121f]">
      <Suspense
        fallback={
          <div className="w-full h-screen flex items-center justify-center bg-[#02121f] text-cyan-200/70 font-mono text-sm tracking-[0.3em]">
            DESCENDING…
          </div>
        }
      >
        <Scene />
      </Suspense>
    </main>
  )
}
