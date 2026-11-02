// Sound as a ring of bars inside a face, drawn with WebGL.

export type MusicVisual = { level: () => number; playing: () => boolean };
// Sound as a ring of 48 bars inside a face, the way a player's visualizer
// draws it: each bar grows from the rim inward with the beat, as loud as the
// volume says. There is no audio to listen to: the beat is kept in time (120
// a minute) and the bars drift on their own. WebGL draws it; without WebGL,
// or with reduced motion, one still frame. Returns the stop.
export function musicVisual(canvas: HTMLCanvasElement, o: MusicVisual) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return () => {};
  const N = 48;
  const compile = (type: number, src: string) => { const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 v; void main(){ v = p; gl_Position = vec4(p, 0., 1.); }'));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, `precision mediump float; varying vec2 v; uniform float bars[${N}];
    void main(){
      float r = length(v); float a = atan(v.x, v.y); if (a < 0.) a += 6.28318;
      float slot = a / 6.28318 * ${N}.; int i = int(floor(slot));
      float h = 0.; for (int k = 0; k < ${N}; k++) { if (k == i) h = bars[k]; }
      float w = fract(slot); float edge = smoothstep(0.12, 0.3, w) * smoothstep(0.12, 0.3, 1. - w);
      float r1 = 0.985, r0 = r1 - 0.2 * h;
      float inBar = smoothstep(r0 - 0.008, r0 + 0.008, r) * (1. - smoothstep(r1 - 0.01, r1, r));
      float alpha = inBar * edge * (0.3 + 0.6 * h);
      gl_FragColor = vec4(vec3(alpha), alpha);
    }`));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
  const loc = gl.getUniformLocation(prog, 'bars[0]');
  const bars = new Float32Array(N), cur = new Float32Array(N);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame = 0, stopped = false;
  // Behind the current view (Zumly keeps it, blurred) or in a hidden tab the bars wait.
  const shown = () => !document.hidden && !!canvas.closest('.is-current-view, .is-new-current-view, [data-visual-live]');
  const draw = (t: number) => {
    if (stopped) return;
    if (!shown()) { setTimeout(() => { if (!stopped) frame = requestAnimationFrame(draw); }, 300); return; }
    const w = Math.round(canvas.clientWidth * devicePixelRatio), h = Math.round(canvas.clientHeight * devicePixelRatio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    const lvl = Math.min(1, Math.max(0, o.level())), on = o.playing();
    const beat = on ? Math.pow(1 - ((t / 500) % 1), 2) : 0;          // 120 a minute
    for (let i = 0; i < N; i++) {
      const drift = 0.5 + 0.5 * Math.sin(i * 1.7 + t / 1000 * (1.2 + (i % 5) * 0.25));
      const amp = 0.3 + 0.7 * lvl;
      const target = on ? amp * (0.15 + 0.85 * drift * (0.5 + 0.5 * beat)) : amp * 0.12;
      cur[i] += (target - cur[i]) * (still ? 1 : 0.22);
      bars[i] = cur[i];
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1fv(loc, bars);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!still) frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return () => { stopped = true; cancelAnimationFrame(frame); };
}
