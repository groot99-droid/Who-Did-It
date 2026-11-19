#!/bin/bash
# The regression gate of the first-person rooms: one finished room rebuilt from its saved bake, and its GLB compared
# with the golden md5 in tools/blender/meshy_rooms/golden.json. Run it after every change to shared builder code
# (meshy_room_build.py, meshy_interior_build.py and what they import, the look files): a finished room must come out
# byte for byte as it was judged.
# Usage: bash tools/blender/room_checks/regress.sh <roomId> [--out DIR] [--raw F] [--golden F]
#   --out     the scratch folder the room is rebuilt into   default tools/blender/build/rooms/regress/<roomId>/
#             (git-ignored). <roomId>.glb, .blend, .json and the textures in it are overwritten; the rooms' own
#             build folder is refused.
#   --raw     the room's saved bake                         default tools/blender/build/rooms/<the golden row's raw>
#   --golden  the golden values                             default tools/blender/meshy_rooms/golden.json
#   -h, --help   prints this text.
#   A relative path is taken from where you stand. The rebuild is one Blender run through tools/blender/bl.sh under
#   its lock (WDI_BLENDER_LOCK, BLENDER), with the golden row's own --light and --layout and no stills: about a
#   minute for the bedroom (49 to 73 s measured), and longer while another Blender job holds the lock, for which it
#   waits. PYTHON names the Python of regress.py (standard library only).
# The build it checks is only read. It writes into --out: the rebuild, build.log (the builder's output, with
# absolute local paths: do not publish it as it is) and regress.json (the verdict).
# Exit code 0: the rebuilt GLB has the golden md5. 1: it differs, or the rebuild failed; regress.py says what
# differs. 2: a bad call (no golden row for the room, a missing file). 3: the saved bake is not on this machine
# (tools/blender/build/ is git-ignored), so nothing was compared.
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

RESOLVED="$("$PY" "$HERE/regress.py" plan "$@")" || exit $?
A=()
while IFS= read -r LINE; do A+=("$LINE"); done <<<"$RESOLVED"
if [ "${#A[@]}" -ne 6 ]; then
  # one value a line: more or fewer lines would put another folder in OUT, whose files are cleared below
  echo "regress.sh: regress.py plan gave ${#A[@]} lines where 6 are read; nothing was cleared or run" >&2
  exit 2
fi
ROOM="${A[0]}" LIGHT="${A[1]}" LAYOUT="${A[2]}" RAW="${A[3]}" OUT="${A[4]}" GOLDEN="${A[5]}"
cd "$ROOT" || exit 2
RC=tools/blender/room_checks

mkdir -p "$OUT" || exit 2
# an earlier run's files must not stand in for this one's
rm -f "$OUT/$ROOM.glb" "$OUT/$ROOM.json" "$OUT/build.log" "$OUT/regress.json"

echo "regress $ROOM: rebuilding from $RAW (light $LIGHT, layout $LAYOUT) into $OUT $(date +%T)"
echo "  while another Blender job holds the lock the rebuild waits for it (bl.sh says so in $OUT/build.log)"
T0=$SECONDS
bash tools/blender/bl.sh -b --factory-startup --python-exit-code 1 -P tools/blender/meshy_room_build.py -- \
  --scene "$ROOM" --raw "$RAW" --light "$LIGHT" --layout "$LAYOUT" --glb --out "$OUT" >"$OUT/build.log" 2>&1
CODE=$?
"$PY" "$RC/regress.py" verdict "$ROOM" --out "$OUT" --raw "$RAW" --golden "$GOLDEN" --build-exit "$CODE" \
  --seconds "$((SECONDS - T0))"
