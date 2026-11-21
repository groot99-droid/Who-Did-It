#!/bin/bash
# The room checks of one first-person room, in the order the bedroom's last independent check ran them:
#   cc_struct (no Blender), cc_geom, cc_cracks, cc_display (no Blender), cc_blend, r7_extra, then summary.py.
# Usage: bash tools/blender/room_checks/run.sh <roomId> [--quick] [--glb F] [--blend F] [--scene F] [--manifest F]
#            [--out DIR] [--config F]
#   The defaults are the build's own files (roomcfg.py): tools/blender/build/rooms/<roomId>.glb, .blend and .json,
#   packages/content/data/scenes/<roomId>.json, rooms/<roomId>.json here (optional: what the checks know of a room comes
#   from the manifest and the scene; the check file holds judged failures, and the numbers of a manifest written
#   before G2b); results in
#   tools/blender/build/rooms/checks/<roomId>/ (git-ignored). A relative path is taken from where you stand.
#   --quick   cc_struct, a coarse cc_geom and r7_extra on its grid only, into checks/<roomId>_quick/: a smoke run,
#             its verdicts are not the full run's. It never ends with 0: cc_geom's walls_closed_collision_fans wants
#             20 fan points and a coarse run takes 12 (the check as it was written, kept).
#   The four Blender steps go through tools/blender/bl.sh, one at a time under its lock (WDI_BLENDER_LOCK, BLENDER);
#   each waits for the lock. PYTHON names the Python of the two plain steps (it needs numpy and Pillow).
#   -h, --help   prints this text.
# Read-only on the build: it writes the GLB's md5 before and after, and only into the results folder. Ends with
# <out>/summary.json and exit code 0 when every check passed, 1 when anything failed or did not run, 2 on a bad call.
for X in "$@"; do
  if [ "$X" = -h ] || [ "$X" = --help ]; then
    sed -n '2,/^[^#]/s/^# \{0,1\}//p' "${BASH_SOURCE[0]}" # the comment above, without its marks
    exit 0
  fi
done
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || exit 2
ROOT="$(cd "$HERE/../../.." && pwd)" || exit 2
PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  if command -v python >/dev/null 2>&1; then PY=python; else PY=python3; fi
fi

RESOLVED="$("$PY" "$HERE/roomcfg.py" "$@")" || exit 2
A=()
while IFS= read -r LINE; do A+=("$LINE"); done <<<"$RESOLVED"
ROOM="${A[0]}" GLB="${A[1]}" BLEND="${A[2]}" SCENE="${A[3]}" MANIFEST="${A[4]}" OUT="${A[5]}" CONFIG="${A[6]}"
QUICK="${A[7]:-}"
cd "$ROOT" || exit 2
RC=tools/blender/room_checks
BL=tools/blender/bl.sh

for F in "$GLB" "$SCENE" "$MANIFEST"; do     # the check file is optional (G2b)
  if [ ! -f "$F" ]; then
    echo "run.sh: no such file: $F" >&2
    exit 2
  fi
done
if [ -z "$QUICK" ] && [ ! -f "$BLEND" ]; then
  echo "run.sh: no such file: $BLEND" >&2
  exit 2
fi
mkdir -p "$OUT" || exit 2
# an earlier run's results must not stand in for this one's
for N in cc_struct cc_geom cc_cracks cc_display cc_blend r7_extra; do rm -f "$OUT/$N.json" "$OUT/$N.log"; done
rm -f "$OUT/cc_reach.png" "$OUT/cc_grid.npz" "$OUT/cc_vertices.npz" "$OUT/steps.tsv" "$OUT/summary.json" \
  "$OUT/glb.md5" "$OUT/glb_after.md5"

ARGS=("$ROOM" --glb "$GLB" --blend "$BLEND" --scene "$SCENE" --manifest "$MANIFEST" --out "$OUT" --config "$CONFIG")
if [ -n "$QUICK" ]; then ARGS+=(--quick); fi

step() { # step <name> <command ...>: its output to <out>/<name>.log, its exit code and seconds to steps.tsv
  local NAME="$1" T0=$SECONDS CODE
  shift
  echo "$NAME $(date +%T)"
  "$@" >"$OUT/$NAME.log" 2>&1
  CODE=$?
  printf '%s\t%s\t%s\n' "$NAME" "$CODE" "$((SECONDS - T0))" >>"$OUT/steps.tsv"
  echo "  exit $CODE, $((SECONDS - T0)) s"
}
skip() {
  printf '%s\tskipped\t0\n' "$1" >>"$OUT/steps.tsv"
  echo "$1 skipped (--quick)"
}
in_blender() { # in_blender <script> [<room.blend>]: one Blender run under the lock; a Python error ends it with code 1
  if [ -n "$2" ]; then
    bash "$BL" -b "$2" --factory-startup --python-exit-code 1 -P "$RC/$1" -- "${ARGS[@]}"
  else
    bash "$BL" -b --factory-startup --python-exit-code 1 -P "$RC/$1" -- "${ARGS[@]}"
  fi
}

"$PY" "$RC/summary.py" "${ARGS[@]}" --stamp before || exit 2
step cc_struct "$PY" "$RC/cc_struct.py" "${ARGS[@]}"
step cc_geom in_blender cc_geom.py
if [ -z "$QUICK" ]; then
  step cc_cracks in_blender cc_cracks.py
  step cc_display "$PY" "$RC/cc_display.py" "${ARGS[@]}"
  step cc_blend in_blender cc_blend.py "$BLEND"
else
  skip cc_cracks
  skip cc_display
  skip cc_blend
fi
step r7_extra in_blender r7_extra.py
"$PY" "$RC/summary.py" "${ARGS[@]}" --stamp after || exit 2
"$PY" "$RC/summary.py" "${ARGS[@]}"
