"""Checagens locais e de CI que não acessam nem alteram produção."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


def main():
    tracked = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=ROOT, text=True).splitlines()
    failed = []
    secret = re.compile(rb"gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}")
    for name in sorted(set(tracked)):
        p = ROOT / name
        if not p.is_file() or name.startswith((".claude/", "uploads/", "docs/", "output/")):
            continue
        if re.search(r"(?:^|/)(?:\.env(?:\.|$)|config\..*\.local\.php$)|\.(?:p12|pem)$", name):
            failed.append("Segredo/configuração privada versionada: " + name)
        if p.stat().st_size < 4_000_000 and secret.search(p.read_bytes()):
            failed.append("Possível credencial em: " + name)
        cmd = ["node", "--check", name] if p.suffix == ".js" else ["php", "-l", name] if p.suffix == ".php" else None
        if cmd:
            result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
            if result.returncode:
                failed.append(name + ": " + result.stderr.strip() + result.stdout.strip())
    run("git", "diff", "--check")
    if failed:
        print("\n".join(failed), file=sys.stderr)
        raise SystemExit(1)
    print("PASS: sintaxe JS/PHP, caminhos privados e padrões de credenciais.")


if __name__ == "__main__":
    main()
