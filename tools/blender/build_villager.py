"""Retired in round 5: the villager is the plain base of build_looks.py (`--look villager`, art plan 4.2).

This module only re-exports the shape helpers, which now live in look_parts.py, for static_common.py
(Session 5K's file) until it imports them from there; then it is deleted.
"""

from look_parts import box, frustum, ring  # noqa: F401
