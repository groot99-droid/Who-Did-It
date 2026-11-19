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
#   TERM, INT or HUP  to the wrapper alone: it ends Blender (that pid only: TERM, then KILL after about 5 s), waits
#                     until Blender is gone, frees the lock and ends with 128 plus the signal's number. The lock is
#                     never freed while Blender lives: if Blender cannot be ended it stays, and the wrapper says so on
#                     stderr. A wrapper that is still waiting for the lock ends when its 5 s poll ends. Not caught:
#                     KILL or End task (Blender runs on and the lock stays), and a signal that the caller started the
#                     wrapper with ignored, as bash does for INT in a background job of a script and nohup does for
#                     HUP: nothing happens then, and Blender runs on.
#   Take-over         a lock older than 40 minutes with no Blender alive (the run that held it was killed) is removed.
#                     The wrapper asks for a Blender first; the find that removes the lock tests the age itself, so a
#                     lock that another caller made meanwhile stays, but for the microseconds inside that find.
#   Under a tool with a time limit start a long job as a background command and wait for it from a later call
#   (measured with stand-ins in Claude Code's Bash tool: at its limit a foreground command is not ended, it runs on).
#   Tests, with a stand-in for Blender and private locks: bash tools/blender/tests/bl_test.sh
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

HELD="" # 1 once the lock is ours
CHILD="" # Blender's pid
GOT="" # the number of a signal that came in before the lock was ours

# True when Blender is gone, waiting up to $1 seconds for it (counted in whole seconds). Then CHILD is empty.
gone() {
  local end=$((SECONDS + $1))
  while kill -0 "$CHILD" 2>/dev/null; do
    [ "$SECONDS" -lt "$end" ] || return 1
    sleep 0.2
  done
  CHILD=""
}

on_signal() { # $1: the signal's number
  trap '' TERM INT HUP # a second one changes nothing now
  CHILD="${CHILD:-$!}" # a signal can land between starting Blender and keeping its pid
  gone 0 || {
    kill -TERM "$CHILD" 2>/dev/null
    gone 5 || { kill -KILL "$CHILD" 2>/dev/null; gone 5; }
  }
  exit $((128 + $1))
}

release() { # the only place that frees the lock
  [ -n "$HELD" ] || return 0
  if gone 0; then
    rmdir "$LOCK" 2>/dev/null
  else
    echo "bl.sh: could not end Blender (pid $CHILD): the lock stays: $LOCK" >&2
  fi
}

# Until the lock is ours a signal is only noted, and acted on once it is. Bash holds a trap back until the command that
# runs has returned, so a handler that acted at once could not tell whether the mkdir it came in during had made the
# lock, and it would leave that lock behind.
trap 'GOT=15' TERM
trap 'GOT=2' INT
trap 'GOT=1' HUP
trap release EXIT

WAITING=""
while ! mkdir "$LOCK" 2>/dev/null; do
  [ -z "$GOT" ] || exit $((128 + GOT)) # still waiting: there is no lock of ours to free
  if [ -z "$WAITING" ]; then
    WAITING=1
    echo "bl.sh: waiting for the Blender lock $LOCK" >&2
  fi
  # A lock left by a killed run: older than 40 minutes and no Blender alive. Ask for Blender first. The one find that
  # removes the lock tests its age itself, so a lock that another caller made meanwhile is not removed.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +40 2>/dev/null)" ] && ! blender_running; then
    find "$LOCK" -maxdepth 0 -type d -mmin +40 -delete 2>/dev/null
  fi
  sleep 5
done
HELD=1
cd "$ROOT" || exit 2
trap 'on_signal 15' TERM
trap 'on_signal 2' INT
trap 'on_signal 1' HUP
[ -z "$GOT" ] || exit $((128 + GOT)) # one came in meanwhile: Blender is not started, and the exit frees the lock
# Blender runs in the background and the wrapper waits for it: a trapped signal ends that wait at once, where a
# foreground command would hold the trap back until it ended. <&0 keeps the caller's stdin, which a background command
# would lose.
"$BLENDER" "$@" <&0 &
CHILD=$!
wait "$CHILD"
exit $?
