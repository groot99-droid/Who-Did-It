#!/usr/bin/env bash
# Installs what the render scripts and the bpy tests need without a Blender install (round 11, T1):
# the `bpy` 5.2.0 wheel (Python 3.13) in a venv, and the EGL / X libraries EEVEE loads headless.
# Used by the `blender` CI job and by render sessions in a fresh cloud container. Safe to run twice.
#   bash tools/blender/setup.sh            # venv at tools/blender/.venv
#   WDI_BPY_VENV=/path bash tools/blender/setup.sh
# Then: tools/blender/.venv/bin/python tools/blender/batch_render.py -- ...   (EGL_PLATFORM=surfaceless)
set -euo pipefail

BPY_VERSION="5.2.0"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${WDI_BPY_VENV:-$HERE/.venv}"
PY="${WDI_PYTHON:-python3.13}"
command -v "$PY" >/dev/null 2>&1 || PY=python3

PKGS=(libegl1 libgl1 libxi6 libxkbcommon0 libsm6 libxxf86vm1 libxfixes3 libxrender1)
if ! command -v dpkg >/dev/null 2>&1; then
  echo "setup.sh: not a Debian-family system; install the EGL/X libraries yourself: ${PKGS[*]}" >&2
else
  missing=()
  for p in "${PKGS[@]}"; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
  if [ "${#missing[@]}" -gt 0 ]; then
    SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"
    $SUDO apt-get update -qq
    DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq --no-install-recommends "${missing[@]}"
  fi
fi

# The wheel is cp313 only. A runner whose python3 is older (ubuntu-latest ships 3.12) gets 3.13 from uv.
have_313() { "$1" -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 13) else 1)' 2>/dev/null; }
USE_UV=0
if ! have_313 "$PY"; then
  USE_UV=1
  python3 -m pip install --quiet --user uv 2>/dev/null || python3 -m pip install --quiet uv
  export PATH="$HOME/.local/bin:$PATH"
fi
if [ ! -x "$VENV/bin/python" ]; then
  if [ "$USE_UV" -eq 1 ]; then uv venv --quiet --python 3.13 "$VENV"; else "$PY" -m venv "$VENV"; fi
fi
if ! "$VENV/bin/python" -c "import bpy,sys; sys.exit(0 if bpy.app.version_string.startswith('$BPY_VERSION') else 1)" 2>/dev/null; then
  if [ "$USE_UV" -eq 1 ]; then
    uv pip install --quiet --python "$VENV/bin/python" "bpy==$BPY_VERSION"
  else
    "$VENV/bin/python" -m pip install --quiet --upgrade pip
    "$VENV/bin/python" -m pip install --quiet "bpy==$BPY_VERSION"
  fi
fi

EGL_PLATFORM=surfaceless "$VENV/bin/python" -c "import bpy; print('bpy', bpy.app.version_string, 'ready in $VENV')"
