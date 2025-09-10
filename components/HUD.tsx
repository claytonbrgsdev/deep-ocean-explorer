"use client"

export default function HUD({ position }) {
  const depth = Math.max(0, Math.round((10 + position.y) * -1))
  
  // Determine depth zone for display
  const getDepthZone = (depth) => {
    if (depth <= 2) return { name: "Surface", color: "text-cyan-200", bg: "bg-cyan-500/20" }
    if (depth <= 5) return { name: "Shallow", color: "text-blue-200", bg: "bg-blue-500/20" }
    if (depth <= 10) return { name: "Medium", color: "text-blue-300", bg: "bg-blue-600/20" }
    if (depth <= 15) return { name: "Deep", color: "text-indigo-300", bg: "bg-indigo-600/20" }
    return { name: "Abyss", color: "text-purple-300", bg: "bg-purple-700/20" }
  }
  
  const depthZone = getDepthZone(depth)
  
  return (
    <div className="absolute bottom-4 left-4 bg-black/80 text-cyan-300 p-4 rounded-lg border border-cyan-400/50 z-10 backdrop-blur-sm">
      <div className="text-cyan-100 font-bold mb-3 flex items-center gap-2">
        🌊 Deep Ocean Explorer
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-cyan-400">Position:</span>
          <span>X: {position.x}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span></span>
          <span>Y: {position.y}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span></span>
          <span>Z: {position.z}</span>
        </div>
      </div>
      
      {/* Enhanced depth display with zone information */}
      <div className="mt-3 pt-3 border-t border-cyan-500/30">
        <div className="flex justify-between gap-4 text-sm mb-2">
          <span className="text-cyan-400">Depth:</span>
          <span className={`${depth > 15 ? 'text-red-400' : depth > 10 ? 'text-yellow-400' : 'text-cyan-300'}`}>
            {depth}m below surface
          </span>
        </div>
        
        {/* Depth zone indicator */}
        <div className={`text-xs px-2 py-1 rounded ${depthZone.bg} ${depthZone.color} text-center mb-2`}>
          {depthZone.name} Zone
        </div>
      </div>
      
      {/* Depth indicator bar */}
      <div className="mt-2">
        <div className="w-full bg-blue-900/50 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (depth / 20) * 100)}%` }}
          />
        </div>
      </div>

      {/* Light penetration indicator */}
      <div className="mt-2">
        <div className="flex justify-between text-xs text-cyan-400 mb-1">
          <span>Light Penetration:</span>
          <span>{Math.max(5, Math.round((1 - depth / 20) * 100))}%</span>
        </div>
        <div className="w-full bg-gray-700/50 rounded-full h-1">
          <div 
            className="bg-gradient-to-r from-yellow-300 via-blue-400 to-purple-600 h-1 rounded-full transition-all duration-300"
            style={{ width: `${Math.max(5, (1 - depth / 20) * 100)}%` }}
          />
        </div>
      </div>

      {/* Marine life indicator */}
      <div className="mt-3 pt-2 border-t border-cyan-500/30">
        <div className="text-xs text-cyan-400 flex items-center gap-2">
          🐠 Marine Life Active
          <div className="flex gap-1">
            <div className="w-1 h-1 bg-orange-400 rounded-full animate-pulse"></div>
            <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          </div>
        </div>
        <div className="text-xs text-purple-400 flex items-center gap-2 mt-1">
          🎐 Jellyfish Drifting
          <div className="flex gap-1">
            <div className="w-1 h-1 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }}></div>
            <div className="w-1 h-1 bg-pink-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
          </div>
        </div>
      </div>
    </div>
  )
}
