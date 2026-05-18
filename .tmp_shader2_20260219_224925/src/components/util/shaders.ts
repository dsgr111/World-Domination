// Collection of shader programs for the app

// Shader 1: Original flowing waves shader
export const flowingWavesShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (2.0 * fragCoord - iResolution.xy) / min(iResolution.x, iResolution.y);

  // Calculate distance from center for dimming the center
  vec2 center = iResolution.xy * 0.5;
  float dist = distance(fragCoord, center);
  float radius = min(iResolution.x, iResolution.y) * 0.5;
  
  // Create a dimming factor for the center area (30% of the radius)
  float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);

  for(float i = 1.0; i < 10.0; i++){
    uv.x += 0.6 / i * cos(i * 2.5 * uv.y + iTime);
    uv.y += 0.6 / i * cos(i * 1.5 * uv.x + iTime);
  }
  
  // Determine color based on reminder state
  if (hasActiveReminders) {
    // Blue shade for active reminders
    fragColor = vec4(vec3(0.1, 0.3, 0.6) / abs(sin(iTime - uv.y - uv.x)), 1.0);
  } else if (hasUpcomingReminders) {
    // Green shade for upcoming reminders
    fragColor = vec4(vec3(0.1, 0.5, 0.2) / abs(sin(iTime - uv.y - uv.x)), 1.0);
  } else {
    // Original neutral color
    fragColor = vec4(vec3(0.1) / abs(sin(iTime - uv.y - uv.x)), 1.0);
  }
  
  // Apply center dimming only if not disabled
  if (!disableCenterDimming) {
    fragColor.rgb = mix(fragColor.rgb * 0.3, fragColor.rgb, centerDim);
  }
}

void main() {
  vec2 fragCoord = vTextureCoord * iResolution;
  
  // Calculate distance from center for circular mask
  vec2 center = iResolution * 0.5;
  float dist = distance(fragCoord, center);
  float radius = min(iResolution.x, iResolution.y) * 0.5;
  
  // Only render inside circle
  if (dist < radius) {
    vec4 color;
    mainImage(color, fragCoord);
    gl_FragColor = color;
  } else {
    discard;
  }
}
`;

// Shader 2: Ether by nimitz - replacing Spectral Flow
export const etherShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

// Ether by nimitz 2014 (twitter: @stormoid)
// https://www.shadertoy.com/view/MsjSW3
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License

#define t iTime
mat2 m(float a){float c=cos(a), s=sin(a);return mat2(c,-s,s,c);}
float map(vec3 p, bool isActive, bool isUpcoming){
    p.xz*= m(t*0.4);p.xy*= m(t*0.3);
    vec3 q = p*2.+t;
    return length(p+vec3(sin(t*0.7)))*log(length(p)+1.) + sin(q.x+sin(q.z+sin(q.y)))*0.5 - 1.;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Calculate aspect-corrected UV coordinates
    vec2 p = fragCoord.xy/min(iResolution.x, iResolution.y) - vec2(.9, .5);
    // Shift center for our circular viewport
    p.x += 0.4;
    
    vec3 cl = vec3(0.);
    float d = 2.5;
    
    // Ray marching loop
    for(int i=0; i<=5; i++) {
        vec3 p3d = vec3(0,0,5.) + normalize(vec3(p, -1.))*d;
        float rz = map(p3d, hasActiveReminders, hasUpcomingReminders);
        float f = clamp((rz - map(p3d+.1, hasActiveReminders, hasUpcomingReminders))*0.5, -.1, 1.);
        
        // Adjust colors based on reminder states
        vec3 baseColor;
        if(hasActiveReminders) {
            // Blue palette for active reminders
            baseColor = vec3(0.05, 0.2, 0.5) + vec3(4.0, 2.0, 5.0)*f;
        } else if(hasUpcomingReminders) {
            // Green palette for upcoming reminders
            baseColor = vec3(0.05, 0.3, 0.1) + vec3(2.0, 5.0, 1.0)*f;
        } else {
            // Original purple-blue palette
            baseColor = vec3(0.1, 0.3, 0.4) + vec3(5.0, 2.5, 3.0)*f;
        }
        
        cl = cl*baseColor + smoothstep(2.5, .0, rz)*.7*baseColor;
        d += min(rz, 1.);
    }
    
    // Add subtle mouse interaction
    float mouseInfluence = 0.0;
    if(iMouse.x > 0.0 || iMouse.y > 0.0) {
        vec2 mousePos = iMouse.xy;
        float mouseDist = length(p - (mousePos*2.0-vec2(1.0))*0.5);
        mouseInfluence = smoothstep(0.6, 0.0, mouseDist);
        
        // Add subtle glow around mouse
        if(hasActiveReminders) {
            cl += vec3(0.2, 0.4, 1.0) * mouseInfluence * 0.3;
        } else if(hasUpcomingReminders) {
            cl += vec3(0.2, 1.0, 0.4) * mouseInfluence * 0.3;
        } else {
            cl += vec3(0.5, 0.3, 0.7) * mouseInfluence * 0.3;
        }
    }
    
    // Calculate distance from center for dimming the center
    vec2 center = iResolution.xy * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    // Create a dimming factor for the center area (30% of the radius)
    float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);
    
    fragColor = vec4(cl, 1.0);
    
    // Apply center dimming only if not disabled
    if (!disableCenterDimming) {
        fragColor.rgb = mix(fragColor.rgb * 0.3, fragColor.rgb, centerDim);
    }
}

void main() {
    vec2 fragCoord = vTextureCoord * iResolution;
    
    // Calculate distance from center for circular mask
    vec2 center = iResolution * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    // Only render inside circle
    if (dist < radius) {
        vec4 color;
        mainImage(color, fragCoord);
        gl_FragColor = color;
    } else {
        discard;
    }
}
`;

// Shader 3: Shooting Stars
export const shootingStarsShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

void mainImage(out vec4 O, in vec2 fragCoord) {
  O = vec4(0.0, 0.0, 0.0, 1.0);
  vec2 b = vec2(0.0, 0.2);
  vec2 p;
  mat2 R = mat2(1.0, 0.0, 0.0, 1.0); // Initial identity matrix
  
  // Calculate distance from center for dimming the center
  vec2 center = iResolution.xy * 0.5;
  float dist = distance(fragCoord, center);
  float radius = min(iResolution.x, iResolution.y) * 0.5;
  
  // Create a dimming factor for the center area (30% of the radius)
  float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);
  
  // Using a proper GLSL loop structure
  for(int i = 0; i < 20; i++) {
    float fi = float(i) + 1.0; // Starting from 1.0
    
    // Create rotation matrix for this iteration
    float angle = fi + 0.0;
    float c = cos(angle);
    float s = sin(angle);
    R = mat2(c, -s, s, c);
    
    // Second rotation for effect
    float angle2 = fi + 33.0;
    float c2 = cos(angle2);
    float s2 = sin(angle2);
    mat2 R2 = mat2(c2, -s2, s2, c2);
    
    // Calculate position
    vec2 coord = fragCoord / iResolution.y * fi * 0.1 + iTime * b;
    vec2 frac_coord = fract(coord * R2) - 0.5;
    p = R * frac_coord;
    vec2 clamped_p = clamp(p, -b, b);
    
    // Calculate intensity and color
    float len = length(clamped_p - p);
    if (len > 0.0) {
      vec4 star = 1e-3 / len * (cos(p.y / 0.1 + vec4(0.0, 1.0, 2.0, 3.0)) + 1.0);
      O += star;
    }
  }
  
  // Adjust colors based on reminder state
  if (hasActiveReminders) {
    // Blue for active reminders
    O.rgb = mix(O.rgb, vec3(0.2, 0.4, 1.0), 0.3);
  } else if (hasUpcomingReminders) {
    // Green for upcoming reminders
    O.rgb = mix(O.rgb, vec3(0.2, 1.0, 0.4), 0.3);
  }
  
  // Apply center dimming only if not disabled
  if (!disableCenterDimming) {
    O.rgb = mix(O.rgb * 0.3, O.rgb, centerDim);
  }
}

void main() {
  vec2 fragCoord = vTextureCoord * iResolution;
  
  // Calculate distance from center for circular mask
  vec2 center = iResolution * 0.5;
  float dist = distance(fragCoord, center);
  float radius = min(iResolution.x, iResolution.y) * 0.5;
  
  // Only render inside circle
  if (dist < radius) {
    vec4 color;
    mainImage(color, fragCoord);
    gl_FragColor = color;
  } else {
    discard;
  }
}
`;

// Shader 4: Wavy Lines shader
export const wavyLinesShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

#define PI 3.14159265359

float hash(float n) {
    return fract(sin(n) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i.x + i.y * 57.0);
    float b = hash(i.x + 1.0 + i.y * 57.0);
    float c = hash(i.x + i.y * 57.0 + 1.0);
    float d = hash(i.x + 1.0 + i.y * 57.0 + 1.0);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 6; i++) {
        sum += amp * noise(p * freq);
        amp *= 0.5;
        freq *= 2.0;
    }
    return sum;
}

float lines(vec2 uv, float thickness, float distortion) {
    // Create wavy lines
    float y = uv.y;
    
    // Apply distortion based on fbm noise
    float distortionAmount = distortion * fbm(vec2(uv.x * 2.0, y * 0.5 + iTime * 0.1));
    y += distortionAmount;
    
    // Create lines with smooth step
    float linePattern = fract(y * 20.0);
    float line = smoothstep(0.5 - thickness, 0.5, linePattern) - 
                smoothstep(0.5, 0.5 + thickness, linePattern);
    
    return line;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    // Correct aspect ratio
    vec2 uv = fragCoord / iResolution.xy;
    float aspect = iResolution.x / iResolution.y;
    uv.x *= aspect;
    
    // Mouse interaction
    vec2 mousePos = iMouse.xy;
    mousePos.x *= aspect;
    float mouseDist = length(uv - mousePos);
    float mouseInfluence = smoothstep(0.5, 0.0, mouseDist);
    
    // Base thickness and distortion
    float baseThickness = 0.05;
    float baseDistortion = 0.2;
    
    // Adjust thickness and distortion based on mouse
    float thickness = mix(baseThickness, baseThickness * 1.5, mouseInfluence);
    float distortion = mix(baseDistortion, baseDistortion * 2.0, mouseInfluence);
    
    // Generate the wavy lines
    float line = lines(uv, thickness, distortion);
    
    // Add subtle movement over time
    float timeOffset = sin(iTime * 0.2) * 0.1;
    float animatedLine = lines(uv + vec2(timeOffset, 0.0), thickness, distortion);
    
    // Blend between static and animated lines
    line = mix(line, animatedLine, 0.3);
    
    // Default line colors based on reminder states
    vec3 backgroundColor = vec3(0.0, 0.0, 0.0);
    vec3 lineColor;
    
    if (hasActiveReminders) {
        // Blue for active reminders
        lineColor = vec3(0.2, 0.4, 1.0);
    } else if (hasUpcomingReminders) {
        // Green for upcoming reminders
        lineColor = vec3(0.2, 1.0, 0.4);
    } else {
        // White for default
        lineColor = vec3(1.0, 1.0, 1.0);
    }
    
    vec3 finalColor = mix(backgroundColor, lineColor, line);
    
    // Add subtle glow around mouse position
    if (hasActiveReminders) {
        finalColor += vec3(0.1, 0.2, 0.5) * mouseInfluence * line;
    } else if (hasUpcomingReminders) {
        finalColor += vec3(0.1, 0.5, 0.2) * mouseInfluence * line;
    } else {
        finalColor += vec3(0.1, 0.1, 0.1) * mouseInfluence * line;
    }
    
    fragColor = vec4(finalColor, 1.0);
    
    // Calculate distance from center for dimming the center
    vec2 center = iResolution.xy * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    // Create a dimming factor for the center area (30% of the radius)
    float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);
    
    // Apply center dimming only if not disabled
    if (!disableCenterDimming) {
        fragColor.rgb = mix(fragColor.rgb * 0.3, fragColor.rgb, centerDim);
    }
}

void main() {
    vec2 fragCoord = vTextureCoord * iResolution;
    
    // Calculate distance from center for circular mask
    vec2 center = iResolution * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    // Only render inside circle
    if (dist < radius) {
        vec4 color;
        mainImage(color, fragCoord);
        gl_FragColor = color;
    } else {
        discard;
    }
}
`;

// Shader 5: Plasma Flow
export const plasmaFlowShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / min(iResolution.x, iResolution.y);
    
    // Mouse influence
    vec2 mousePos = (iMouse.xy * 2.0 - iResolution.xy) / min(iResolution.x, iResolution.y);
    float mouseDist = length(uv - mousePos);
    float mouseInfluence = smoothstep(1.0, 0.0, mouseDist);
    
    // Plasma calculations
    float v = 0.0;
    v += sin((uv.x + iTime) * 3.0);
    v += sin((uv.y + iTime) * 3.0);
    v += sin((uv.x + uv.y + iTime) * 3.0);
    v += cos(length(uv + vec2(cos(iTime * 0.3), sin(iTime * 0.3))) * 4.0);
    v += mouseInfluence * 2.0;
    v *= 0.5;
    
    vec3 col;
    if (hasActiveReminders) {
        // Blue plasma
        col = vec3(
            sin(v * 3.14159),
            sin(v * 3.14159 + 2.0),
            sin(v * 3.14159 + 4.0) * 1.5
        ) * 0.5 + 0.5;
    } else if (hasUpcomingReminders) {
        // Green plasma
        col = vec3(
            sin(v * 3.14159 + 2.0),
            sin(v * 3.14159 + 4.0) * 1.5,
            sin(v * 3.14159)
        ) * 0.5 + 0.5;
    } else {
        // Rainbow plasma
        col = vec3(
            sin(v * 3.14159),
            sin(v * 3.14159 + 2.0),
            sin(v * 3.14159 + 4.0)
        ) * 0.5 + 0.5;
    }
    
    // Center dimming
    vec2 center = iResolution.xy * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);
    
    if (!disableCenterDimming) {
        col = mix(col * 0.3, col, centerDim);
    }
    
    fragColor = vec4(col, 1.0);
}

void main() {
    vec2 fragCoord = vTextureCoord * iResolution;
    vec2 center = iResolution * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    if (dist < radius) {
        vec4 color;
        mainImage(color, fragCoord);
        gl_FragColor = color;
    } else {
        discard;
    }
}
`;

// Shader 6: Particle Field
export const particleFieldShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 col = vec3(0.0);
    
    // Mouse interaction
    vec2 mousePos = iMouse.xy;
    
    // Multiple layers of particles
    for(float layer = 0.0; layer < 3.0; layer++) {
        float depth = 1.0 + layer * 0.5;
        vec2 grid = uv * 10.0 * depth;
        vec2 id = floor(grid);
        vec2 gv = fract(grid) - 0.5;
        
        // Particle position
        float t = iTime * (0.1 + layer * 0.05);
        vec2 offset = vec2(
            sin(hash21(id) * 6.28 + t),
            cos(hash21(id + 10.0) * 6.28 + t)
        ) * 0.3;
        
        float d = length(gv - offset);
        float size = 0.02 / depth;
        float brightness = smoothstep(size * 2.0, size, d);
        
        // Mouse influence
        vec2 particlePos = (id + 0.5 + offset) / (10.0 * depth);
        float mouseDist = length(particlePos - mousePos);
        float mouseEffect = smoothstep(0.3, 0.0, mouseDist);
        brightness += mouseEffect * 0.5;
        
        // Color based on state
        vec3 particleCol;
        if (hasActiveReminders) {
            particleCol = vec3(0.3, 0.5, 1.0);
        } else if (hasUpcomingReminders) {
            particleCol = vec3(0.3, 1.0, 0.5);
        } else {
            particleCol = vec3(0.8, 0.9, 1.0);
        }
        
        col += particleCol * brightness / depth;
    }
    
    // Center dimming
    vec2 center = iResolution.xy * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);
    
    if (!disableCenterDimming) {
        col = mix(col * 0.3, col, centerDim);
    }
    
    fragColor = vec4(col, 1.0);
}

void main() {
    vec2 fragCoord = vTextureCoord * iResolution;
    vec2 center = iResolution * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    if (dist < radius) {
        vec4 color;
        mainImage(color, fragCoord);
        gl_FragColor = color;
    } else {
        discard;
    }
}
`;

// Shader 7: Voronoi Cells
export const voronoiCellsShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

vec2 hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}

float voronoi(vec2 uv) {
    vec2 gv = fract(uv);
    vec2 id = floor(uv);
    
    float minDist = 1.0;
    
    for(float y = -1.0; y <= 1.0; y++) {
        for(float x = -1.0; x <= 1.0; x++) {
            vec2 offset = vec2(x, y);
            vec2 h = hash22(id + offset);
            h = 0.5 + 0.5 * sin(iTime * 0.5 + 6.28 * h);
            
            vec2 r = offset + h - gv;
            float d = dot(r, r);
            minDist = min(minDist, d);
        }
    }
    
    return minDist;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv = (uv - 0.5) * 2.0;
    uv.x *= iResolution.x / iResolution.y;
    
    // Mouse influence
    vec2 mousePos = (iMouse.xy / iResolution.xy - 0.5) * 2.0;
    mousePos.x *= iResolution.x / iResolution.y;
    float mouseDist = length(uv - mousePos);
    float mouseInfluence = smoothstep(0.8, 0.0, mouseDist);
    
    float scale = 4.0 + mouseInfluence * 2.0;
    float v = voronoi(uv * scale);
    
    vec3 col;
    if (hasActiveReminders) {
        col = vec3(0.1, 0.3, 0.8) * (1.0 - v) + vec3(0.2, 0.5, 1.0) * v;
    } else if (hasUpcomingReminders) {
        col = vec3(0.1, 0.8, 0.3) * (1.0 - v) + vec3(0.2, 1.0, 0.5) * v;
    } else {
        col = vec3(0.2, 0.3, 0.5) * (1.0 - v) + vec3(0.5, 0.6, 0.8) * v;
    }
    
    // Center dimming
    vec2 center = iResolution.xy * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);
    
    if (!disableCenterDimming) {
        col = mix(col * 0.3, col, centerDim);
    }
    
    fragColor = vec4(col, 1.0);
}

void main() {
    vec2 fragCoord = vTextureCoord * iResolution;
    vec2 center = iResolution * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    if (dist < radius) {
        vec4 color;
        mainImage(color, fragCoord);
        gl_FragColor = color;
    } else {
        discard;
    }
}
`;

// Shader 8: Aurora Waves
export const auroraWavesShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float a = noise(i);
    float b = noise(i + vec2(1.0, 0.0));
    float c = noise(i + vec2(0.0, 1.0));
    float d = noise(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for(int i = 0; i < 5; i++) {
        value += amplitude * smoothNoise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv = (uv - 0.5) * 2.0;
    uv.x *= iResolution.x / iResolution.y;
    
    // Mouse interaction
    vec2 mousePos = (iMouse.xy / iResolution.xy - 0.5) * 2.0;
    mousePos.x *= iResolution.x / iResolution.y;
    float mouseDist = length(uv - mousePos);
    float mouseInfluence = smoothstep(1.0, 0.0, mouseDist);
    
    // Aurora waves
    float wave1 = sin(uv.x * 2.0 + iTime + fbm(uv * 2.0 + iTime * 0.2)) * 0.5;
    float wave2 = sin(uv.x * 3.0 - iTime * 0.7 + fbm(uv * 1.5 - iTime * 0.15)) * 0.5;
    float wave3 = sin(uv.x * 4.0 + iTime * 0.5 + fbm(uv * 3.0 + iTime * 0.1)) * 0.5;
    
    // Add mouse disturbance
    wave1 += mouseInfluence * 0.3;
    wave2 += mouseInfluence * 0.2;
    wave3 += mouseInfluence * 0.4;
    
    float d1 = 1.0 - abs(uv.y - wave1);
    float d2 = 1.0 - abs(uv.y - wave2);
    float d3 = 1.0 - abs(uv.y - wave3);
    
    d1 = smoothstep(0.0, 0.5, d1);
    d2 = smoothstep(0.0, 0.5, d2);
    d3 = smoothstep(0.0, 0.5, d3);
    
    vec3 col;
    if (hasActiveReminders) {
        col = vec3(0.0, 0.3, 0.8) * d1 + vec3(0.2, 0.5, 1.0) * d2 + vec3(0.4, 0.7, 1.0) * d3;
    } else if (hasUpcomingReminders) {
        col = vec3(0.0, 0.8, 0.3) * d1 + vec3(0.2, 1.0, 0.5) * d2 + vec3(0.4, 1.0, 0.7) * d3;
    } else {
        col = vec3(0.0, 0.8, 0.4) * d1 + vec3(0.3, 0.6, 0.9) * d2 + vec3(0.6, 0.3, 0.8) * d3;
    }
    
    // Center dimming
    vec2 center = iResolution.xy * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);
    
    if (!disableCenterDimming) {
        col = mix(col * 0.3, col, centerDim);
    }
    
    fragColor = vec4(col, 1.0);
}

void main() {
    vec2 fragCoord = vTextureCoord * iResolution;
    vec2 center = iResolution * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    if (dist < radius) {
        vec4 color;
        mainImage(color, fragCoord);
        gl_FragColor = color;
    } else {
        discard;
    }
}
`;

// Shader 9: Tunnel Vision
export const tunnelVisionShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / min(iResolution.x, iResolution.y);
    
    // Mouse influence on rotation
    vec2 mousePos = (iMouse.xy - 0.5 * iResolution.xy) / min(iResolution.x, iResolution.y);
    float mouseDist = length(uv - mousePos);
    float mouseInfluence = smoothstep(1.0, 0.0, mouseDist);
    
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    
    // Tunnel effect with mouse-influenced rotation
    float tunnelDepth = iTime * 0.5 + mouseInfluence * 2.0;
    float spiral = a * 5.0 + tunnelDepth;
    float rings = log(r * 10.0) * 10.0 - tunnelDepth * 5.0;
    
    float pattern = sin(spiral) * sin(rings);
    pattern = pattern * 0.5 + 0.5;
    
    // Add radial gradient
    float fade = 1.0 / (1.0 + r * r * 2.0);
    
    vec3 col;
    if (hasActiveReminders) {
        col = mix(vec3(0.0, 0.1, 0.3), vec3(0.2, 0.5, 1.0), pattern) * fade;
    } else if (hasUpcomingReminders) {
        col = mix(vec3(0.0, 0.3, 0.1), vec3(0.2, 1.0, 0.5), pattern) * fade;
    } else {
        col = mix(vec3(0.1, 0.0, 0.2), vec3(0.5, 0.3, 0.8), pattern) * fade;
    }
    
    // Center dimming
    vec2 center = iResolution.xy * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);
    
    if (!disableCenterDimming) {
        col = mix(col * 0.3, col, centerDim);
    }
    
    fragColor = vec4(col, 1.0);
}

void main() {
    vec2 fragCoord = vTextureCoord * iResolution;
    vec2 center = iResolution * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    if (dist < radius) {
        vec4 color;
        mainImage(color, fragCoord);
        gl_FragColor = color;
    } else {
        discard;
    }
}
`;

// Shader 10: Fractal Noise
export const fractalNoiseShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    
    for(int i = 0; i < 6; i++) {
        value += amplitude * noise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    
    return value;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv = (uv - 0.5) * 2.0;
    uv.x *= iResolution.x / iResolution.y;
    
    // Mouse interaction
    vec2 mousePos = (iMouse.xy / iResolution.xy - 0.5) * 2.0;
    mousePos.x *= iResolution.x / iResolution.y;
    float mouseDist = length(uv - mousePos);
    float mouseInfluence = smoothstep(1.0, 0.0, mouseDist);
    
    // Animated fractal noise
    vec2 p = uv * 3.0;
    p += vec2(iTime * 0.1, iTime * 0.05);
    p += mousePos * mouseInfluence * 0.5;
    
    float n = fbm(p);
    float n2 = fbm(p + vec2(n, n) * 2.0 + iTime * 0.1);
    float n3 = fbm(p + vec2(n2, n2) * 2.0 - iTime * 0.05);
    
    float finalNoise = (n + n2 + n3) / 3.0;
    
    vec3 col;
    if (hasActiveReminders) {
        col = vec3(
            finalNoise * 0.3,
            finalNoise * 0.6,
            finalNoise * 1.2
        );
    } else if (hasUpcomingReminders) {
        col = vec3(
            finalNoise * 0.3,
            finalNoise * 1.2,
            finalNoise * 0.6
        );
    } else {
        col = vec3(
            finalNoise * 0.8,
            finalNoise * 0.9,
            finalNoise * 1.0
        );
    }
    
    // Center dimming
    vec2 center = iResolution.xy * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);
    
    if (!disableCenterDimming) {
        col = mix(col * 0.3, col, centerDim);
    }
    
    fragColor = vec4(col, 1.0);
}

void main() {
    vec2 fragCoord = vTextureCoord * iResolution;
    vec2 center = iResolution * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    if (dist < radius) {
        vec4 color;
        mainImage(color, fragCoord);
        gl_FragColor = color;
    } else {
        discard;
    }
}
`;

// Shader 11: Ripple Effect
export const rippleEffectShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    uv = (uv - 0.5) * 2.0;
    uv.x *= iResolution.x / iResolution.y;
    
    // Mouse position
    vec2 mousePos = (iMouse.xy / iResolution.xy - 0.5) * 2.0;
    mousePos.x *= iResolution.x / iResolution.y;
    
    // Create ripples from center
    float centerDist = length(uv);
    float ripple = sin(centerDist * 20.0 - iTime * 3.0) * 0.5 + 0.5;
    ripple *= exp(-centerDist * 1.5);
    
    // Mouse ripple
    float mouseDist = length(uv - mousePos);
    float mouseRipple = 0.0;
    if (iMouse.x > 0.0 || iMouse.y > 0.0) {
        mouseRipple = sin(mouseDist * 25.0 - iTime * 4.0) * 0.5 + 0.5;
        mouseRipple *= exp(-mouseDist * 2.0);
    }
    
    float finalRipple = ripple + mouseRipple * 0.5;
    
    vec3 col;
    if (hasActiveReminders) {
        col = vec3(0.1, 0.3, 0.7) + vec3(0.3, 0.5, 1.0) * finalRipple;
    } else if (hasUpcomingReminders) {
        col = vec3(0.1, 0.7, 0.3) + vec3(0.3, 1.0, 0.5) * finalRipple;
    } else {
        col = vec3(0.2, 0.4, 0.6) + vec3(0.5, 0.7, 0.9) * finalRipple;
    }
    
    // Center dimming
    vec2 center = iResolution.xy * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);
    
    if (!disableCenterDimming) {
        col = mix(col * 0.3, col, centerDim);
    }
    
    fragColor = vec4(col, 1.0);
}

void main() {
    vec2 fragCoord = vTextureCoord * iResolution;
    vec2 center = iResolution * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    if (dist < radius) {
        vec4 color;
        mainImage(color, fragCoord);
        gl_FragColor = color;
    } else {
        discard;
    }
}
`;

// Shader 12: Galaxy Swirl
export const galaxySwirlShader = `
precision mediump float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 iMouse;
uniform bool hasActiveReminders;
uniform bool hasUpcomingReminders;
uniform bool disableCenterDimming;
varying vec2 vTextureCoord;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / min(iResolution.x, iResolution.y);
    
    // Mouse influence on rotation speed
    vec2 mousePos = (iMouse.xy - 0.5 * iResolution.xy) / min(iResolution.x, iResolution.y);
    float mouseDist = length(uv - mousePos);
    float mouseInfluence = smoothstep(1.0, 0.0, mouseDist);
    
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    
    // Spiral galaxy arms
    float rotationSpeed = iTime * 0.3 + mouseInfluence * 1.0;
    float spiral = a + r * 5.0 - rotationSpeed;
    
    // Create spiral arms
    float arms = sin(spiral * 3.0) * 0.5 + 0.5;
    
    // Add stars
    vec2 starUV = uv * 10.0;
    vec2 starID = floor(starUV);
    float star = step(0.98, hash(starID));
    
    // Combine galaxy glow and stars
    float glow = exp(-r * 1.5) * arms;
    glow += star * 0.5;
    
    vec3 col;
    if (hasActiveReminders) {
        vec3 coreColor = vec3(0.2, 0.4, 1.0);
        vec3 armColor = vec3(0.4, 0.6, 1.0);
        col = mix(armColor, coreColor, glow) * glow;
        col += vec3(1.0) * star * 0.3;
    } else if (hasUpcomingReminders) {
        vec3 coreColor = vec3(0.2, 1.0, 0.4);
        vec3 armColor = vec3(0.4, 1.0, 0.6);
        col = mix(armColor, coreColor, glow) * glow;
        col += vec3(1.0) * star * 0.3;
    } else {
        vec3 coreColor = vec3(0.8, 0.6, 1.0);
        vec3 armColor = vec3(0.4, 0.5, 0.8);
        col = mix(armColor, coreColor, glow) * glow;
        col += vec3(1.0) * star * 0.3;
    }
    
    // Center dimming
    vec2 center = iResolution.xy * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    float centerDim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);
    
    if (!disableCenterDimming) {
        col = mix(col * 0.3, col, centerDim);
    }
    
    fragColor = vec4(col, 1.0);
}

void main() {
    vec2 fragCoord = vTextureCoord * iResolution;
    vec2 center = iResolution * 0.5;
    float dist = distance(fragCoord, center);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    
    if (dist < radius) {
        vec4 color;
        mainImage(color, fragCoord);
        gl_FragColor = color;
    } else {
        discard;
    }
}
`;

// Common vertex shader for all shaders
export const vertexShader = `
attribute vec4 aVertexPosition;
attribute vec2 aTextureCoord;
varying vec2 vTextureCoord;
void main() {
  gl_Position = aVertexPosition;
  vTextureCoord = aTextureCoord;
}
`;

// Shader collection for easy access
export const shaders = [
  {
    id: 1,
    name: "Flowing Waves",
    fragmentShader: flowingWavesShader,
    color: "#6366f1" // Indigo color
  },
  {
    id: 2,
    name: "Ether",
    fragmentShader: etherShader,
    color: "#8b5cf6" // Purple color
  },
  {
    id: 3,
    name: "Shooting Stars",
    fragmentShader: shootingStarsShader,
    color: "#ec4899" // Pink color
  },
  {
    id: 4,
    name: "Wavy Lines",
    fragmentShader: wavyLinesShader,
    color: "#10b981" // Emerald color
  },
  {
    id: 5,
    name: "Plasma Flow",
    fragmentShader: plasmaFlowShader,
    color: "#f59e0b" // Amber color
  },
  {
    id: 6,
    name: "Particle Field",
    fragmentShader: particleFieldShader,
    color: "#3b82f6" // Blue color
  },
  {
    id: 7,
    name: "Voronoi Cells",
    fragmentShader: voronoiCellsShader,
    color: "#06b6d4" // Cyan color
  },
  {
    id: 8,
    name: "Aurora Waves",
    fragmentShader: auroraWavesShader,
    color: "#14b8a6" // Teal color
  },
  {
    id: 9,
    name: "Tunnel Vision",
    fragmentShader: tunnelVisionShader,
    color: "#a855f7" // Purple-500 color
  },
  {
    id: 10,
    name: "Fractal Noise",
    fragmentShader: fractalNoiseShader,
    color: "#64748b" // Slate color
  },
  {
    id: 11,
    name: "Ripple Effect",
    fragmentShader: rippleEffectShader,
    color: "#0ea5e9" // Sky color
  },
  {
    id: 12,
    name: "Galaxy Swirl",
    fragmentShader: galaxySwirlShader,
    color: "#d946ef" // Fuchsia color
  }
];