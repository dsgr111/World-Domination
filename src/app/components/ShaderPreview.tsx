import { useEffect, useRef } from "react";
import { shaderThemes, vertexShader } from "./shaderThemes";

const FALLBACK_PREVIEW_SHADER = shaderThemes[0]?.fragmentShader ?? "";

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

type ShaderPreviewProps = {
  fragmentShader: string;
  className?: string;
};

export function ShaderPreview({ fragmentShader, className }: ShaderPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true });
    if (!gl) return undefined;

    let programInfo = initProgram(gl, vertexShader, fragmentShader);
    if (!programInfo && FALLBACK_PREVIEW_SHADER && FALLBACK_PREVIEW_SHADER !== fragmentShader) {
      programInfo = initProgram(gl, vertexShader, FALLBACK_PREVIEW_SHADER);
    }
    if (!programInfo) return undefined;
    const buffers = initBuffers(gl);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const startTime = performance.now();
    const render = () => {
      const currentTime = (performance.now() - startTime) / 1000;
      drawScene(gl, programInfo, buffers, currentTime, canvas.width, canvas.height);
      frameRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      ro.disconnect();
      gl.deleteProgram(programInfo.program);
    };
  }, [fragmentShader]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
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
    console.error("Shader preview link failed:", gl.getProgramInfoLog(program));
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
    console.error("Shader preview compile failed:", gl.getShaderInfoLog(shader));
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
  height: number
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
    gl.uniform2f(programInfo.uniformLocations.iMouse, 0.5, 0.5);
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
