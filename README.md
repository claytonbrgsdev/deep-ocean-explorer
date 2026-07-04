# Deep Ocean Explorer v2

An ambient, real-time underwater world running entirely in the browser. You are a
jellyfish. Every visual effect — volumetric light shafts, caustics, bioluminescence,
depth fog, the abyssal rave — is a hand-written GLSL `ShaderMaterial` inlined in
TypeScript. No post-processing library, no HDR maps, no external assets.

**Live**: https://claytonbrgsdev.github.io/deep-ocean-explorer/

| | |
|---|---|
| Stack | Next.js 15 · React 19 · three · @react-three/fiber 9 · Tailwind |
| Deploy | Static export → GitHub Pages (CI on every push to `main`) |
| Performance | 55–64 fps on a mid-range laptop, ~30 draw calls total |

## Controls

`W A S D` swim · `SPACE` rise · `SHIFT` dive · **drag** orbit camera ·
**scroll** zoom · `C` open the **Jelly Lab**

## The world — 120 m of ocean

Five depth zones with continuously lerped light, fog and background color
(depth is a continuous variable, never a step function):

| Zone | Depth | Character |
|---|---|---|
| Sunlit Surface | 0–9 m | bright teal, wave membrane overhead, god rays |
| Shallow Reef | 9–22 m | corals, seaweed meadows, fish schools |
| Twilight Zone | 22–42 m | light dies, bioluminescent plankton wakes |
| Midnight Deep | 42–70 m | near-dark, red abyssal jellies |
| **Abyssal Plain** | **70–120 m** | **the bioluminescent forest — the rave** |

The horizon has no line: the background sphere dissolves into an eye-level haze
band (`exp(-|dir.y|·2.4)` toward the zone fog color) and the endless water
surface plane follows the camera, fading out before its edge can ever show.

## The jellyfish

Anatomy is a single shared component (`JellyBody`) used by the player and every
NPC — bell, tentacles, oral arms, gonads, optional traits — with **all strand
animation in the vertex shader** (per jellyfish per frame the CPU writes a
handful of uniforms; zero matrix work, zero allocations).

- **Pulse-jet propulsion**: thrust follows an ADSR stroke envelope (fast smooth
  attack, exponential decay, coast, drag release) shared between the JS physics
  and the GLSL — what the tentacles visibly do is exactly what pushes the body.
  Measured speed: surge-and-coast between ~3.8 and 6 m/s.
- **Asymmetric bell mouth** (`bellWave`): contraction digs 1.75× deep (the mouth
  nearly closes) while expansion overshoots softly — the feeding-pulse
  silhouette. The tentacle attachment ring reproduces the *same* equation, so
  bell and roots stay mathematically welded.
- **Whip tentacles**: waves propagate base → tip with amplitude *growing*
  toward the free end (energy meets less mass), multiple S-curves along the
  strand, cubic free-end flail, and a gesture envelope (slow attack, long
  decay, 5% sustain) running at half the pulse rate — the body pulses, the
  limbs phrase.
- **Rotational drag cascade**: a ghost orientation trails the body (slerp
  2.6/s); strand roots follow the bell *now*, tips still live in its recent
  past, with a quadratic blend along the length — turns reach the tentacles as
  a wave through dense water.
- **Righting reflex**: with no input the body re-orients bell-up and hovers,
  breathing pulse-rise / coast-sink.
- **Dreamy camera**: heavy damping, a lazy look-target that trails the subject
  (the jelly drifts inside the frame), slow breathing drift on three axes, a
  whisper of roll and FOV breathing. Documentary operator, not action game.

## Jelly Lab (press `C`)

A live character maker — the panel floats over the game and edits the actual
player in real time. Six species presets, each a full `JellyConfig`:

**MOON** · **LUMINA** (luminous tip bulbs) · **WISP** (orbiting plankton aura,
small & quick) · **EMBER** (slow heavy royalty) · **ROSE** (ribbon dancer) ·
**ABYSSAL** (born in the rave)

On top of any preset: 4 color channels (curated swatches + free picker), 7
anatomy sliders (tentacle count/length, oral arms, bell width/height, size,
pulse tempo), trait dials, and RANDOMIZE. Stats drive gameplay — *speed* scales
stroke acceleration, *agility* scales turn rate, *glow* brightens the lantern
**and pushes the deep fog farther** (a bright jelly literally sees farther in
the dark). Saved to `localStorage`.

**NPCs are Jelly Lab citizens too**: twelve individuals wander the water column
with an 8-pattern behavior FSM (jittered timers, 15% mutation chance); deep
water belongs to the ABYSSAL morph, the sunlit column gets the other five
species.

## The abyssal forest

Revealed gradually between 60 and 78 m — total darkness, then the first lights,
then the whole rave. Four draw calls:

- 60 **helix kelp spires** (12–30 u tall) with light-sap pulses climbing them
- 120 **polyp domes** throbbing at 0.4–0.8 Hz in shared ground clusters
- 6 **siphonophore cords** drifting mid-water with traveling bead-light trains
- 450 **neon embers** rising off the seabed with individual flicker
- A global 10-second heartbeat phase-locks the whole forest (±15%)
- Palette: magenta → cyan → UV-violet → acid-green, all additive

## Architecture

```
lib/
  ocean.ts        mutable world store (zero setState in the loop), depth zones,
                  ADSR stroke envelope (JS + GLSL twins), shared GLSL noise
  species.ts      Jelly Lab store: species presets, subscribe/update/randomize,
                  localStorage persistence
components/
  Scene.tsx           composition root (Canvas + HUD + CharacterMaker)
  JellyBody.tsx       shared anatomy — bell lathe + instanced shader strands
  PlayerJellyfish.tsx input, pulse physics, orientation, camera rig
  NpcJellyfish.tsx    12 NPCs, species-based, behavior FSM
  FishSchools.tsx     boid-look flocking without O(n²)
  Environment.tsx     depth lighting, background, water surface, god rays,
                      dFdx/dFdy caustics, marine snow, plankton, bubbles
  Seafloor.tsx        noise terrain, rocks, corals, shader-swayed seaweed
  AbyssalForest.tsx   the rave (kelp spires, polyps, siphonophores, embers)
  CharacterMaker.tsx  Jelly Lab panel
  HUD.tsx             telemetry at 8 Hz (never per-frame setState)
```

Signature techniques kept from v1 and expanded: caustics from **screen-space
derivatives** (`dFdx`/`dFdy` of a procedural height field — the exact gradient
for free), volumetric shafts from multi-octave 3D noise with a Mie-style
anisotropy term, and every shader inlined as a TS template literal.

### Performance principles

1. No per-frame React: the 3D loop mutates plain stores; UI samples at 8 Hz.
2. Strand animation lives in vertex shaders — instanced buffers, per-instance
   attributes, uniform writes only.
3. Scratch objects allocated once (`useMemo`) and reused; zero per-frame GC.
4. Additive + `depthWrite: false` for every atmospheric layer.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # static export → out/ (basePath /deep-ocean-explorer)
```

Pushing to `main` deploys automatically via GitHub Actions → GitHub Pages.

## History

- **v1** (`v1-original` branch / tag `v1.0.0`): the original prototype — CPU
  tentacle matrices, 12-unit-deep world, per-frame setState.
- **v2** (this): full rewrite — GPU strands, 120 m world, pulse-jet physics,
  gestural tentacles, cinematic camera, abyssal forest, Jelly Lab.
- The wind-up stroke choreography experiment lives at commit `3d18dc7`
  (reverted by `eac11fc`, kept for future revisiting).
