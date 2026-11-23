"""Confere os hashes de todos os fontes recuperados no commit da reconciliação."""
from pathlib import Path
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parents[1]
ref = (root / "deploy/initial-production-ref").read_text().strip()
manifest = json.loads((root / "deploy/production-baseline.json").read_text(encoding="utf-8"))
entries = [(p, v) for p, v in manifest["files"].items() if v["status"].startswith("verified")]
data = subprocess.check_output(["git", "cat-file", "--batch"], cwd=root, input=("\n".join(ref + ":" + p for p, _ in entries) + "\n").encode())
offset, bad = 0, []
for path, info in entries:
    end = data.index(b"\n", offset)
    header = data[offset:end].split()
    if len(header) != 3 or header[1] != b"blob":
        raise SystemExit("Fonte ausente no commit-base: " + path)
    size = int(header[2])
    content = data[end+1:end+1+size]
    offset = end+size+2
    if hashlib.sha256(content).hexdigest() != info["sha256"]:
        bad.append(path)
if bad:
    raise SystemExit("Hashes divergentes: " + ", ".join(bad))
print(f"PASS: {len(entries)} fontes conferem com os hashes capturados da produção.")
