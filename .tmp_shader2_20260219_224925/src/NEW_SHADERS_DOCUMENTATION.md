# New Animated Shader Backgrounds

## Overview

Added **8 new animated shader backgrounds** to the reminder tool, expanding from 4 to 12 total shaders. Each shader features unique visual effects, mouse interactivity, and dynamic color changes based on reminder states (blue for active, green for upcoming).

---

## New Shader List

### 5. Plasma Flow
**Color**: Amber (#f59e0b)

**Description**: A flowing plasma effect with sinusoidal color waves that create an organic, fluid appearance.

**Features**:
- Multi-layered sine wave calculations
- Smooth color gradients
- Mouse interaction amplifies plasma intensity
- Rainbow plasma in default state
- Blue/green plasma for reminder states

**Best For**: Calm, meditative sessions; ambient background

---

### 6. Particle Field
**Color**: Blue (#3b82f6)

**Description**: Multiple layers of floating particles moving in circular orbits, creating a sense of depth and dimension.

**Features**:
- 3 depth layers with different particle speeds
- Circular orbital movement
- Mouse proximity creates brightness boost
- Parallax-like depth effect
- Smooth particle glow

**Best For**: Focus and concentration; dynamic but not distracting

---

### 7. Voronoi Cells
**Color**: Cyan (#06b6d4)

**Description**: Animated cellular patterns based on Voronoi diagrams, creating organic, cell-like structures.

**Features**:
- Dynamic cell movement
- Smooth color transitions between cells
- Mouse interaction changes cell density
- Organic, natural-looking patterns
- Pulsating cell boundaries

**Best For**: Creative work; unique aesthetic appeal

---

### 8. Aurora Waves
**Color**: Teal (#14b8a6)

**Description**: Northern lights-inspired flowing waves with fractal noise distortion.

**Features**:
- Multiple layered waves at different frequencies
- Fractal brownian motion (FBM) for natural distortion
- Mouse creates wave disturbances
- Smooth gradient blending
- Aurora borealis color palette

**Best For**: Relaxation; natural beauty enthusiasts

---

### 9. Tunnel Vision
**Color**: Purple (#a855f7)

**Description**: A hypnotic rotating tunnel effect with spiral patterns that draw the eye toward the center.

**Features**:
- 3D tunnel illusion using polar coordinates
- Spiral rotation animation
- Mouse influences rotation speed
- Radial gradient fade
- Logarithmic depth perception

**Best For**: Hypnotic effect; meditation timers

---

### 10. Fractal Noise
**Color**: Slate (#64748b)

**Description**: Multi-layered fractal noise creating complex, ever-evolving cloud-like patterns.

**Features**:
- 6 octaves of noise (FBM)
- Recursive noise layering
- Mouse interaction shifts noise field
- Smooth, organic movement
- Cloud-like texture

**Best For**: Subtle, sophisticated backgrounds; professional use

---

### 11. Ripple Effect
**Color**: Sky Blue (#0ea5e9)

**Description**: Concentric ripples emanating from the center, like water disturbances, with additional mouse-triggered ripples.

**Features**:
- Continuous center ripples
- Mouse creates secondary ripple sources
- Exponential decay for natural fade
- Wave interference patterns
- Smooth animation

**Best For**: Calming effect; water theme lovers

---

### 12. Galaxy Swirl
**Color**: Fuchsia (#d946ef)

**Description**: A rotating spiral galaxy with twinkling stars and glowing arms.

**Features**:
- Spiral galaxy arm structure
- Procedurally generated stars
- Rotation animation
- Mouse influences rotation speed
- Core glow effect
- Star field overlay

**Best For**: Space enthusiasts; dramatic visual impact

---

## Technical Features (All Shaders)

### Common Capabilities:
1. **Center Dimming**: All shaders dim the central area to improve text readability
2. **Circular Masking**: Shaders only render inside the circular canvas
3. **Mouse Interaction**: Each shader responds to mouse position/movement
4. **State-Based Colors**: 
   - Default: Unique color palette per shader
   - Active Reminders: Blue tones
   - Upcoming Reminders: Green tones
5. **Performance Optimized**: GLSL shaders run on GPU for smooth 60fps animation

### Shader Uniforms:
- `iResolution`: Canvas resolution
- `iTime`: Animation time
- `iMouse`: Mouse position (normalized)
- `hasActiveReminders`: Boolean for active reminder state
- `hasUpcomingReminders`: Boolean for upcoming reminder state
- `disableCenterDimming`: Toggle center dimming effect

---

## Original Shaders (1-4)

### 1. Flowing Waves
**Color**: Indigo (#6366f1)
Flowing wave distortions creating a liquid, organic effect.

### 2. Ether
**Color**: Purple (#8b5cf6)
Ray-marched ethereal clouds by nimitz - complex 3D effect.

### 3. Shooting Stars
**Color**: Pink (#ec4899)
Streaking star trails across the screen.

### 4. Wavy Lines
**Color**: Emerald (#10b981)
Distorted horizontal lines with FBM noise.

---

## Usage in Application

Users can switch between all 12 shaders using the selector buttons on the right side of the screen. Each button shows:
- A live preview of the shader
- The shader name on hover
- Color-coded identification

The selected shader preference is saved to localStorage and persists across sessions.

---

## Implementation Notes

### File Structure:
- All shaders defined in: `/components/util/shaders.ts`
- Shader canvas component: `/components/ShaderCanvas.tsx`
- Shader selector UI: `/components/ShaderSelector.tsx`

### Adding New Shaders:
1. Create fragment shader string with `mainImage()` function
2. Add shader to `shaders` array with unique ID, name, and color
3. Shader automatically appears in selector

### Performance:
- All shaders use `precision mediump float` for optimal mobile performance
- GPU acceleration ensures smooth animation
- Circular masking reduces fragment processing
- Center dimming is conditional and optimized

---

## Credits

- **Ether Shader**: Created by nimitz (2014), used under CC BY-NC-SA 3.0 license
- **Other Shaders**: Custom implementations inspired by Shadertoy community techniques

---

## Future Enhancements

Potential additions:
- DNA helix spiral
- Matrix rain effect
- Perlin noise terrain
- Kaleidoscope patterns
- Fire/flame simulation
- Lightning bolts
- Geometric tessellations
- Mandelbrot/Julia sets
