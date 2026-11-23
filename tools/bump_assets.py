"""Atualiza ?v= de JS/CSS alterados, antes do commit, nos HTML versionados."""
from pathlib import Path
import hashlib
import re
import subprocess
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
changed = set(subprocess.check_output(["git", "diff", "HEAD", "--name-only"], cwd=ROOT, text=True).splitlines())
assets = {p: hashlib.sha256((ROOT/p).read_bytes()).hexdigest()[:12] for p in changed if p.endswith((".js", ".css")) and (ROOT/p).is_file() and p.startswith(("js/", "css/"))}
htmls = subprocess.check_output(["git", "ls-files", "*.html"], cwd=ROOT, text=True).splitlines()
for name in htmls:
    p = ROOT/name
    text = p.read_text(encoding="utf-8")
    def replace(match):
        url = match.group(2)
        if url.startswith(("http:", "https:", "//", "data:")):
            return match.group(0)
        clean = urlsplit(url).path.removeprefix("../").removeprefix("./").lstrip("/")
        if clean not in assets:
            return match.group(0)
        path = url.split("?", 1)[0].split("#", 1)[0]
        return match.group(1) + path + "?v=" + assets[clean] + match.group(3)
    updated = re.sub(r'((?:src|href)=")(.*?)(")', replace, text)
    if updated != text:
        p.write_text(updated, encoding="utf-8", newline="\n")
        print("Cache atualizado:", name)
