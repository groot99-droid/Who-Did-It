#!/bin/bash
# The one-sample bake gate of the first-person rooms: what regress.sh cannot see. regress.sh rebuilds a room from its
# saved bake (--raw skips every Cycles bake), so a change to what the bake computes (the rig's lights, the light-tight
# box, the groups) cannot show there. This rebuilds the room with --bake-groups at 1 sample a group (and the AO at the
# look's own samples), saves that bake and the rig's fingerprint (room_checks/rig_print.py), and compares each group's
# arrays and the fingerprint bit for bit with the room's `bake1spp` and `rig` in tools/blender/meshy_rooms/golden.json.
# Usage: bash tools/blender/room_checks/regress_bake.sh <roomId> [--out DIR] [--golden F] [--record [--replace]]
#   --out      the scratch folder   default tools/blender/build/rooms/regress_bake/<roomId>/ (git-ignored); the
#              rooms' own build folder is refused
#   --golden   the golden values    default tools/blender/meshy_rooms/golden.json
#   --record   two runs (run1, run2 in --out) and, only when the two agree bit for bit, the row's bake1spp and rig
#              written from them (--replace when the row has them and the bake was changed on purpose)
#   -h, --help prints this text.
#   Each run is one Blender run through tools/blender/bl.sh under its lock (WDI_BLENDER_LOCK, BLENDER), with the golden
#   row's --layout: the build (about a minute for the bedroom), three one-sample groups and the AO (about 3 minutes in
#   all), and longer while another Blender job holds the lock. PYTHON names the Python of regress.py (it needs numpy).
# Exit code 0: a match (or, with --record, the row written); 1: a difference, or a run failed; 2: a bad call.
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
ROOM="" OUT="" GOLDEN="" RECORD="" REPLACE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --golden) GOLDEN="$2"; shift 2 ;;
    --record) RECORD=1; shift ;;
    --replace) REPLACE=1; shift ;;
    -*) echo "regress_bake.sh: unknown argument $1" >&2; exit 2 ;;
    *) [ -z "$ROOM" ] || { echo "regress_bake.sh: one room id" >&2; exit 2; }; ROOM="$1"; shift ;;
  esac
done
case "$ROOM" in "" | *[!A-Za-z0-9_]*) echo "regress_bake.sh: give the room id (a scene id)" >&2; exit 2 ;; esac
[ -n "$GOLDEN" ] && GOLDEN="$(cd "$(dirname "$GOLDEN")" && pwd)/$(basename "$GOLDEN")"
GOLDEN="${GOLDEN:-$ROOT/tools/blender/meshy_rooms/golden.json}"
if [ -n "$OUT" ]; then
  mkdir -p "$OUT" || exit 2
  OUT="$(cd "$OUT" && pwd)"
else
  OUT="$ROOT/tools/blender/build/rooms/regress_bake/$ROOM"
fi
if [ "$OUT" = "$ROOT/tools/blender/build/rooms" ]; then
  echo "regress_bake.sh: --out is the rooms' own build folder; give a scratch folder" >&2
  exit 2
fi
# the golden row's layout (regress.py plan prints room, light, layout, ...; the saved bake need not be here)
LAYOUT="$("$PY" -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["rooms"][sys.argv[2]]["layout"])' \
  "$GOLDEN" "$ROOM")" || { echo "regress_bake.sh: no golden row for $ROOM in $GOLDEN" >&2; exit 2; }
case "$LAYOUT" in "" | *[!A-Za-z0-9_.-]*) echo "regress_bake.sh: the row's layout is not a plain name" >&2; exit 2 ;; esac
cd "$ROOT" || exit 2

one_run() { # one_run <folder>: the build with a one-sample group bake, its saved bake and the rig's fingerprint
  local D="$1" T0=$SECONDS CODE
  mkdir -p "$D" || return 2
  rm -f "$D/$ROOM"_bake1.npz "$D/rig.json" "$D/build.log" # an earlier run's files must not stand in for this one's
  echo "regress_bake $ROOM: one-sample group bake into $D $(date +%T) (waits while another Blender job holds the lock)"
  bash tools/blender/bl.sh -b --factory-startup --python-exit-code 1 -P tools/blender/meshy_room_build.py -- \
    --scene "$ROOM" --layout "$LAYOUT" --bake-groups --samples 1 --save-raw "$D/${ROOM}_bake1.npz" \
    --rig-print "$D/rig.json" --out "$D" >"$D/build.log" 2>&1
  CODE=$?
  echo "  exit $CODE, $((SECONDS - T0)) s"
  return $CODE
}

ARGS=(bake "$ROOM" --out "$OUT" --golden "$GOLDEN")
if [ -n "$RECORD" ]; then
  one_run "$OUT/run1" || exit 1
  one_run "$OUT/run2" || exit 1
  ARGS+=(--record)
  [ -z "$REPLACE" ] || ARGS+=(--replace)
else
  one_run "$OUT" || exit 1
fi
"$PY" "$HERE/regress.py" "${ARGS[@]}"
