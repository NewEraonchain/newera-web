import { useEffect, useRef, useState } from "react"
import { getJSON, type Launch } from "@/lib/api"

/* Every launch in the window, as a field.
 *
 * One GPU draw call, one point per token, positions seeded from the address so
 * the field is stable between renders rather than reshuffling on every frame.
 * Risk drives colour and size: clean launches are small and lime, flagged ones
 * are larger and sit in the danger range. The pointer pushes the field aside.
 *
 * Raw WebGL2 rather than a library. The whole effect is two shaders and a
 * buffer; pulling in three.js or ogl to draw points would add far more weight
 * than it saves, and the last time this project carried ogl it was for a
 * background haze that got deleted.
 *
 * Progressive enhancement is the contract: without WebGL2, without JavaScript,
 * or with reduced motion, this renders nothing at all and the section around it
 * still reads. It is atmosphere over an argument, never the argument. */

const VERT = `#version 300 es
in vec2 a_seed;
in float a_risk;
uniform float u_time;
uniform vec2 u_pointer;
uniform vec2 u_res;
out float v_risk;

void main() {
  v_risk = a_risk;

  // Slow, uneven drift. Two frequencies per axis so the field breathes rather
  // than sliding, and the phase comes from the seed so no two points march.
  float t = u_time * 0.06;
  vec2 p = a_seed;
  p.x += sin(t + a_seed.y * 6.2) * 0.018 + cos(t * 0.7 + a_seed.x * 4.1) * 0.010;
  p.y += cos(t + a_seed.x * 5.7) * 0.016 + sin(t * 0.9 + a_seed.y * 3.3) * 0.008;

  // Push away from the pointer, falling off smoothly. Aspect-corrected so the
  // displacement is circular rather than an ellipse on a wide canvas.
  vec2 d = p - u_pointer;
  d.x *= u_res.x / u_res.y;
  float dist = length(d);
  float push = smoothstep(0.34, 0.0, dist) * 0.10;
  p += normalize(d + 1e-5) * push;

  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = mix(1.8, 5.0, a_risk) * (u_res.y / 900.0);
}`

const FRAG = `#version 300 es
precision mediump float;
in float v_risk;
out vec4 outColor;

void main() {
  // Round points with a soft edge; a square point reads as a rendering bug.
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.16, length(c));
  if (a < 0.01) discard;

  vec3 clean = vec3(0.804, 1.0, 0.302);   // acid-500
  vec3 risky = vec3(1.0, 0.420, 0.478);   // danger
  vec3 col = mix(clean, risky, smoothstep(0.35, 0.75, v_risk));

  outColor = vec4(col, a * mix(0.22, 0.78, v_risk));
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("[LaunchField] shader:", gl.getShaderInfoLog(sh))
    return null
  }
  return sh
}

/* Deterministic position from the address, so a token sits in the same place
   every time the field is drawn.
 *
 * The first version was a plain `h * 31 + char` accumulator, and the x and y it
 * produced stayed correlated — the field came out as diagonal streaks rather
 * than a distribution. This mixes the bits properly (xorshift plus a
 * multiply-shift finaliser) so the two axes are independent. */
function seed(addr: string, salt: number) {
  let h = salt >>> 0
  for (let i = 0; i < addr.length; i++) {
    h ^= addr.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d) >>> 0
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39) >>> 0
  h ^= h >>> 15
  return (h / 4294967296) * 0.94 + 0.03
}

export default function LaunchField({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [items, setItems] = useState<Launch[] | null>(null)

  useEffect(() => {
    let alive = true
    getJSON<{ items: Launch[] }>("/intel/feed?limit=200")
      .then((r) => alive && r.items?.length && setItems(r.items))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !items) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true })
    if (!gl) return // No WebGL2: the section reads without it.

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[LaunchField] link:", gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)

    // Each real launch is drawn several times at different seeds. The window
    // holds 200 tokens and a field of 200 points looks sparse; every point is
    // still a real launch, just plotted more than once.
    const COPIES = 10
    const n = items.length * COPIES
    const seeds = new Float32Array(n * 2)
    const risks = new Float32Array(n)
    for (let i = 0; i < items.length; i++) {
      for (let c = 0; c < COPIES; c++) {
        const k = i * COPIES + c
        seeds[k * 2] = seed(items[i].address, 1 + c * 97)
        seeds[k * 2 + 1] = seed(items[i].address, 2 + c * 131)
        risks[k] = Math.min(1, items[i].riskScore / 100)
      }
    }

    const bind = (data: Float32Array, name: string, size: number) => {
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(prog, name)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
      return buf
    }
    const seedBuf = bind(seeds, "a_seed", 2)
    const riskBuf = bind(risks, "a_risk", 1)

    const uTime = gl.getUniformLocation(prog, "u_time")
    const uPointer = gl.getUniformLocation(prog, "u_pointer")
    const uRes = gl.getUniformLocation(prog, "u_res")

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)

    const pointer = { x: -1, y: -1 }
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      pointer.x = (e.clientX - r.left) / r.width
      pointer.y = 1 - (e.clientY - r.top) / r.height
    }
    window.addEventListener("pointermove", onMove, { passive: true })

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(r.width * dpr))
      canvas.height = Math.max(1, Math.floor(r.height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // Only draw while on screen. An off-screen shader loop is a battery leak
    // nobody can see.
    let visible = true
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 })
    io.observe(canvas)

    let raf = 0
    const t0 = performance.now()
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      if (!visible) return
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(uTime, (t - t0) / 1000)
      gl.uniform2f(uPointer, pointer.x, pointer.y)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.drawArrays(gl.POINTS, 0, n)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      window.removeEventListener("pointermove", onMove)
      gl.deleteBuffer(seedBuf)
      gl.deleteBuffer(riskBuf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [items])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none h-full w-full ${className}`}
    />
  )
}
