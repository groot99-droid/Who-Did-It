/* global window */
// Viewer-side measures in the look page (fp_look.html: three 0.186.1, AgX at the area's wdi_exposure, 4x MSAA canvas),
// served by serve.py. They are the frame sweeps of the bedroom's independent check of 2026-11-16.
// In the page:  (0, eval)(await (await fetch('/r10_viewer.js')).text())   then  __r10.sweep(...)  /  __r10.regions(...)
// The eye points come from the room file: (await (await fetch('/rooms/<roomId>.json')).json()).browser.sweep_points
//   setSize(w, h)         resize the drawing buffer (pixel ratio 1) and the camera
//   count()               one frame: pixels under ink (luma < 19.65), below ink in every channel, luma < 10, < 5, black,
//                         magenta, lilac, the minimum luma
//   sweep(PTS, yaws, pit) frames from every eye point x heading x pitch; the totals, and which objects the under-ink pixels are on
//   regions(PTS, yaws, p) per frame an id/position pass; pools the display luma of pixels by world region (candle wall,
//                         far wall, moon patch, floor round it, dim floor) -> medians, p75; the regions are cut
//                         for the bedroom's 10 x 7 x 3 m shell
(() => {
  const V = window.__v;
  const THREE = V.THREE;
  const INK = [0x12, 0x14, 0x1c],
    INK_L = 0.2126 * INK[0] + 0.7152 * INK[1] + 0.0722 * INK[2];
  function setSize(w, h) {
    V.renderer.setPixelRatio(1);
    V.renderer.setSize(w, h, false);
    V.camera.aspect = w / h;
    V.camera.updateProjectionMatrix();
  }
  function count() {
    V.frameStats();
    const { px, w, h } = V._px;
    const r = {
      px: w * h,
      under: 0,
      below_all: 0,
      lt10: 0,
      lt5: 0,
      black: 0,
      magenta: 0,
      lilac: 0,
      min: 1e9,
    };
    for (let i = 0; i < w * h; i++) {
      const R = px[4 * i],
        G = px[4 * i + 1],
        B = px[4 * i + 2],
        l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      if (l < r.min) r.min = l;
      if (l < INK_L - 0.5) r.under++;
      if (R < INK[0] && G < INK[1] && B < INK[2]) r.below_all++;
      if (l < 10) r.lt10++;
      if (l < 5) r.lt5++;
      if (R === 0 && G === 0 && B === 0) r.black++;
      if (R > G + 25 && B > G + 25) r.magenta++;
      else if (R > G + 6 && B > G + 6) r.lilac++;
    }
    return r;
  }
  async function sweep(PTS, YAWS, PITCHES, objects = true) {
    const agg = {
      frames: 0,
      px: 0,
      under: 0,
      below_all: 0,
      lt10: 0,
      lt5: 0,
      black: 0,
      magenta: 0,
      lilac: 0,
      minL: 1e9,
      frames_under: 0,
      frames_below_all: 0,
      frames_lt10: 0,
      frames_black: 0,
      by: {},
      worst: [],
    };
    for (const p of PTS)
      for (const yaw of YAWS)
        for (const pitch of PITCHES) {
          V.walker(p[0], p[1], yaw, pitch);
          const c = count();
          agg.frames++;
          agg.px += c.px;
          agg.under += c.under;
          agg.below_all += c.below_all;
          agg.lt10 += c.lt10;
          agg.lt5 += c.lt5;
          agg.black += c.black;
          agg.magenta += c.magenta;
          agg.lilac += c.lilac;
          agg.minL = Math.min(agg.minL, c.min);
          if (c.under) agg.frames_under++;
          if (c.below_all) agg.frames_below_all++;
          if (c.lt10) agg.frames_lt10++;
          if (c.black) agg.frames_black++;
          if (objects && (c.under || c.lt10)) {
            const s = V.objectStats();
            for (const o of s.objects)
              if (o.under) {
                const e = agg.by[o.name] || (agg.by[o.name] = { under: 0, frames: 0, box: null });
                e.under += o.under;
                e.frames++;
                e.box = e.box || o.under_box;
              }
          }
          agg.worst.push({
            eye: p,
            yaw,
            pitch,
            under: c.under,
            below_all: c.below_all,
            lt10: c.lt10,
            black: c.black,
            min: +c.min.toFixed(1),
          });
        }
    agg.minL = +agg.minL.toFixed(1);
    agg.worst = agg.worst.sort((a, b) => b.under - a.under).slice(0, 10);
    agg.by = Object.fromEntries(
      Object.entries(agg.by)
        .sort((a, b) => b[1].under - a[1].under)
        .slice(0, 14),
    );
    return agg;
  }
  // world-position pass (no tone mapping, no MSAA): Blender metres per pixel; alpha 0 = background / glass
  let posRT = null;
  const posMats = new Map();
  function posPass() {
    const gl = V.renderer.getContext();
    const w = gl.drawingBufferWidth,
      h = gl.drawingBufferHeight;
    if (!posRT || posRT.width !== w || posRT.height !== h) {
      if (posRT) posRT.dispose();
      posRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, samples: 0 });
    }
    const saved = new Map();
    const bg = V.scene.background;
    V.scene.background = new THREE.Color(0, 0, 0);
    const tm = V.renderer.toneMapping;
    V.renderer.toneMapping = THREE.NoToneMapping;
    for (const m of V.meshes) {
      saved.set(m, { mat: m.material, vis: m.visible });
      if (m.userData.__glass) m.visible = false;
      if (!posMats.has(m))
        posMats.set(
          m,
          new THREE.ShaderMaterial({
            side: m.material.side,
            vertexShader:
              'varying vec3 vw; void main(){vec4 w=modelMatrix*vec4(position,1.0); vw=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}',
            fragmentShader: 'varying vec3 vw; void main(){gl_FragColor=vec4(vw,1.0);}',
          }),
        );
      m.material = posMats.get(m);
    }
    V.renderer.setRenderTarget(posRT);
    V.renderer.setClearColor(0x000000, 0);
    V.renderer.clear();
    V.renderer.render(V.scene, V.camera);
    const pos = new Float32Array(w * h * 4);
    V.renderer.readRenderTargetPixels(posRT, 0, 0, w, h, pos);
    V.renderer.setRenderTarget(null);
    for (const [m, s] of saved) {
      m.material = s.mat;
      m.visible = s.vis;
    }
    V.scene.background = bg;
    V.renderer.toneMapping = tm;
    return { pos, w, h };
  }
  function inPoly(poly, x, y) {
    let ins = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i],
        [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  function distPoly(poly, x, y) {
    // signed distance, positive inside
    let d = 1e9;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j],
        [bx, by] = poly[i];
      const vx = bx - ax,
        vy = by - ay,
        t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
      d = Math.min(d, Math.hypot(x - ax - t * vx, y - ay - t * vy));
    }
    return inPoly(poly, x, y) ? d : -d;
  }
  const NB = 1024,
    BW = 0.25; // histogram bins of 0.25 display-luma levels
  const newHist = () => new Float64Array(NB);
  const hq = (hst, q) => {
    let n = 0;
    for (let i = 0; i < NB; i++) n += hst[i];
    if (!n) return null;
    let c = 0;
    for (let i = 0; i < NB; i++) {
      c += hst[i];
      if (c >= q * n) return +((i + 0.5) * BW).toFixed(1);
    }
    return null;
  };
  const hn = (hst) => {
    let n = 0;
    for (let i = 0; i < NB; i++) n += hst[i];
    return n;
  };
  // pools display luma by world region over many frames (histograms). cfg: { flame:[x,y,z], patch:[[x,y]...] }
  async function regions(PTS, YAWS, PITCHES, cfg) {
    const keys = [
      'candle_wall',
      'far_wall_W',
      'far_wall_E',
      'far_wall_S',
      'moon_inner',
      'floor_round',
      'dim_floor',
      'floor_all',
      'ceiling',
      'wall_N_all',
    ];
    if (cfg.reset || !window.__r10H)
      window.__r10H = { frames: 0, H: Object.fromEntries(keys.map((k) => [k, newHist()])) };
    const H = window.__r10H.H;
    const f = cfg.flame,
      patch = cfg.patch;
    for (const p of PTS)
      for (const yaw of YAWS)
        for (const pitch of PITCHES) {
          V.walker(p[0], p[1], yaw, pitch);
          V.frameStats();
          const { px, w, h } = V._px;
          const { pos } = posPass();
          for (let i = 0; i < w * h; i += 1) {
            const A = pos[4 * i + 3];
            if (A === 0) continue;
            const X = pos[4 * i],
              Z = pos[4 * i + 1],
              Y = -pos[4 * i + 2]; // Blender x, z up, y
            const l = 0.2126 * px[4 * i] + 0.7152 * px[4 * i + 1] + 0.0722 * px[4 * i + 2];
            const bin = Math.min(NB - 1, (l / BW) | 0);
            if (Z > 2.9995) {
              H.ceiling[bin]++;
              continue;
            }
            if (Z < 0.002) {
              // floor
              if (Math.abs(X) > 4.999 || Math.abs(Y) > 3.499) continue;
              H.floor_all[bin]++;
              const sd = distPoly(patch, X, Y);
              if (sd > 0.06) H.moon_inner[bin]++;
              else if (sd < -0.25 && sd > -0.9) H.floor_round[bin]++;
              else if (sd < -0.9 && Math.hypot(X - f[0], Y - f[1]) > 3.0) H.dim_floor[bin]++;
              continue;
            }
            if (Z > 0.8 && Z < 2.3) {
              const wallN = Math.abs(Y - 3.5) < 0.002,
                wallE = Math.abs(X - 5) < 0.002,
                wallW = Math.abs(X + 5) < 0.002,
                wallS = Math.abs(Y + 3.5) < 0.002;
              if (!(wallN || wallE || wallW || wallS)) continue;
              const d = Math.hypot(X - f[0], Y - f[1], Z - f[2]);
              if (d < 2.0) H.candle_wall[bin]++;
              if (wallN) H.wall_N_all[bin]++;
              if (wallW && Z > 1.0) H.far_wall_W[bin]++;
              if (wallE && Z > 1.0) H.far_wall_E[bin]++;
              if (wallS && Z > 1.0) H.far_wall_S[bin]++;
            }
          }
          window.__r10H.frames++;
        }
    const out = { frames: window.__r10H.frames };
    for (const k of keys)
      out[k] = {
        n: hn(H[k]),
        median: hq(H[k], 0.5),
        p25: hq(H[k], 0.25),
        p75: hq(H[k], 0.75),
        p95: hq(H[k], 0.95),
      };
    return out;
  }
  // one frame summary (mean, p5, p95) + counts, for the named views
  function stills(views) {
    const out = {};
    for (const [name, [eye, target]] of Object.entries(views)) {
      V.look(eye, target);
      const f = V.frameStats();
      const c = count();
      out[name] = {
        mean: f.lum_mean,
        p5: f.p5,
        p50: f.p50,
        p95: f.p95,
        p95_over_p5: +(f.p95 / Math.max(f.p5, 1e-6)).toFixed(2),
        under: c.under,
        below_all: c.below_all,
        lt10: c.lt10,
        black: c.black,
        magenta: c.magenta,
        lilac: c.lilac,
        min: +c.min.toFixed(1),
        mean_rgb: f.mean_rgb,
      };
    }
    return out;
  }
  window.__r10 = { setSize, count, sweep, regions, posPass, stills, distPoly };
  return 'r10 ready';
})();
