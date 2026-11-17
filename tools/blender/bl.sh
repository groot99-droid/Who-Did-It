#!/bin/bash
# Run Blender only when no other Blender of ours is running: one Blender at a time on the laptop (owner's rule).
# Usage: bash tools/blender/bl.sh -b --factory-startup -P script.py -- args ...
#   It waits for the lock, changes to the repo root (so give script and file arguments from there, or absolute),
#   runs Blender and ends with Blender's exit code.
#   WDI_BLENDER_LOCK  the lock directory, an absolute path. Default: wdi_blender.lock in the system temp folder.
#                     Everything that starts Blender on one machine must use the same one. A relative path stops the
#                     wrapper with exit code 2 before anything is made or run: it would be another folder for each
#                     caller, and the wrapper changes folder before it frees the lock.
#   BLENDER           the Blender to run. Default: the standard Blender 5.2 install on Windows when it is there,
#                     else `blender` on PATH.
LOCK="${WDI_BLENDER_LOCK:-${TMPDIR:-${TEMP:-${TMP:-/tmp}}}/wdi_blender.lock}"
case "$LOCK" in
  /* | [A-Za-z]:[\\/]*) ;; # absolute: a leading slash, or a drive letter with a slash or a backslash
  *)
    echo "bl.sh: the lock directory must be an absolute path: $LOCK" >&2
    exit 2
    ;;
esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" || exit 2
if [ -z "$BLENDER" ]; then
  BLENDER="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
  [ -x "$BLENDER" ] || BLENDER=blender
fi
if [ ! -d "$(dirname "$LOCK")" ]; then
  echo "bl.sh: the lock's folder does not exist: $(dirname "$LOCK")" >&2
  exit 2
fi

blender_running() {
  if command -v tasklist >/dev/null 2>&1; then
    tasklist 2>/dev/null | grep -qi '^blender\.exe'
  else
    pgrep -x blender >/dev/null 2>&1
  fi
}

WAITING=""
while ! mkdir "$LOCK" 2>/dev/null; do
  if [ -z "$WAITING" ]; then
    WAITING=1
    echo "bl.sh: waiting for the Blender lock $LOCK" >&2
  fi
  # a lock left by a killed run: older than 40 minutes and no Blender alive
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +40 2>/dev/null)" ] && ! blender_running; then
    rmdir "$LOCK" 2>/dev/null
  fi
  sleep 5
done
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
cd "$ROOT" || exit 2
"$BLENDER" "$@"
