import { BG, type FrameData, type LookParams, type Renderer } from './types';

/**
 * WebGL2 renderer.
 *
 *  1. Everything is accumulated into an off-screen buffer (half-float when available):
 *     – fade pass multiplies the previous content (trails, refresh-rate independent)
 *     – bonds ("living web") as instanced soft quads
 *     – particles as instanced quads with a sharp core and a gaussian halo, additive blending
 *  2. A composite pass maps the buffer to the screen:
 *     – dark canvas: emitted light over the ink background with a soft highlight roll-off
 *     – light canvas: ink on paper – the average ink colour laid over the paper by coverage
 *     plus vignette and dithering.
 */

const PARTICLE_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec2 a_pos;
layout(location=2) in float a_spc;
uniform vec2 u_world;
uniform float u_radius;
uniform vec3 u_colors[8];
out vec2 v_uv;
out vec3 v_col;
void main() {
  vec2 p = a_pos + a_corner * u_radius;
  vec2 c = p / u_world * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  v_uv = a_corner;
  v_col = u_colors[int(a_spc) & 7];
}`;

const PARTICLE_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec3 v_col;
uniform float u_core;
uniform float u_aa;
uniform float u_glow;
uniform float u_intensity;
out vec4 o;
void main() {
  float r2 = dot(v_uv, v_uv);
  if (r2 >= 1.0) discard;
  float r = sqrt(r2);
  float core = 1.0 - smoothstep(u_core - u_aa, u_core + u_aa, r);
  float halo = exp(-r2 * 7.0) * (1.0 - r2) * u_glow;
  float i = (core * 0.85 + halo * 0.5) * u_intensity;
  o = vec4(v_col * i, i);
}`;

const BOND_VS = `#version 300 es
layout(location=0) in vec2 a_q;
layout(location=1) in vec4 a_seg;
layout(location=2) in float a_w;
layout(location=3) in float a_sp;
uniform vec2 u_world;
uniform float u_width;
uniform vec3 u_colors[8];
out float v_across;
out vec3 v_col;
void main() {
  vec2 p1 = a_seg.xy;
  vec2 d = a_seg.zw - p1;
  float len = max(length(d), 1e-3);
  vec2 n = vec2(-d.y, d.x) / len;
  vec2 p = p1 + d * a_q.x + n * (a_q.y * u_width);
  vec2 c = p / u_world * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  int packed = int(a_sp + 0.5);
  int si = (packed >> 3) & 7;
  int sj = packed & 7;
  v_col = mix(u_colors[si], u_colors[sj], a_q.x) * a_w;
  v_across = a_q.y;
}`;

const BOND_FS = `#version 300 es
precision mediump float;
in float v_across;
in vec3 v_col;
uniform float u_alpha;
out vec4 o;
void main() {
  float a = 1.0 - abs(v_across);
  a *= a;
  o = vec4(v_col * a * u_alpha, a * u_alpha);
}`;

const FULL_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const SOLID_FS = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 o;
void main() { o = u_color; }`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_acc;
uniform vec3 u_bg;
uniform int u_light;
uniform float u_vignette;
uniform vec2 u_aspect;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 softclip(vec3 x) {
  const float k = 0.72;
  vec3 over = max(x - k, 0.0);
  return min(x, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}
void main() {
  vec3 a = max(texture(u_acc, v_uv).rgb, 0.0);
  vec3 col;
  if (u_light == 0) {
    vec3 e = softclip(a);
    col = u_bg + e * (1.0 - u_bg);
  } else {
    // ink on paper: average ink colour, coverage from the accumulated amount (never goes black)
    float amount = max(texture(u_acc, v_uv).a, 0.0);
    vec3 ink = a / max(amount, 1e-4);
    float t = 1.0 - exp(-amount * 1.6);
    col = mix(u_bg, ink, t * 0.92);
  }
  vec2 q = (v_uv - 0.5) * u_aspect;
  float v = smoothstep(0.42, 1.05, length(q));
  col *= 1.0 - v * u_vignette;
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader: ${log}`);
  }
  return s;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program: ${gl.getProgramInfoLog(p)}`);
  const cache = new Map<string, WebGLUniformLocation | null>();
  const u = (name: string) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
    return cache.get(name) ?? null;
  };
  return { p, u };
}

export class GLRenderer implements Renderer {
  readonly kind = 'webgl2' as const;
  private gl: WebGL2RenderingContext;
  private particle;
  private bond;
  private solid;
  private composite;
  private quadVao: WebGLVertexArrayObject;
  private bondVao: WebGLVertexArrayObject;
  private emptyVao: WebGLVertexArrayObject;
  private posBuf: WebGLBuffer;
  private spcBuf: WebGLBuffer;
  private bndBuf: WebGLBuffer;
  private fbo: WebGLFramebuffer | null = null;
  private tex: WebGLTexture | null = null;
  private floatTarget: boolean;
  private width = 1;
  private height = 1;
  private needsClear = true;
  private colorBuf = new Float32Array(24);
  private lastFrame: FrameData | null = null;
  lost = false;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 není k dispozici');
    this.gl = gl;
    this.floatTarget = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    this.particle = program(gl, PARTICLE_VS, PARTICLE_FS);
    this.bond = program(gl, BOND_VS, BOND_FS);
    this.solid = program(gl, FULL_VS, SOLID_FS);
    this.composite = program(gl, FULL_VS, COMPOSITE_FS);

    // particle quad + instanced attributes
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    const corner = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    this.spcBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spcBuf);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.UNSIGNED_BYTE, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    // bond quads
    this.bondVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.bondVao);
    const q = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, q);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.bndBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bndBuf);
    const stride = 6 * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(3, 1);

    this.emptyVao = gl.createVertexArray()!;
    gl.bindVertexArray(null);

    canvas.addEventListener('webglcontextlost', this.onLost);
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };

  resize(width: number, height: number): void {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (width === this.width && height === this.height && this.tex) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const tryFormat = (internal: number, type: number) => {
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    };
    if (!(this.floatTarget && tryFormat(gl.RGBA16F, gl.HALF_FLOAT))) {
      this.floatTarget = false;
      if (this.fbo) gl.deleteFramebuffer(this.fbo);
      tryFormat(gl.RGBA8, gl.UNSIGNED_BYTE);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.needsClear = true;
  }

  clear(): void {
    this.needsClear = true;
  }

  private setColors(look: LookParams): void {
    const c = this.colorBuf;
    c.fill(0);
    look.colors.forEach((rgb, i) => {
      if (i >= 8) return;
      for (let k = 0; k < 3; k++) {
        const v = rgb[k] / 255;
        c[i * 3 + k] = v;
      }
    });
  }

  draw(frame: FrameData | null, look: LookParams, dtMs: number): void {
    if (this.lost || !this.fbo) return;
    const gl = this.gl;
    if (frame) this.lastFrame = frame;
    const f = this.lastFrame;
    this.setColors(look);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.BLEND);

    // 1) fade / clear
    const persist = look.trails <= 0.001 ? 0 : Math.pow(Math.min(0.97, look.trails * 0.95), Math.min(4, dtMs / (1000 / 60)));
    if (this.needsClear || persist === 0) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.needsClear = false;
    } else {
      gl.useProgram(this.solid.p);
      gl.bindVertexArray(this.emptyVao);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, persist);
      gl.uniform4f(this.solid.u('u_color'), 0, 0, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!this.floatTarget) {
        // 8-bit target: remove the last quantisation step that the multiply cannot
        gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.uniform4f(this.solid.u('u_color'), 1.5 / 255, 1.5 / 255, 1.5 / 255, 1.5 / 255);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.blendEquation(gl.FUNC_ADD);
      }
    }

    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);

    if (f && f.n > 0) {
      const bloom = look.bloom;
      // trails accumulate energy, so draw each frame a bit dimmer when trails are long
      const trailComp = persist > 0 ? 1 - persist * 0.55 : 1;

      // 2) bonds
      if (look.bonds && f.bondN > 0) {
        gl.useProgram(this.bond.p);
        gl.bindVertexArray(this.bondVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bndBuf);
        gl.bufferData(gl.ARRAY_BUFFER, f.bnd.subarray(0, f.bondN * 6), gl.STREAM_DRAW);
        gl.uniform2f(this.bond.u('u_world'), f.w, f.h);
        gl.uniform1f(this.bond.u('u_width'), 1.3 * Math.max(1, f.w / this.width));
        gl.uniform3fv(this.bond.u('u_colors'), this.colorBuf);
        gl.uniform1f(this.bond.u('u_alpha'), (look.theme === 'dark' ? 0.34 : 0.22) * bloom * trailComp);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, f.bondN);
      }

      // 3) particles
      gl.useProgram(this.particle.p);
      gl.bindVertexArray(this.quadVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, f.pos.subarray(0, f.n * 2), gl.STREAM_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.spcBuf);
      gl.bufferData(gl.ARRAY_BUFFER, f.spc.subarray(0, f.n), gl.STREAM_DRAW);
      const pxPerUnit = this.width / f.w;
      const radius = 9 * look.size * (0.55 + 0.45 * bloom) * (0.5 + 0.5 * Math.min(1.4, look.glow + 0.35));
      const coreUv = Math.min(0.9, (2.6 * look.size) / radius);
      gl.uniform2f(this.particle.u('u_world'), f.w, f.h);
      gl.uniform1f(this.particle.u('u_radius'), radius);
      gl.uniform3fv(this.particle.u('u_colors'), this.colorBuf);
      gl.uniform1f(this.particle.u('u_core'), coreUv);
      gl.uniform1f(this.particle.u('u_aa'), Math.max(0.02, 1.1 / (radius * pxPerUnit)));
      gl.uniform1f(this.particle.u('u_glow'), look.glow);
      gl.uniform1f(this.particle.u('u_intensity'), (0.35 + 0.65 * bloom) * trailComp);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, f.n);
    }

    // 4) composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.composite.p);
    gl.bindVertexArray(this.emptyVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.composite.u('u_acc'), 0);
    const bg = BG[look.theme];
    gl.uniform3f(this.composite.u('u_bg'), bg[0] / 255, bg[1] / 255, bg[2] / 255);
    gl.uniform1i(this.composite.u('u_light'), look.theme === 'light' ? 1 : 0);
    gl.uniform1f(this.composite.u('u_vignette'), look.vignette ? (look.theme === 'dark' ? 0.5 : 0.1) : 0);
    const ar = this.width / this.height;
    gl.uniform2f(this.composite.u('u_aspect'), ar > 1 ? 1 : ar, ar > 1 ? 1 / ar : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  capture(maxWidth = Infinity): HTMLCanvasElement {
    // must be called synchronously right after draw() (drawing buffer is not preserved)
    const scale = Math.min(1, maxWidth / this.width);
    const out = document.createElement('canvas');
    out.width = Math.round(this.width * scale);
    out.height = Math.round(this.height * scale);
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.canvas, 0, 0, out.width, out.height);
    return out;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
