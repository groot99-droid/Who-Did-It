/* global window */
// The runs made on r7_walk.html (window.__w, the walk viewer's own controller and collider), kept so they can be
// re-run. In the page:  (0, eval)(await (await fetch('/r7_walk_run.js')).text());  then  __wr.<step>()  and poll
// __wr.state.<step> (each step runs without waiting; the two sweeps take 2 to 5 minutes in a hidden pane).
// Results are saved by serve.py into its --out folder. Still the bedroom's own here: the tile grid, the wall lines
// and the lattice of rest(). nook() walks into a dead end the first layout had by wardrobe_body; it was not run on
// the layout of 2026-11-16 (bed_north), where its starts lie in or against the bed.
(() => {
  const T = window.__w;
  const state = {};
  const run = (key, fn) => {
    state[key] = 'running';
    fn()
      .then((r) => {
        state[key] = r === undefined ? 'done' : r;
      })
      .catch((e) => {
        state[key] = { error: String((e && e.stack) || e) };
      });
    return key;
  };
  const GRID = [
    '############',
    '#H.#..#...B#',
    '#..........#',
    '#......#H.##',
    '#.......#..#',
    '#..........#',
    '#..........#',
    '#..S.......#',
    '###D########',
  ];
  const rng = (a, b, s = 0.05) => {
    const o = [];
    for (let v = a; v <= b + 1e-9; v += s) o.push(+v.toFixed(3));
    return o;
  };
  window.__wr = {
    state,
    // the portal: arrive disarmed, use within 2 m, walk off north, come back; and one walk each way from the spawn
    portal: () =>
      run('portal', async () => {
        const r = {
          portal: T.portalTest(),
          north: T.walk([-2.5, -3.0], [0, 1], 2, false),
          south: T.walk([-2.5, -3.0], [0, -1], 2, true),
        };
        await T.save('walk_portal.json', r);
        return r;
      }),
    // 1. 2,704 walks (169 reachable starts on a 0.5 m lattice x 16 directions x 3 s at run speed): feet height, the room's
    //    bounds, every position against cc_geom's reach grid, the scene tiles stood on
    sweep: () =>
      run('sweep', async () => {
        const s = await T.sweep(0.5, 16, 3, true);
        const walkable = [];
        for (let y = 0; y < 9; y++)
          for (let x = 0; x < 12; x++) if ('.S'.includes(GRID[y][x])) walkable.push(x + ',' + y);
        const stood = Object.keys(s.tiles);
        s.walkable_tiles = walkable.length;
        s.walkable_never_stood_on = walkable.filter((t) => !stood.includes(t));
        s.walkable_stood_on = walkable.filter((t) => stood.includes(t)).length;
        s.non_walkable_stood_on = stood
          .filter((t) => !walkable.includes(t))
          .map((t) => [t, GRID[+t.split(',')[1]][+t.split(',')[0]], s.tiles[t]]);
        await T.save('walk_sweep_run.json', s);
        return { ...s, tiles: undefined };
      }),
    // 2. where walks come to rest against collision (289 starts on a 0.4 m lattice x 16 directions x 2.6 s at run speed):
    //    how far the visible meshes reach into the capsule, how far short of them the capsule stops, the eye's clearance
    rest: () =>
      run('rest', async () => {
        const res = {
          walks: 0,
          rest: 0,
          min_capsule_to_visible: 9,
          worst_into: null,
          min_eye_to_visible: 9,
          worst_eye: null,
          max_gap: 0,
          worst_gap: null,
          over5_into: 0,
          over5_gap: 0,
          over5_into_at: [],
          gaps: [],
        };
        const starts = [];
        for (let y = -3.2; y <= 3.21; y += 0.4)
          for (let x = -4.7; x <= 4.71; x += 0.4) starts.push([+x.toFixed(2), +y.toFixed(2)]);
        const ok = starts.filter(([x, y]) => T.at(x, y).capsule_to_collision >= 0.2999);
        res.starts = ok.length;
        let k = 0;
        for (const s of ok) {
          for (let d = 0; d < 16; d++) {
            const a = ((d + 0.37) / 16) * 2 * Math.PI;
            const w = T.walk(s, [Math.cos(a), Math.sin(a)], 2.6, true);
            res.walks++;
            if (w.clearance > 0.305) continue;
            res.rest++;
            const p = T.at(w.end[0], w.end[1], w.end[2]);
            const into = 0.3 - p.capsule_to_visible,
              gap = p.capsule_to_visible - p.capsule_to_collision;
            if (p.capsule_to_visible < res.min_capsule_to_visible) {
              res.min_capsule_to_visible = p.capsule_to_visible;
              res.worst_into = { end: w.end, ...p };
            }
            if (p.eye_to_visible !== null && p.eye_to_visible < res.min_eye_to_visible) {
              res.min_eye_to_visible = p.eye_to_visible;
              res.worst_eye = { end: w.end, ...p };
            }
            if (into > 0.05) {
              res.over5_into++;
              if (res.over5_into_at.length < 40)
                res.over5_into_at.push([w.end[0], w.end[1], +into.toFixed(3)]);
            }
            if (gap > 0.05) res.over5_gap++;
            if (gap > res.max_gap) {
              res.max_gap = +gap.toFixed(4);
              res.worst_gap = { end: w.end, ...p };
            }
            res.gaps.push(+gap.toFixed(3));
          }
          if (++k % 6 === 0) await new Promise((r) => setTimeout(r, 0));
        }
        const g = res.gaps.slice().sort((a, b) => a - b);
        res.gap_p50 = g[g.length >> 1];
        res.gap_p95 = g[Math.floor(g.length * 0.95)];
        res.gap_p99 = g[Math.floor(g.length * 0.99)];
        delete res.gaps;
        await T.save('walk_rest_points.json', res);
        return res;
      }),
    // 3. pressed against each wall (the capsule 0.30 m from the wall plane), every 5 cm: the trim that reaches into it
    walls: () =>
      run('walls', async () => {
        const rows = [];
        const scan = (label, pts) => {
          let worst = null,
            n5 = 0,
            n = 0,
            eyeMin = 9,
            eyeAt = null;
          const over = [];
          for (const [x, y] of pts) {
            const a = T.at(x, y);
            if (a.capsule_to_collision < 0.2985) continue;
            n++;
            const into = 0.3 - a.capsule_to_visible;
            if (into > 0.05) {
              n5++;
              over.push([+x.toFixed(2), +y.toFixed(2), +into.toFixed(3)]);
            }
            if (!worst || into > worst.into)
              worst = { at: [x, y], into: +into.toFixed(4), nearest: a.eye_nearest, eye: a.eye_to_visible };
            if (a.eye_to_visible !== null && a.eye_to_visible < eyeMin) {
              eyeMin = a.eye_to_visible;
              eyeAt = [x, y, a.eye_nearest];
            }
          }
          rows.push({ label, free_points: n, over_5cm: n5, over, worst, eye_min: eyeMin, eye_at: eyeAt });
        };
        scan(
          'S wall y=-3.2',
          rng(-4.7, 4.7).map((x) => [x, -3.2]),
        );
        scan(
          'N wall y=3.2',
          rng(-4.7, 4.7).map((x) => [x, 3.2]),
        );
        scan(
          'W wall x=-4.7',
          rng(-3.2, 3.2).map((y) => [-4.7, y]),
        );
        scan(
          'E wall x=4.7',
          rng(-3.2, 3.2).map((y) => [4.7, y]),
        );
        await T.save('walk_walls.json', rows);
        return rows;
      }),
    // 4. the dead end in front of wardrobe_body (tile (10,2)): how far in the player gets, and that they can leave
    nook: () =>
      run('nook', async () => {
        const inn = [
          [2.75, 2.25],
          [3.0, 2.04],
          [3.2, 2.04],
          [2.4, 2.9],
        ].map((s) => T.walk(s, [1, -0.12], 4, false));
        const far = inn.reduce((m, w) => (w.end[0] > m.end[0] ? w : m));
        const outs = [];
        for (let d = 0; d < 32; d++) {
          const a = (d / 32) * 2 * Math.PI;
          outs.push(T.walk(far.end, [Math.cos(a), Math.sin(a)], 3, false).end);
        }
        const r = {
          walks_in: inn.map((w) => [w.start, w.end, w.clearance]),
          farthest: far.end,
          at_farthest: T.at(far.end[0], far.end[1]),
          ends_fanning_out: outs,
          leaves: outs.filter((e) => e[0] < 3.3).length,
        };
        await T.save('walk_nook.json', r);
        return r;
      }),
  };
  return 'wr ready';
})();
