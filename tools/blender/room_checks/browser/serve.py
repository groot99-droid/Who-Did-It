"""Local server for the room checks' browser pages (127.0.0.1 only). Read-only on the build.

GET  /<file>              this folder (fp_look.html, r7_walk.html and their scripts)
GET  /glb/<name>.glb      <build>/<name>.glb
GET  /still/<name>.png    <build>/<name>.png (the builder's stills)
GET  /rooms/<id>.json     ../rooms/<id>.json (the room's own numbers; its sweep points)
GET  /out/<file>          <out>/<file> (reach.json for r7_walk.html)
POST /save?name=<file>    writes the body to <out>/<file> (the pages' frames and results)

A <file> is a plain name: letters, digits, _ . -, not starting with a dot (so never . or ..); any other name gets 400.
A post must come from the pages themselves: one whose Origin header is not this server's own (http://127.0.0.1:<port>
or http://localhost:<port>) gets 403, so a page from elsewhere open in the same browser cannot write into <out>. A post
without an Origin header (curl, a script) is let through.

Usage: python -I tools/blender/room_checks/browser/serve.py <roomId> [--build DIR] [--out DIR] [--port N]
    --build  the folder of the room's GLB    default tools/blender/build/rooms
    --out    where the pages' results go     default tools/blender/build/rooms/checks/<roomId>/browser (git-ignored)
    --port   default 8838
Stop it with Ctrl+C when the pages are closed.
"""
import argparse
import http.server
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", "..", "..", ".."))
ROOMS_CFG = os.path.normpath(os.path.join(HERE, "..", "rooms"))

ap = argparse.ArgumentParser(description="Local server for the room checks' browser pages.")
ap.add_argument("room")
ap.add_argument("--build")
ap.add_argument("--out")
ap.add_argument("--port", type=int, default=8838)
A = ap.parse_args()
if not re.fullmatch(r"[A-Za-z0-9_]+", A.room):
    ap.error("the room id is a scene id (letters, digits, _): " + A.room)
BUILD = A.build or os.path.join(REPO, "tools", "blender", "build", "rooms")
OUT = A.out or os.path.join(REPO, "tools", "blender", "build", "rooms", "checks", A.room, "browser")
os.makedirs(OUT, exist_ok=True)
FILE = r"[A-Za-z0-9_-][A-Za-z0-9_.-]*"                   # a plain file name: no folder, not . or ..
OWN = {f"http://127.0.0.1:{A.port}", f"http://localhost:{A.port}"}      # the pages' own origins
ROUTES = ((r"^/glb/(" + FILE + r"\.glb)$", BUILD), (r"^/still/(" + FILE + r"\.png)$", BUILD),
          (r"^/rooms/(" + FILE + r"\.json)$", ROOMS_CFG), (r"^/out/(" + FILE + r")$", OUT))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=HERE, **k)

    def translate_path(self, path):
        p = path.split("?")[0]
        for pattern, folder in ROUTES:
            m = re.match(pattern, p)
            if m:
                return os.path.join(folder, m.group(1))
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        origin = self.headers.get("Origin")
        if origin is not None and origin not in OWN:
            self.send_error(403, "a post from another origin than this server's")
            return
        m = re.match(r"^/save\?name=(" + FILE + r")$", self.path)
        if not m:
            self.send_error(400, "the name is not a plain file name")
            return
        n = int(self.headers.get("Content-Length", "0"))
        data = self.rfile.read(n)
        try:
            with open(os.path.join(OUT, m.group(1)), "wb") as fh:
                fh.write(data)
        except OSError:
            self.send_error(500, "the file could not be written")
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, fmt, *args):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", A.port), Handler).serve_forever()
