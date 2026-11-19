#!/bin/bash
# Tests of tools/blender/bl.sh, the lock wrapper. A stand-in program takes the place of Blender and every lock is a
# folder of this test's own: no Blender is started and the lock of a real run is never touched.
# Usage: bash tools/blender/tests/bl_test.sh [WORKDIR]
#   WORKDIR           a folder to make this test's own folder in (bl_test.XXXXXX), kept for a look. Default: a new
#                     folder in the temp folder, removed when every check passed.
#   BL_UNDER_TEST=F   test the wrapper file F instead of tools/blender/bl.sh (an older copy, for example).
# It prints a line a check and, last, "N ok, M failed", and ends with 0 only when M is 0. About two minutes. Start it
# in the foreground, as a background command, or as a background job of a script (`bash bl_test.sh > log &`, or under
# nohup). A program started as such a job gets INT ignored (nohup: HUP too) and cannot catch it, so then the wrapper
# under test is started through perl (Git Bash has it), which sets both back; with no perl the INT and HUP cases skip.
# Needs Git Bash on Windows: bash 5 ($EPOCHREALTIME), GNU find, touch and timeout, cygpath, ps, tasklist, and for the
# native-child case a Windows program (python if one runs, else ping). It is bash because the signals must reach the
# wrapper as MSYS signals. The Linux bash of the CI has not run it: there the Windows-only cases skip and pgrep stands
# in for tasklist, but that is untried. Not covered: which Blender the wrapper picks by default, and the /tmp fallback
# of the default lock (both would reach the real machine). Not part of the CI or of `pnpm test`: run it by hand after
# a change to bl.sh.
WIN=""
case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) WIN=1 ;; esac
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" || exit 2
SRC="${BL_UNDER_TEST:-$HERE/../bl.sh}"
[ -f "$SRC" ] || {
  echo "bl_test.sh: no wrapper at $SRC" >&2
  exit 2
}
KEEP=""
if [ -n "$1" ]; then
  mkdir -p "$1" || exit 2
  T="$(mktemp -d "$(cd "$1" && pwd)/bl_test.XXXXXX")" || exit 2
  KEEP=1
else
  T="$(mktemp -d)" || exit 2
fi
O="$T/out" # logs, away from the folders whose listings are compared
L="$T/locks"
SHIM="$T/shim"
SHIMMK="$T/shimmk"
mkdir -p "$T/root/tools/blender" "$T/elsewhere/sub" "$T/tmpd" "$T/tmpw" "$T/tmpx" "$O" "$L" "$SHIM" "$SHIMMK" || exit 2
# the wrapper under test, in a root of its own: it changes to the root two folders above itself
cp "$SRC" "$T/root/tools/blender/bl.sh" || exit 2
ROOTD="$T/root"
BL="$ROOTD/tools/blender/bl.sh"
FAKE="$T/fake.sh"
unset WDI_BLENDER_LOCK FAKE_LOG FAKE_SLEEP FAKE_EXIT FAKE_MODE FAKE_PID FAKE_COUNT EXPECT_LOCK BL_ASK_HOOK BL_BLENDER_UP
export BLENDER="$FAKE" # never a real Blender, in any call
REALSLEEP="$(command -v sleep)"
export REALSLEEP

cat >"$FAKE" <<'EOF'
#!/bin/bash
# Stand-in for Blender. From the environment: FAKE_LOG (a file to log to), FAKE_SLEEP (seconds to run, default 0),
# FAKE_EXIT (exit code, default 0), EXPECT_LOCK (a lock folder: logs whether it exists), FAKE_PID (a file for its pid),
# FAKE_MODE: "" ends on TERM, INT or HUP; ignore ignores them; slow takes 1 s to end after TERM; count (FAKE_COUNT is
# a folder) logs "overlap" when another one runs at the same time; io copies stdin to stdout, writes a line to stderr
# and ends with 3.
log() { [ -z "$FAKE_LOG" ] || echo "$*" >>"$FAKE_LOG"; }
nap() { # a plain sleep would hold a trap back until it ends
  [ "$1" = 0 ] && return
  "$REALSLEEP" "$1" &
  NAP=$!
  [ -z "$FAKE_PID" ] || echo "$NAP" >>"$FAKE_PID.nap" # for the test to end it when it has to kill this stand-in
  wait "$NAP"
}
held=-
if [ -n "$EXPECT_LOCK" ]; then
  if [ -d "$EXPECT_LOCK" ]; then held=yes; else held=no; fi
fi
[ -z "$FAKE_PID" ] || echo $$ >"$FAKE_PID"
log "start $EPOCHREALTIME pid $$ cwd $(pwd) lock_held $held nargs $#"
n=0
for a in "$@"; do
  n=$((n + 1))
  log "  arg$n=[$a]"
done
case "$FAKE_MODE" in
  io)
    cat
    echo "to stderr" >&2
    exit 3
    ;;
  ignore)
    trap '' TERM INT HUP
    while [ "$SECONDS" -lt "${FAKE_SLEEP:-0}" ]; do "$REALSLEEP" 1; done
    ;;
  slow)
    trap 'log "term $EPOCHREALTIME"; kill "$NAP" 2>/dev/null; "$REALSLEEP" 1; log "exit $EPOCHREALTIME"; exit 0' TERM
    nap "${FAKE_SLEEP:-0}"
    ;;
  count)
    mkdir "$FAKE_COUNT/$$"
    others=("$FAKE_COUNT"/*)
    [ "${#others[@]}" -le 1 ] || log "overlap"
    nap "${FAKE_SLEEP:-0}"
    rmdir "$FAKE_COUNT/$$"
    ;;
  *)
    trap 'kill "$NAP" 2>/dev/null; exit 143' TERM INT HUP
    nap "${FAKE_SLEEP:-0}"
    ;;
esac
log "end   $EPOCHREALTIME pid $$"
exit "${FAKE_EXIT:-0}"
EOF
chmod +x "$FAKE"

# Two shims for the cases that must not wait for the wrapper's 5 s poll or ask the real machine for a Blender. They
# sit at the front of PATH in those calls only.
cat >"$SHIM/sleep" <<'EOF'
#!/bin/bash
# the wrapper's 5 s poll becomes 0.2 s; every other sleep is the real one
if [ "$1" = 5 ]; then exec "$REALSLEEP" 0.2; fi
exec "$REALSLEEP" "$@"
EOF
ASK=pgrep
[ -z "$WIN" ] || ASK=tasklist
cat >"$SHIM/$ASK" <<'EOF'
#!/bin/bash
# Stands in for the wrapper's question whether a Blender runs (tasklist on Windows, pgrep elsewhere). If BL_ASK_HOOK
# names a script, it runs once first: what another caller does while the question is asked. The answer is yes when the
# file BL_BLENDER_UP exists.
if [ -n "$BL_ASK_HOOK" ] && [ ! -e "$BL_ASK_HOOK.done" ]; then
  : >"$BL_ASK_HOOK.done"
  bash "$BL_ASK_HOOK"
fi
if [ -n "$BL_BLENDER_UP" ] && [ -e "$BL_BLENDER_UP" ]; then
  echo "blender.exe                   4242 Console                    1    99,999 K"
  exit 0
fi
exit 1
EOF
chmod +x "$SHIM/sleep" "$SHIM/$ASK"
SHIMPATH="$SHIM:$PATH"
# A mkdir that keeps the wrapper in it for BL_MKDIR_DELAY seconds after the folder was made: a signal that comes then
# is held back until mkdir returns. It is in a folder of its own, so that the cases that do not want it never get it.
REALMKDIR="$(command -v mkdir)"
export REALMKDIR
cat >"$SHIMMK/mkdir" <<'EOF'
#!/bin/bash
"$REALMKDIR" "$@"
code=$?
[ -z "$BL_MKDIR_DELAY" ] || "$REALSLEEP" "$BL_MKDIR_DELAY"
exit "$code"
EOF
chmod +x "$SHIMMK/mkdir"

# A program started as a background job of a script has INT ignored, and under nohup HUP too; a program that gets a
# signal ignored cannot catch it, so the wrapper would never see it. When this test was started so, the wrapper is
# started through perl, which sets both back to the default first (bg() puts RESET in front).
RESET=()
hears() { # <signal>: true when a program started the way bg() starts the wrapper is ended by that signal
  [ "$("${RESET[@]}" bash -c "kill -$1 \$\$; echo ignored" 2>/dev/null)" != ignored ]
}
if ! hears INT || ! hears HUP; then
  if command -v perl >/dev/null 2>&1; then
    RESET=(perl -e '$SIG{INT} = "DEFAULT"; $SIG{HUP} = "DEFAULT"; exec @ARGV')
    echo "note  INT or HUP is ignored in this launch: the wrapper is started through perl, which resets them"
  fi
fi

PASS=0
FAILN=0
SKIPPED=""
ok() {
  echo "ok    $1"
  PASS=$((PASS + 1))
}
bad() {
  echo "FAIL  $1"
  FAILN=$((FAILN + 1))
}
skip() {
  echo "skip  $1"
  SKIPPED="$SKIPPED $1;"
}
usec() { echo "${1//[.,]/}"; } # $EPOCHREALTIME in microseconds
listing() { (cd "$1" && ls -A | sort); }
alive() { kill -0 "$1" 2>/dev/null; }
gone() { ! alive "$1"; }
has() { grep -q -- "$1" "$2" 2>/dev/null; }
state() { # <lock> <pid>: how a lock and a process stand, for a message
  echo "lock $([ -d "$1" ] && echo kept || echo freed), process $(alive "$2" && echo alive || echo gone)"
}
# wait_for <seconds> <command ...>: look every 50 ms until the command succeeds; fails when the time is up
wait_for() {
  local limit=$(($(usec "$EPOCHREALTIME") + $1 * 1000000))
  while ! "${@:2}"; do
    [ "$(usec "$EPOCHREALTIME")" -lt "$limit" ] || return 1
    "$REALSLEEP" 0.05
  done
}
# bg <label> <lock> [NAME=value ...] [-- argument ...]
#   The wrapper in the background, from another folder, output in $O/<label>.out and .err; W is its pid. Job control
#   is on while it starts, so that it has a process group of its own. With BYST set (a file name) a sleep is started in
#   that group first and its pid is written to the file: a bystander that only a signal to the whole group would end.
bg() {
  local label=$1 lock=$2 envs=()
  shift 2
  while [ $# -gt 0 ] && [ "$1" != -- ]; do
    envs+=("$1")
    shift
  done
  [ "$1" = -- ] && shift
  rm -f "$O/$label.out" "$O/$label.err"
  set -m
  (
    cd "$T/elsewhere" || exit 2
    if [ -n "$BYST" ]; then
      "$REALSLEEP" 60 >/dev/null 2>&1 &
      echo $! >"$BYST"
    fi
    exec "${RESET[@]}" env "${envs[@]}" WDI_BLENDER_LOCK="$lock" bash "$BL" "$@" >"$O/$label.out" 2>"$O/$label.err"
  ) &
  W=$!
  set +m
}
# finish <pid> <seconds>: wait for a background job of this test to end, stop it when it does not; CODE is its exit code
finish() {
  local n=$(($2 * 20))
  while alive "$1" && [ "$n" -gt 0 ]; do
    "$REALSLEEP" 0.05
    n=$((n - 1))
  done
  alive "$1" && kill -KILL "$1" 2>/dev/null
  { wait "$1"; } 2>/dev/null
  CODE=$?
}
# watch <wrapper pid> <child pid> <lock>: until the wrapper ends, look every 50 ms at the lock, then at the child.
# SAMPLES looks, BADS looks that found the lock freed and the child alive, BOTH looks that found both.
watch() {
  SAMPLES=0 BADS=0 BOTH=0
  local lock_there child_alive
  while alive "$1"; do
    lock_there=""
    [ -d "$3" ] && lock_there=1
    child_alive=""
    alive "$2" && child_alive=1
    SAMPLES=$((SAMPLES + 1))
    [ -z "$child_alive" ] || { [ -n "$lock_there" ] && BOTH=$((BOTH + 1)) || BADS=$((BADS + 1)); }
    "$REALSLEEP" 0.05
  done
}
stale_lock() { # <folder> <minutes old>
  mkdir "$1" && touch -d "$2 minutes ago" "$1"
}
reap() { # <pid file>: end the stand-in that file names and the sleep it naps on, which a KILL would leave behind
  local p
  for p in $(cat "$1" "$1.nap" 2>/dev/null); do kill -KILL "$p" 2>/dev/null; done
}
cleanup() {
  local f p
  for f in "$O"/*.pid "$O"/*.pid.nap "$O"/*.byst; do
    [ -f "$f" ] || continue
    for p in $(cat "$f"); do alive "$p" && kill -KILL "$p" 2>/dev/null; done
  done
  for p in $(jobs -p); do kill -KILL "$p" 2>/dev/null; done
  [ -n "$KEEP" ] || [ "$FAILN" != 0 ] || rm -rf "$T"
}
trap cleanup EXIT

echo "== 0. the wrapper's own syntax"
if bash -n "$BL" 2>"$O/syntax.err"; then ok "bash -n: no error"; else bad "bash -n: $(cat "$O/syntax.err")"; fi

run_abs() { # <label> <lock as given> <the same lock as a POSIX path> <folder to stand in>
  local label=$1 lock=$2 posix=$3 from=$4 code
  rm -f "$O/$label.log" "$O/$label.err" "$O/$label.out"
  (cd "$from" && FAKE_LOG="$O/$label.log" EXPECT_LOCK="$posix" WDI_BLENDER_LOCK="$lock" \
    bash "$BL" -b "a b" --x 'c  d' '*' '' >"$O/$label.out" 2>"$O/$label.err")
  code=$?
  if [ "$code" = 0 ]; then ok "$label: exit 0"; else bad "$label: exit $code ($(cat "$O/$label.err"))"; fi
  if has "cwd $ROOTD lock_held yes nargs 6\$" "$O/$label.log"; then
    ok "$label: ran in the root with the lock held and 6 arguments"
  else
    bad "$label: start line: $(head -1 "$O/$label.log" 2>&1)"
  fi
  if has "^  arg2=\[a b\]\$" "$O/$label.log" && has "^  arg4=\[c  d\]\$" "$O/$label.log" &&
    has "^  arg5=\[\*\]\$" "$O/$label.log" && has "^  arg6=\[\]\$" "$O/$label.log"; then
    ok "$label: arguments with spaces, * and an empty one intact"
  else
    bad "$label: arguments"
  fi
  if [ ! -e "$posix" ]; then ok "$label: lock freed"; else bad "$label: lock left behind: $posix"; fi
}

run_rel() { # <label> <relative lock> <folder to stand in>
  local label=$1 lock=$2 from=$3 code l_from l_up l_root
  rm -f "$O/$label.log" "$O/$label.err" "$O/$label.out"
  l_from="$(listing "$from")"
  l_up="$(listing "$from/..")"
  l_root="$(listing "$ROOTD")"
  (cd "$from" && FAKE_LOG="$O/$label.log" WDI_BLENDER_LOCK="$lock" bash "$BL" -b x >"$O/$label.out" 2>"$O/$label.err")
  code=$?
  if [ "$code" = 2 ]; then ok "$label ($lock): exit 2"; else bad "$label ($lock): exit $code"; fi
  if grep -qxF "bl.sh: the lock directory must be an absolute path: $lock" "$O/$label.err"; then
    ok "$label: says why"
  else
    bad "$label: message: $(cat "$O/$label.err")"
  fi
  if [ ! -e "$O/$label.log" ]; then ok "$label: the stand-in was not started"; else bad "$label: the stand-in ran"; fi
  if [ "$(listing "$from")" = "$l_from" ] && [ "$(listing "$from/..")" = "$l_up" ] &&
    [ "$(listing "$ROOTD")" = "$l_root" ] && [ ! -e "$from/$lock" ] && [ ! -e "$ROOTD/$lock" ]; then
    ok "$label: nothing made where the caller stands, one folder up, or in the root"
  else
    bad "$label: a folder listing changed"
  fi
}

echo "== A. absolute locks: run, and freed (called from another folder and from the root)"
run_abs a1_posix_elsewhere "$L/a1.lock" "$L/a1.lock" "$T/elsewhere"
run_abs a4_posix_root "$L/a4.lock" "$L/a4.lock" "$ROOTD"
if [ -n "$WIN" ]; then
  MIXED="$(cygpath -m "$L")"
  WINF="$(cygpath -w "$L")"
  run_abs a2_drive_slash_elsewhere "$MIXED/a2.lock" "$L/a2.lock" "$T/elsewhere"
  run_abs a3_drive_backslash_elsewhere "$WINF\\a3.lock" "$L/a3.lock" "$T/elsewhere"
  run_abs a5_drive_backslash_root "$WINF\\a5.lock" "$L/a5.lock" "$ROOTD"
else
  skip "a2, a3, a5: the drive-letter spellings are Windows-only"
fi

echo "== A6. exit codes pass through and the lock is freed"
for c in 0 1 7; do
  (cd "$T/elsewhere" && FAKE_EXIT=$c WDI_BLENDER_LOCK="$L/a6.lock" bash "$BL" x >/dev/null 2>&1)
  code=$?
  if [ "$code" = "$c" ] && [ ! -e "$L/a6.lock" ]; then
    ok "a6: exit $c passed through, lock freed"
  else
    bad "a6: exit $code for $c"
  fi
done
(cd "$T/elsewhere" && BLENDER="$T/no_such_blender" WDI_BLENDER_LOCK="$L/a7.lock" bash "$BL" x >/dev/null 2>&1)
code=$?
if [ "$code" = 127 ] && [ ! -e "$L/a7.lock" ]; then
  ok "a7: a missing Blender gives 127, lock freed"
else
  bad "a7: exit $code"
fi

echo "== B. relative locks: refused before anything is made or run"
run_rel b1_name_elsewhere "rel_lock" "$T/elsewhere"
run_rel b2_dot_elsewhere "./rel_lock" "$T/elsewhere"
run_rel b3_sub_elsewhere "sub/rel_lock" "$T/elsewhere"
run_rel b4_up_elsewhere "../rel_lock" "$T/elsewhere"
run_rel b5_name_root "rel_lock" "$ROOTD"
run_rel b6_sub_root "tools/blender/rel_lock" "$ROOTD"
run_rel b7_drive_relative "C:rel_lock" "$T/elsewhere"
run_rel b8_backslash "\\rel_lock" "$T/elsewhere"

echo "== C. an absolute lock whose folder is missing: exit 2"
(cd "$T/elsewhere" && FAKE_LOG="$O/c1.log" WDI_BLENDER_LOCK="$T/no_folder/x.lock" bash "$BL" x >/dev/null 2>"$O/c1.err")
code=$?
if [ "$code" = 2 ] && grep -qxF "bl.sh: the lock's folder does not exist: $T/no_folder" "$O/c1.err" &&
  [ ! -e "$O/c1.log" ]; then
  ok "c1: exit 2, the folder named, the stand-in not started"
else
  bad "c1: exit $code: $(cat "$O/c1.err")"
fi

echo "== D. waits while the lock is held, goes on when it is freed (the wrapper's own 5 s poll)"
lock="$L/d.lock"
rm -f "$O/d.log"
mkdir "$lock"
bg d "$lock" FAKE_LOG="$O/d.log" -- waited
"$REALSLEEP" 6
if [ ! -e "$O/d.log" ] && alive "$W"; then
  ok "d: still waiting after 6 s, one poll later"
else
  bad "d: did not wait"
fi
if grep -qxF "bl.sh: waiting for the Blender lock $lock" "$O/d.err"; then
  ok "d: says it waits"
else
  bad "d: message: $(cat "$O/d.err")"
fi
rmdir "$lock"
finish "$W" 30
if has "^start" "$O/d.log" && [ "$CODE" = 0 ] && [ ! -e "$lock" ]; then
  ok "d: went on when the lock was freed, and freed it"
else
  bad "d: after freeing: exit $CODE"
fi
if [ "$(grep -c "waiting" "$O/d.err")" = 1 ]; then
  ok "d: the waiting line is printed once"
else
  bad "d: waiting line count"
fi

run_fast() { # <label> <lock> <limit s> [NAME=value ...]: the wrapper, fast poll; 124 when still waiting at the limit
  local label=$1 lock=$2 limit=$3
  shift 3
  rm -f "$O/$label.log" "$O/$label.err"
  (cd "$T/elsewhere" && env PATH="$SHIMPATH" FAKE_LOG="$O/$label.log" WDI_BLENDER_LOCK="$lock" "$@" \
    timeout -k 3 "$limit" bash "$BL" x >"$O/$label.out" 2>"$O/$label.err")
}

echo "== E. the stale-lock rule: older than 40 minutes and no Blender alive (fast poll, the question shimmed)"
for age in 50 41; do
  lock="$L/e$age.lock"
  stale_lock "$lock" "$age"
  run_fast "e$age" "$lock" 30
  code=$?
  if [ "$code" = 0 ] && has "^start" "$O/e$age.log" && [ ! -e "$lock" ]; then
    ok "e$age: a $age-minute-old lock was taken over, the stand-in ran, the lock was freed"
  else
    bad "e$age: exit $code"
    rmdir "$lock" 2>/dev/null
  fi
done
for age in 39 10; do
  lock="$L/e$age.lock"
  stale_lock "$lock" "$age"
  run_fast "e$age" "$lock" 3
  code=$?
  if [ "$code" = 124 ] && [ ! -e "$O/e$age.log" ] && [ -d "$lock" ]; then
    ok "e$age: a $age-minute-old lock was not taken over (still waiting when stopped after 3 s)"
  else
    bad "e$age: exit $code"
  fi
  rmdir "$lock" 2>/dev/null
done
lock="$L/ealive.lock"
stale_lock "$lock" 50
: >"$T/blender_up"
run_fast ealive "$lock" 3 BL_BLENDER_UP="$T/blender_up"
code=$?
if [ "$code" = 124 ] && [ ! -e "$O/ealive.log" ] && [ -d "$lock" ]; then
  ok "ealive: a 50-minute-old lock was not taken over while a Blender is alive"
else
  bad "ealive: exit $code"
fi
rm -f "$T/blender_up"
run_fast ealive2 "$lock" 30
code=$?
if [ "$code" = 0 ] && has "^start" "$O/ealive2.log"; then
  ok "ealive: taken over when the Blender was gone"
else
  bad "ealive2: exit $code"
fi
rmdir "$lock" 2>/dev/null
# a caller that makes a fresh lock while the wrapper is asking whether a Blender runs: the old order (age, ask,
# remove) removed it, so two Blenders ran
lock="$L/e_ask.lock"
hook="$T/hook_e_ask.sh"
cat >"$hook" <<EOF
#!/bin/bash
# another caller: the stale lock goes, a fresh one is made
rmdir "$lock" && mkdir "$lock"
EOF
stale_lock "$lock" 50
rm -f "$O/e_ask.log" "$hook.done"
bg e_ask "$lock" PATH="$SHIMPATH" FAKE_LOG="$O/e_ask.log" BL_ASK_HOOK="$hook" -- x
"$REALSLEEP" 3
if [ -e "$hook.done" ]; then
  ok "e_ask: the question was asked (the hook ran)"
else
  bad "e_ask: the question was not asked"
fi
if [ -d "$lock" ] && [ -n "$(find "$lock" -maxdepth 0 -mmin -5)" ] && [ ! -e "$O/e_ask.log" ] && alive "$W"; then
  ok "e_ask: the fresh lock another caller made while the question was asked stood; the wrapper went on waiting"
else
  bad "e_ask: the fresh lock was removed or the stand-in ran"
fi
if [ "$(grep -c waiting "$O/e_ask.err")" = 1 ]; then ok "e_ask: one waiting line"; else bad "e_ask: waiting lines"; fi
rmdir "$lock" 2>/dev/null
finish "$W" 30
if [ "$CODE" = 0 ] && has "^start" "$O/e_ask.log" && [ ! -e "$lock" ]; then
  ok "e_ask: and went on when that lock was freed"
else
  bad "e_ask: exit $CODE after the lock was freed"
fi
# the machine's own question and the wrapper's own 5 s poll
blender_up() { # true when a Blender runs on this machine now (someone else's: this test starts none)
  if [ -n "$WIN" ]; then
    tasklist 2>/dev/null | grep -qi '^blender\.exe'
  else
    pgrep -x blender >/dev/null 2>&1
  fi
}
if blender_up; then
  skip "e50real: a Blender of someone else is running now: the rule holds, so the take-over is untried here"
else
  lock="$L/e50real.lock"
  stale_lock "$lock" 50
  (cd "$T/elsewhere" && FAKE_LOG="$O/e50real.log" WDI_BLENDER_LOCK="$lock" \
    timeout -k 10 40 bash "$BL" stale >/dev/null 2>&1)
  code=$?
  if [ "$code" = 0 ] && has "^start" "$O/e50real.log" && [ ! -e "$lock" ]; then
    ok "e50real: taken over with the machine's own question and the wrapper's own poll"
  elif blender_up; then
    skip "e50real: a Blender of someone else started meanwhile: the rule holds, so the take-over is untried here"
    rmdir "$lock" 2>/dev/null
  else
    bad "e50real: exit $code"
    rmdir "$lock" 2>/dev/null
  fi
fi

echo "== F. callers at once run one after another"
lock="$L/f.lock"
rm -f "$O/f.log" "$O/f.exit"
FW=()
for i in 1 2 3; do
  bg "f$i" "$lock" PATH="$SHIMPATH" FAKE_LOG="$O/f.log" FAKE_SLEEP=1 EXPECT_LOCK="$lock" -- "caller$i"
  FW+=("$W")
done
for i in 1 2 3; do
  finish "${FW[$((i - 1))]}" 60
  echo "$i exit $CODE" >>"$O/f.exit"
done
ORDER="$(grep -E '^(start|end)' "$O/f.log" | sort -k2,2n | awk '{printf "%s ", $1}')"
if [ "$ORDER" = "start end start end start end " ] && [ "$(grep -c 'lock_held yes' "$O/f.log")" = 3 ] &&
  [ "$(grep -c 'exit 0' "$O/f.exit")" = 3 ] && [ ! -e "$lock" ]; then
  ok "f: 3 runs, never two alive at once, the lock held in each and freed at the end"
else
  bad "f: order '$ORDER', exits: $(tr '\n' ' ' <"$O/f.exit")"
fi
mkdir "$O/count"
crowd() { # <label> <lock>: 8 callers at once, a counter folder that shows two at the same time
  local label=$1 lock=$2 i w bads=0 ws=()
  rm -f "$O/$label.log"
  for i in 1 2 3 4 5 6 7 8; do
    bg "${label}_$i" "$lock" PATH="$SHIMPATH" FAKE_LOG="$O/$label.log" FAKE_MODE=count FAKE_COUNT="$O/count" \
      FAKE_SLEEP=0.1 -- "caller$i"
    ws+=("$W")
  done
  for w in "${ws[@]}"; do
    finish "$w" 60
    [ "$CODE" = 0 ] || bads=$((bads + 1))
  done
  if [ "$(grep -c '^start' "$O/$label.log")" = 8 ] && ! has overlap "$O/$label.log" && [ "$bads" = 0 ] &&
    [ ! -e "$lock" ]; then
    ok "$label: 8 callers at once ran 8 times, never two at the same time, all exit 0, the lock freed"
  else
    bad "$label: runs $(grep -c '^start' "$O/$label.log"), overlaps $(grep -c overlap "$O/$label.log"), bad exits $bads"
  fi
}
crowd f2_crowd "$L/f2.lock"
stale_lock "$L/f3.lock" 50
crowd f3_crowd_on_a_stale_lock "$L/f3.lock"

echo "== G. the default lock (no WDI_BLENDER_LOCK) passes the absolute-path test"
default_case() { # <label> <what is set> <folder> [NAME=value | -u NAME ...]: the default lock is made in the folder
  local label=$1 what=$2 folder=$3 code
  shift 3
  (cd "$T/elsewhere" && env "$@" FAKE_LOG="$O/$label.log" EXPECT_LOCK="$folder/wdi_blender.lock" \
    timeout -k 5 30 bash "$BL" "$label" >/dev/null 2>"$O/$label.err")
  code=$?
  if [ "$code" = 0 ] && has "lock_held yes" "$O/$label.log" && [ ! -e "$folder/wdi_blender.lock" ]; then
    ok "$label: $what: the lock is made in that folder, held, freed"
  else
    bad "$label: $what: exit $code: $(cat "$O/$label.err")"
  fi
}
default_case g1 "TMPDIR as a POSIX path" "$T/tmpd" TMPDIR="$T/tmpd"
if [ -n "$WIN" ]; then
  default_case g2 "no TMPDIR, TEMP as a Windows path" "$T/tmpw" -u TMPDIR TEMP="$(cygpath -w "$T/tmpw")"
else
  skip "g2: TEMP as a Windows path is Windows-only"
fi
default_case g3 "an empty WDI_BLENDER_LOCK means the default" "$T/tmpd" WDI_BLENDER_LOCK="" TMPDIR="$T/tmpd"
default_case g5 "only TMP set" "$T/tmpx" -u TMPDIR -u TEMP TMP="$T/tmpx"
(cd "$T/elsewhere" && TMPDIR="rel_tmp" FAKE_LOG="$O/g4.log" bash "$BL" default4 >/dev/null 2>"$O/g4.err")
code=$?
if [ "$code" = 2 ] && [ ! -e "$O/g4.log" ] && [ ! -e "$T/elsewhere/rel_tmp" ]; then
  ok "g4: a relative temp folder makes the default relative: refused too ($(cat "$O/g4.err"))"
else
  bad "g4: exit $code"
fi

echo "== I. stdin, stdout and stderr pass through"
(cd "$T/elsewhere" && printf 'one\ntwo\n' |
  FAKE_MODE=io WDI_BLENDER_LOCK="$L/i.lock" bash "$BL" x >"$O/i.out" 2>"$O/i.err")
code=$?
if [ "$code" = 3 ] && [ "$(cat "$O/i.out")" = "$(printf 'one\ntwo')" ] && [ "$(cat "$O/i.err")" = "to stderr" ] &&
  [ ! -e "$L/i.lock" ]; then
  ok "i: the pipe reached the stand-in's stdin, its stdout and stderr came out as they were, exit 3, nothing added"
else
  bad "i: exit $code, stdout [$(cat "$O/i.out")], stderr [$(cat "$O/i.err")]"
fi

echo "== H. a signal to the wrapper alone ends Blender, and the lock is freed only after"
sig_case() { # <label> <signal> <FAKE_MODE> <exit code wanted>
  local label=$1 sig=$2 mode=$3 want=$4 lock="$L/$1.lock" pidf="$O/$1.pid" log="$O/$1.log" c t0 bp=""
  rm -f "$pidf" "$log"
  # a bystander in the wrapper's process group, except where the whole group is signalled on purpose
  if [ "$sig" = GROUP ]; then BYST=""; else BYST="$O/$label.byst"; fi
  bg "$label" "$lock" FAKE_LOG="$log" FAKE_MODE="$mode" FAKE_SLEEP=60 FAKE_PID="$pidf" -- a
  BYST=""
  if ! wait_for 30 test -s "$pidf"; then
    bad "$label: the stand-in did not start"
    kill -KILL "$W" 2>/dev/null
    return
  fi
  c="$(cat "$pidf")"
  [ "$sig" = GROUP ] || bp="$(cat "$O/$label.byst")"
  t0="$(usec "$EPOCHREALTIME")"
  case "$sig" in
    GROUP) kill -TERM -- "-$W" ;; # the wrapper and the stand-in both, as a terminal's Ctrl-C or a group kill does
    *) kill -"$sig" "$W" ;;
  esac
  watch "$W" "$c" "$lock"
  finish "$W" 30
  SECS=$((($(usec "$EPOCHREALTIME") - t0) / 1000000))
  if [ "$CODE" = "$want" ]; then ok "$label: $sig: exit $CODE"; else bad "$label: exit $CODE, wanted $want"; fi
  if gone "$c"; then ok "$label: the stand-in is gone"; else bad "$label: the stand-in lives on (pid $c)"; fi
  if [ ! -e "$lock" ]; then ok "$label: the lock is freed"; else bad "$label: the lock is left"; fi
  if [ "$BADS" = 0 ]; then
    ok "$label: the lock was never freed while the stand-in lived ($SAMPLES looks, $BOTH with both)"
  else
    bad "$label: the lock was freed while the stand-in lived ($BADS of $SAMPLES looks)"
  fi
  if [ -n "$bp" ]; then
    if alive "$bp"; then
      ok "$label: a bystander in the wrapper's process group was left alone: only the stand-in's pid was signalled"
    else
      bad "$label: a bystander in the wrapper's process group was ended too"
    fi
    kill -KILL "$bp" 2>/dev/null
  fi
}
for sig in TERM INT HUP; do
  case "$sig" in TERM) want=143 ;; INT) want=130 ;; HUP) want=129 ;; esac
  if ! hears "$sig"; then
    skip "h1_$sig: $sig is ignored in this launch and there is no perl to reset it"
    continue
  fi
  sig_case "h1_$sig" "$sig" slow "$want"
  if [ "$BOTH" -ge 3 ]; then
    ok "h1_$sig: the stand-in took 1 s to end and the lock stood all that time"
  else
    bad "h1_$sig: only $BOTH looks with both"
  fi
done
sig_case h2_ignores TERM ignore 143
if [ "$SECS" -ge 4 ]; then
  ok "h2: TERM was ignored, KILL came after the wait ($SECS s)"
else
  bad "h2: ended after $SECS s"
fi
sig_case h3_group GROUP slow 143

# the wrapper's child is a Windows program when no shell stands between: its row in ps has the wrapper as parent, and
# /proc/<pid>/winpid is the Windows pid
native_child() { # <wrapper pid> <word in the program's name>: sets C
  C="$(ps | awk -v w="$1" -v m="$2" '$2 == w && index($0, m) {print $1; exit}')"
  [ -n "$C" ]
}
native_case() { # <label> <word in the program's name> <program> [arguments ...]
  local label=$1 word=$2 prog=$3 lock="$L/$1.lock" wp img
  shift 3
  bg "$label" "$lock" BLENDER="$prog" -- "$@"
  if ! wait_for 30 native_child "$W" "$word"; then
    bad "$label: no child of the wrapper that is $word"
    kill -KILL "$W" 2>/dev/null
    return
  fi
  echo "$C" >"$O/$label.pid"
  wp="$(cat "/proc/$C/winpid")"
  img="$(tasklist //FI "PID eq $wp" //NH 2>/dev/null | awk -v p="$wp" '$2 == p {print $1}')"
  case "$img" in
    "" | bash.exe) bad "$label: the child is not a Windows program (image [$img])" ;;
    *) ok "$label: the wrapper's child is a Windows program ($img, Windows pid $wp)" ;;
  esac
  kill -TERM "$W"
  watch "$W" "$C" "$lock"
  finish "$W" 30
  if [ "$CODE" = 143 ]; then ok "$label: TERM to the wrapper alone: exit 143"; else bad "$label: exit $CODE"; fi
  if gone "$C" && [ -z "$(tasklist //FI "PID eq $wp" //NH 2>/dev/null | awk -v p="$wp" '$2 == p')" ]; then
    ok "$label: the Windows program is gone"
  else
    bad "$label: the Windows program lives on (Windows pid $wp)"
  fi
  if [ ! -e "$lock" ]; then ok "$label: the lock is freed"; else bad "$label: the lock is left"; fi
  if [ "$BADS" = 0 ]; then
    ok "$label: the lock was never freed while the program lived ($SAMPLES looks)"
  else
    bad "$label: freed while it lived ($BADS looks)"
  fi
}
if [ -n "$WIN" ]; then
  PY=""
  for name in python3 python; do
    p="$(command -v "$name" 2>/dev/null)" || continue
    if "$p" -c "import time" >/dev/null 2>&1; then
      PY="$p"
      break
    fi
  done
  if [ -n "$PY" ]; then
    native_case h4_native_python python "$PY" -c "import time; time.sleep(60)"
  else
    native_case h4_native_ping ping "$(command -v ping)" -n 61 127.0.0.1
  fi
else
  skip "h4: a Windows program as the child is Windows-only"
fi

echo "== H5. Blender that cannot be ended: the lock stays, the wrapper says so"
lock="$L/h5.lock"
pidf="$O/h5.pid"
rm -f "$pidf" "$O/h5.log"
set -m
(
  # a kill that only looks (-0): the wrapper cannot end its child
  kill() { case "$1" in -0) builtin kill "$@" ;; *) return 0 ;; esac; }
  export -f kill
  cd "$T/elsewhere" && FAKE_LOG="$O/h5.log" FAKE_SLEEP=60 FAKE_PID="$pidf" WDI_BLENDER_LOCK="$lock" \
    exec bash "$BL" a >"$O/h5.out" 2>"$O/h5.err"
) &
W=$!
set +m
if wait_for 30 test -s "$pidf"; then
  c="$(cat "$pidf")"
  kill -TERM "$W"
  finish "$W" 60
  if [ "$CODE" = 143 ]; then ok "h5: exit 143"; else bad "h5: exit $CODE"; fi
  if has "could not end Blender (pid [0-9]*): the lock stays: $lock" "$O/h5.err"; then
    ok "h5: says so on stderr"
  else
    bad "h5: stderr: $(cat "$O/h5.err")"
  fi
  if [ -d "$lock" ] && alive "$c"; then
    ok "h5: the lock stays while the stand-in lives"
  else
    bad "h5: $(state "$lock" "$c")"
  fi
  reap "$pidf"
  wait_for 10 gone "$c"
  rmdir "$lock" 2>/dev/null
else
  bad "h5: the stand-in did not start"
  kill -KILL "$W" 2>/dev/null
fi

echo "== H6. TERM to a wrapper that is still waiting"
lock="$L/h6.lock"
rm -f "$O/h6.log"
mkdir "$lock"
bg h6 "$lock" FAKE_LOG="$O/h6.log" -- x
wait_for 20 grep -q waiting "$O/h6.err"
kill -TERM "$W"
finish "$W" 20
if [ "$CODE" = 143 ] && [ ! -e "$O/h6.log" ] && [ -d "$lock" ]; then
  ok "h6: ended with 143, the stand-in never started, the other caller's lock untouched"
else
  bad "h6: exit $CODE"
fi
rmdir "$lock" 2>/dev/null

echo "== H7. KILL cannot be caught: the stand-in runs on and the lock stays"
lock="$L/h7.lock"
pidf="$O/h7.pid"
rm -f "$pidf"
bg h7 "$lock" FAKE_LOG="$O/h7.log" FAKE_SLEEP=60 FAKE_PID="$pidf" -- a
if wait_for 30 test -s "$pidf"; then
  c="$(cat "$pidf")"
  kill -KILL "$W"
  finish "$W" 10
  if [ -d "$lock" ] && alive "$c"; then
    ok "h7: the wrapper is gone, the lock stays and the stand-in lives (the case the 40-minute rule is for)"
  else
    bad "h7: $(state "$lock" "$c")"
  fi
  reap "$pidf"
  wait_for 10 gone "$c"
  rmdir "$lock" 2>/dev/null
else
  bad "h7: the stand-in did not start"
  kill -KILL "$W" 2>/dev/null
fi

echo "== H8. Blender ended by someone else: its exit status passes through and the lock is freed"
lock="$L/h8.lock"
pidf="$O/h8.pid"
rm -f "$pidf"
bg h8 "$lock" FAKE_LOG="$O/h8.log" FAKE_SLEEP=60 FAKE_PID="$pidf" -- a
if wait_for 30 test -s "$pidf"; then
  c="$(cat "$pidf")"
  kill -TERM "$c"
  finish "$W" 30
  if [ "$CODE" = 143 ] && [ ! -e "$lock" ]; then
    ok "h8: the stand-in ended on TERM with 143: the wrapper ended with 143 and freed the lock"
  else
    bad "h8: exit $CODE, $(state "$lock" "$c")"
  fi
else
  bad "h8: the stand-in did not start"
  kill -KILL "$W" 2>/dev/null
fi

echo "== H9. a signal that lands while the wrapper's own mkdir runs: the lock that mkdir made is freed"
# The mkdir shim makes the folder and then keeps the wrapper in mkdir for 1.5 s. Bash holds the signal back until mkdir
# returns. A wrapper that acted on it then, before it knew that the lock was its own, left the lock behind.
mkdir_case() { # <signal> <exit code wanted>
  local sig=$1 want=$2 label="h9_mkdir_$1" lock="$L/h9_$1.lock"
  if ! hears "$sig"; then
    skip "$label: $sig is ignored in this launch and there is no perl to reset it"
    return
  fi
  rm -f "$O/$label.log"
  bg "$label" "$lock" PATH="$SHIMMK:$PATH" BL_MKDIR_DELAY=1.5 FAKE_LOG="$O/$label.log" -- a
  if ! wait_for 20 test -d "$lock"; then
    bad "$label: the wrapper made no lock"
    kill -KILL "$W" 2>/dev/null
    return
  fi
  kill -"$sig" "$W"
  finish "$W" 20
  if [ "$CODE" = "$want" ]; then ok "$label: $sig during mkdir: exit $CODE"; else bad "$label: exit $CODE not $want"; fi
  if [ ! -e "$lock" ]; then
    ok "$label: the lock is freed"
  else
    bad "$label: the lock is left behind"
    rmdir "$lock" 2>/dev/null
  fi
  if [ ! -e "$O/$label.log" ]; then ok "$label: the stand-in was not started"; else bad "$label: the stand-in ran"; fi
}
mkdir_case TERM 143
mkdir_case INT 130
mkdir_case HUP 129

echo "== H10. a signal that the caller started the wrapper with ignored cannot be caught: nothing happens"
# A background job of a script gets INT ignored; the stand-in inherits that too, so Blender runs on. TERM still works.
lock="$L/h10.lock"
pidf="$O/h10.pid"
rm -f "$pidf" "$O/h10.log"
set -m
(
  trap '' INT
  cd "$T/elsewhere" && FAKE_LOG="$O/h10.log" FAKE_SLEEP=60 FAKE_PID="$pidf" WDI_BLENDER_LOCK="$lock" \
    exec bash "$BL" a >"$O/h10.out" 2>"$O/h10.err"
) &
W=$!
set +m
if wait_for 30 test -s "$pidf"; then
  c="$(cat "$pidf")"
  kill -INT "$W"
  "$REALSLEEP" 1.5
  if alive "$W" && alive "$c" && [ -d "$lock" ]; then
    ok "h10: INT changed nothing: the wrapper waits, the stand-in runs on, the lock stands"
  else
    bad "h10: after INT: the wrapper $(alive "$W" && echo lives || echo is gone), $(state "$lock" "$c")"
  fi
  kill -TERM "$W"
  finish "$W" 30
  if [ "$CODE" = 143 ] && [ ! -e "$lock" ] && gone "$c"; then
    ok "h10: TERM then ended both as usual: exit 143, the stand-in gone, the lock freed"
  else
    bad "h10: after TERM: exit $CODE, $(state "$lock" "$c")"
  fi
  reap "$pidf"
else
  bad "h10: the stand-in did not start"
  kill -KILL "$W" 2>/dev/null
fi
rmdir "$lock" 2>/dev/null

left=""
for f in "$O"/*.pid "$O"/*.pid.nap "$O"/*.byst; do
  [ -f "$f" ] || continue
  for p in $(cat "$f"); do alive "$p" && left="$left $p"; done
done
if [ -z "$left" ]; then ok "no stand-in of this test is left running"; else bad "stand-ins left running:$left"; fi
[ -z "$SKIPPED" ] || echo "skipped:$SKIPPED"
echo "$PASS ok, $FAILN failed"
[ "$FAILN" = 0 ]
