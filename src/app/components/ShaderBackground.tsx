import { useEffect, useMemo, useRef, useState } from "react";
import { getTheme } from "../lib/theme";
import { shaderThemes, vertexShader, type ShaderThemeId } from "./shaderThemes";

const THEME_TO_SHADER = new Map<ShaderThemeId, string>(
  shaderThemes.map((theme) => [theme.id, theme.fragmentShader])
);

type ProgramInfo = {
  program: WebGLProgram;
  attribLocations: {
    vertexPosition: number;
    textureCoord: number;
  };
  uniformLocations: {
    iResolution: WebGLUniformLocation | null;
    iTime: WebGLUniformLocation | null;
    iMouse: WebGLUniformLocation | null;
    hasActiveReminders: WebGLUniformLocation | null;
    hasUpcomingReminders: WebGLUniformLocation | null;
    disableCenterDimming: WebGLUniformLocation | null;
  };
};

export function ShaderBackground() {
  const [themeId, setThemeId] = useState(() => getTheme());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const mouseRef = useRef<[number, number]>([0.5, 0.5]);

  const fragmentShader = useMemo(() => {
    const shader = THEME_TO_SHADER.get(themeId as ShaderThemeId);
    return shader ?? null;
  }, [themeId]);

  useEffect(() => {
    const handleTheme = () => setThemeId(getTheme());
    window.addEventListener("wd:theme-change", handleTheme as EventListener);
    window.addEventListener("storage", handleTheme);
    const observer = new MutationObserver(handleTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("wd:theme-change", handleTheme as EventListener);
      window.removeEventListener("storage", handleTheme);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!fragmentShader) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const gl = canvas.getContext("webgl", { alpha: true });
    if (!gl) return undefined;

    let programInfo = initProgram(gl, vertexShader, fragmentShader);
    if (!programInfo) {
      const fallbackShader = THEME_TO_SHADER.get("shader-waves");
      if (fallbackShader && fallbackShader !== fragmentShader) {
        programInfo = initProgram(gl, vertexShader, fallbackShader);
      }
    }
    if (!programInfo) return undefined;
    const buffers = initBuffers(gl);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(window.innerWidth, 1);
      const height = Math.max(window.innerHeight, 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    let startTime = Date.now();
    const render = () => {
      const currentTime = (Date.now() - startTime) / 1000;
      drawScene(gl, programInfo, buffers, currentTime, canvas.width, canvas.height, mouseRef.current);
      animationRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener("resize", resize);
      gl.deleteProgram(programInfo.program);
    };
  }, [fragmentShader]);

  useEffect(() => {
    if (!fragmentShader) return;
    const handleMove = (event: MouseEvent) => {
      const x = Math.min(1, Math.max(0, event.clientX / window.innerWidth));
      const y = Math.min(1, Math.max(0, 1 - event.clientY / window.innerHeight));
      mouseRef.current = [x, y];
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [fragmentShader]);

  if (!fragmentShader) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
    />
  );
}

function initProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  const vertex = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragment = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Shader program link failed:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return {
    program,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(program, "aVertexPosition"),
      textureCoord: gl.getAttribLocation(program, "aTextureCoord"),
    },
    uniformLocations: {
      iResolution: gl.getUniformLocation(program, "iResolution"),
      iTime: gl.getUniformLocation(program, "iTime"),
      iMouse: gl.getUniformLocation(program, "iMouse"),
      hasActiveReminders: gl.getUniformLocation(program, "hasActiveReminders"),
      hasUpcomingReminders: gl.getUniformLocation(program, "hasUpcomingReminders"),
      disableCenterDimming: gl.getUniformLocation(program, "disableCenterDimming"),
    },
  };
}

function loadShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function initBuffers(gl: WebGLRenderingContext) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  const positions = [-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const textureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  const textureCoordinates = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  const indices = [0, 1, 2, 0, 2, 3];
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  return { position: positionBuffer, textureCoord: textureCoordBuffer, indices: indexBuffer };
}

function drawScene(
  gl: WebGLRenderingContext,
  programInfo: ProgramInfo,
  buffers: { position: WebGLBuffer | null; textureCoord: WebGLBuffer | null; indices: WebGLBuffer | null },
  currentTime: number,
  width: number,
  height: number,
  mousePos: [number, number]
) {
  gl.clearColor(0, 0, 0, 0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(programInfo.program);
  if (programInfo.uniformLocations.iResolution) {
    gl.uniform2f(programInfo.uniformLocations.iResolution, width, height);
  }
  if (programInfo.uniformLocations.iTime) {
    gl.uniform1f(programInfo.uniformLocations.iTime, currentTime);
  }
  if (programInfo.uniformLocations.iMouse) {
    gl.uniform2f(programInfo.uniformLocations.iMouse, mousePos[0], mousePos[1]);
  }
  if (programInfo.uniformLocations.hasActiveReminders) {
    gl.uniform1i(programInfo.uniformLocations.hasActiveReminders, 0);
  }
  if (programInfo.uniformLocations.hasUpcomingReminders) {
    gl.uniform1i(programInfo.uniformLocations.hasUpcomingReminders, 0);
  }
  if (programInfo.uniformLocations.disableCenterDimming) {
    gl.uniform1i(programInfo.uniformLocations.disableCenterDimming, 1);
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
  gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
  gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}
