// ---------------------------------------------------------------------------
// Ocean audio — fully synthesized WebAudio, no samples. One singleton, same
// philosophy as the other stores: the 3D loop calls update() with telemetry,
// game events call the one-shot voices. Everything hangs off a master gain
// so mute is a single knob. The context can only start after a user gesture
// (browser autoplay policy) — armAutoStart() wires that up.
//
// Layers:
//   rumble  — brown-ish noise through a lowpass: the body of the ocean.
//             Cutoff sinks with depth: the abyss sounds like a held breath.
//   wash    — slow bandpassed noise swells: water moving around you.
//   shimmer — bright filtered hiss near the surface, gone by the twilight.
//   tension — a low two-note pulse that fades in while the shark hunts.
// One-shots:
//   whoosh() — bell-stroke jet (noise burst, pitch falling)
//   ping()   — plankton eaten (tiny FM blip)
//   chime()  — mission complete (three soft partials)
// ---------------------------------------------------------------------------

interface AudioTelemetry {
  depth: number // meters, positive
  speed: number // m/s
  chasing: boolean
}

class OceanAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private rumbleFilter: BiquadFilterNode | null = null
  private washGain: GainNode | null = null
  private washLfoPhase = 0
  private shimmerGain: GainNode | null = null
  private tensionGain: GainNode | null = null
  private tensionLevel = 0
  muted = false
  started = false

  /** call once from the client; starts on the first key/pointer gesture */
  armAutoStart() {
    if (typeof window === "undefined" || this.started) return
    const boot = () => {
      this.start()
      window.removeEventListener("keydown", boot)
      window.removeEventListener("pointerdown", boot)
    }
    window.addEventListener("keydown", boot)
    window.addEventListener("pointerdown", boot)
  }

  private noiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i++) {
      // leaky integrator = brown-ish noise, much softer than white
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    }
    return buf
  }

  start() {
    if (this.started || typeof window === "undefined") return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    this.ctx = ctx
    this.started = true

    const master = ctx.createGain()
    master.gain.value = this.muted ? 0 : 0.9
    master.connect(ctx.destination)
    this.master = master

    const noise = this.noiseBuffer(ctx)

    // rumble
    const rumbleSrc = ctx.createBufferSource()
    rumbleSrc.buffer = noise
    rumbleSrc.loop = true
    const rumbleFilter = ctx.createBiquadFilter()
    rumbleFilter.type = "lowpass"
    rumbleFilter.frequency.value = 220
    rumbleFilter.Q.value = 0.4
    const rumbleGain = ctx.createGain()
    rumbleGain.gain.value = 0.5
    rumbleSrc.connect(rumbleFilter).connect(rumbleGain).connect(master)
    rumbleSrc.start()
    this.rumbleFilter = rumbleFilter

    // wash (slow swells, gain driven from update())
    const washSrc = ctx.createBufferSource()
    washSrc.buffer = noise
    washSrc.loop = true
    washSrc.playbackRate.value = 0.6
    const washFilter = ctx.createBiquadFilter()
    washFilter.type = "bandpass"
    washFilter.frequency.value = 480
    washFilter.Q.value = 0.8
    const washGain = ctx.createGain()
    washGain.gain.value = 0.05
    washSrc.connect(washFilter).connect(washGain).connect(master)
    washSrc.start()
    this.washGain = washGain

    // shimmer (surface sparkle)
    const shimmerSrc = ctx.createBufferSource()
    shimmerSrc.buffer = noise
    shimmerSrc.loop = true
    shimmerSrc.playbackRate.value = 2.4
    const shimmerFilter = ctx.createBiquadFilter()
    shimmerFilter.type = "highpass"
    shimmerFilter.frequency.value = 3200
    const shimmerGain = ctx.createGain()
    shimmerGain.gain.value = 0.05
    shimmerSrc.connect(shimmerFilter).connect(shimmerGain).connect(master)
    shimmerSrc.start()
    this.shimmerGain = shimmerGain

    // shark tension: two detuned low sines through a slow tremolo
    const tA = ctx.createOscillator()
    tA.type = "sine"
    tA.frequency.value = 55
    const tB = ctx.createOscillator()
    tB.type = "sine"
    tB.frequency.value = 58.5
    const tensionGain = ctx.createGain()
    tensionGain.gain.value = 0
    tA.connect(tensionGain)
    tB.connect(tensionGain)
    tensionGain.connect(master)
    tA.start()
    tB.start()
    this.tensionGain = tensionGain
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1)
    }
  }

  /** called every frame by GameDirector */
  update(dt: number, tele: AudioTelemetry) {
    if (!this.ctx || !this.started) return
    const t = this.ctx.currentTime
    const depthK = Math.min(tele.depth / 110, 1)

    // the deep muffles everything: 220 Hz at the surface → 60 Hz in the abyss
    this.rumbleFilter?.frequency.setTargetAtTime(220 - 160 * depthK, t, 0.4)
    // shimmer dies by ~35 m
    this.shimmerGain?.gain.setTargetAtTime(0.055 * Math.max(0, 1 - tele.depth / 35), t, 0.4)

    // wash swells slowly and grows a little with speed
    this.washLfoPhase += dt * 0.35
    const swell = 0.5 + 0.5 * Math.sin(this.washLfoPhase * Math.PI * 2)
    this.washGain?.gain.setTargetAtTime(0.03 + swell * 0.035 + Math.min(tele.speed / 8, 1) * 0.05, t, 0.25)

    // shark tension fades in/out over ~1.5 s, trembling as it holds
    const target = tele.chasing ? 1 : 0
    this.tensionLevel += (target - this.tensionLevel) * Math.min(dt / 1.0, 1)
    const tremble = 0.8 + 0.2 * Math.sin(this.washLfoPhase * 11)
    this.tensionGain?.gain.setTargetAtTime(this.tensionLevel * 0.16 * tremble, t, 0.1)
  }

  /** bell-stroke jet: strength 0..1 */
  whoosh(strength: number) {
    if (!this.ctx || !this.started || this.muted) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(ctx, 0.4)
    src.playbackRate.setValueAtTime(1.6, ctx.currentTime)
    src.playbackRate.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.35)
    const filter = ctx.createBiquadFilter()
    filter.type = "bandpass"
    filter.frequency.setValueAtTime(900, ctx.currentTime)
    filter.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.35)
    filter.Q.value = 1.2
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12 * Math.max(strength, 0.15), ctx.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    src.connect(filter).connect(gain).connect(this.master!)
    src.start()
    src.stop(ctx.currentTime + 0.45)
  }

  /** plankton eaten: a tiny rising blip; deep motes ring lower + warmer */
  ping(deep = false) {
    if (!this.ctx || !this.started || this.muted) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.type = "sine"
    const f0 = deep ? 520 : 880
    osc.frequency.setValueAtTime(f0, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.6, ctx.currentTime + 0.09)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28)
    osc.connect(gain).connect(this.master!)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  }

  /** mission complete: three soft partials, slow attack, long tail */
  chime() {
    if (!this.ctx || !this.started || this.muted) return
    const ctx = this.ctx
    const freqs = [392, 523.25, 659.25] // G4, C5, E5
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator()
      osc.type = "sine"
      osc.frequency.value = f
      const gain = ctx.createGain()
      const t0 = ctx.currentTime + i * 0.12
      gain.gain.setValueAtTime(0.001, t0)
      gain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.06)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4)
      osc.connect(gain).connect(this.master!)
      osc.start(t0)
      osc.stop(t0 + 1.5)
    })
  }
}

export const oceanAudio = new OceanAudio()

// dev-console access, mirrors __ocean/__game
if (typeof window !== "undefined") {
  ;(window as unknown as { __audio: OceanAudio }).__audio = oceanAudio
}
