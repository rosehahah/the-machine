// WebGL pass for the MPOV image treatment: grade, vignette, grain, scanlines, chromatic aberration, glitch.
export class FX {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = canvas.getContext("webgl", { premultipliedAlpha: false, antialias: false }));
    if (!gl) throw new Error("WebGL unavailable");
    const vs = `attribute vec2 p; varying vec2 uv;
      void main(){ uv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;
    const fs = `precision mediump float;
      varying vec2 uv; uniform sampler2D tex; uniform float t, glitch, enabled; uniform vec2 res;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      vec3 grade(vec3 c){
        float l = dot(c, vec3(.299,.587,.114));
        c = mix(vec3(l), c, .42);                       // desaturate
        c = (c - .5) * 1.18 + .5;                       // contrast
        c *= vec3(.90, 1.0, 1.10);                      // cool cast
        c = mix(c, c*c*(3.-2.*c), .25);                 // soft s-curve
        c += vec3(.0,.01,.03) * (1.-l);                 // blue shadows
        return clamp(c, 0., 1.);
      }
      void main(){
        vec2 q = uv;
        if (enabled < .5) { gl_FragColor = vec4(texture2D(tex, q).rgb, 1.); return; }
        // glitch: horizontal band tearing
        float band = floor(q.y * 24. + floor(t*30.));
        float g = glitch * step(.72, h(vec2(band, floor(t*60.))));
        q.x += g * (h(vec2(band, 3.)) - .5) * .12;
        // chromatic aberration, stronger toward the edges
        vec2 d = (q - .5);
        float ca = .0018 + dot(d,d) * .010 + glitch * .012;
        vec3 c = vec3(texture2D(tex, q + d*ca*4.).r, texture2D(tex, q).g, texture2D(tex, q - d*ca*4.).b);
        c = grade(c);
        // vignette
        float v = smoothstep(.95, .25, length(d * vec2(1.0, 1.15)));
        c *= mix(.42, 1., v);
        // grain
        c += (h(q * res + fract(t) * 91.7) - .5) * .085;
        // scanlines
        c *= .93 + .07 * sin(q.y * res.y * 1.6);
        // rolling brightness band
        c *= 1. + .025 * smoothstep(.0, .06, .06 - abs(fract(q.y - t*.07) - .5));
        gl_FragColor = vec4(c, 1.);
      }`;
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(prog, s);
    }
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = Object.fromEntries(["t", "glitch", "enabled", "res"].map((n) => [n, gl.getUniformLocation(prog, n)]));
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.hasFrame = false;
    this.enabled = true;
  }

  upload(bitmap) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, bitmap);
    this.hasFrame = true;
  }

  // rect = where the 16:9 frame sits inside the canvas, in device pixels
  render(rect, t, glitch) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.01, 0.015, 0.025, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.hasFrame) return;
    gl.viewport(rect.x, this.canvas.height - rect.y - rect.h, rect.w, rect.h);
    gl.uniform1f(this.u.t, t);
    gl.uniform1f(this.u.glitch, glitch);
    gl.uniform1f(this.u.enabled, this.enabled ? 1 : 0);
    gl.uniform2f(this.u.res, rect.w, rect.h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
