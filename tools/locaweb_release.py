"""Publicação incremental por FTPS, com comparação prévia, backup e retorno.

Sem remoção de diretórios, mirror, migração SQL ou upload de segredos/dados.
"""
import argparse
import datetime as dt
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import ssl
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STATE = ".soublu-release.json"
MAX_BYTES = 16 * 1024 * 1024
BLOCKED = re.compile(r"(?:^|/)(?:uploads|storage|certs|scratch|node_modules|\.git)(?:/|$)|(?:^|/)config\.[^/]*\.local\.(?:php|json)$|(?:^|/)\.env(?:\.|$)|(?:^|/)(?:migrate-|repair-|purge-|debug-|probe-|test[_-])|(?:remote-deploy|chunk-deploy|server-inventory|upload_test)\.php$", re.I)


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def digest(data):
    return hashlib.sha256(data).hexdigest() if data is not None else None


def safe_path(path):
    p = PurePosixPath(path)
    if not path or "\\" in path or p.is_absolute() or ".." in p.parts or BLOCKED.search(path):
        return False
    if path == ".htaccess":
        return True
    if p.parts[0] == "api":
        return p.suffix == ".php" or p.name == ".htaccess"
    if p.parts[0] in {"js", "css", "images", "pages"}:
        return p.suffix.lower() in {".js", ".css", ".html", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp", ".woff", ".woff2"}
    return len(p.parts) == 1 and p.suffix == ".html" and not p.name.startswith(("_", "debug", "test"))


def plan(base, target):
    for ref in (base, target):
        if not re.fullmatch(r"[a-f0-9]{40}", ref):
            raise ValueError("Use o SHA completo de 40 caracteres.")
    subprocess.run(["git", "merge-base", "--is-ancestor", base, target], cwd=ROOT, check=True)
    changes = git("diff", "--name-status", "--no-renames", base, target).decode().splitlines()
    allowed = set(json.loads((ROOT / "deploy/allowed-paths.json").read_text(encoding="utf-8"))["paths"])
    files, skipped = [], []
    for line in changes:
        kind, path = line.split("\t", 1)
        if not safe_path(path):
            skipped.append(path)
            continue
        if path not in allowed:
            raise ValueError("Arquivo de runtime fora da lista revisada: " + path)
        if kind == "D":
            raise ValueError("Remoção de arquivo de runtime exige procedimento separado: " + path)
        files.append(path)
    return sorted(files, key=lambda p: (p.endswith(".html"), not p.startswith("api/lib/"), p)), skipped


def blob(ref, path):
    p = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=ROOT, capture_output=True)
    return p.stdout if p.returncode == 0 else None


class Store:
    def __init__(self, ftp):
        self.ftp = ftp

    def read(self, path):
        result = bytearray()
        def chunk(data):
            result.extend(data)
            if len(result) > MAX_BYTES:
                raise ValueError("Arquivo excede limite de código: " + path)
        try:
            self.ftp.retrbinary("RETR " + path, chunk)
        except ftplib.error_perm as e:
            # 550 também pode significar permissão negada: só considerar ausente
            # se o diretório puder ser listado e o arquivo não constar nele.
            if not str(e).startswith("550"):
                raise
            parent, name = path.rsplit("/", 1)
            entries = self.ftp.nlst(parent or "/")
            if any(PurePosixPath(x).name == name for x in entries):
                raise RuntimeError("Arquivo existe mas não pôde ser lido: " + path) from e
            return None
        return bytes(result)

    def mkdirs(self, path):
        current = ""
        for part in PurePosixPath(path).parts:
            if part == "/":
                current = "/"
                continue
            current = current.rstrip("/") + "/" + part
            try:
                self.ftp.mkd(current)
            except ftplib.error_perm:
                previous = self.ftp.pwd()
                self.ftp.cwd(current)  # falhar se o diretório realmente não existe
                self.ftp.cwd(previous)

    def write(self, path, data):
        self.mkdirs(str(PurePosixPath(path).parent))
        self.ftp.storbinary("STOR " + path, io.BytesIO(data))
        if self.read(path) != data:
            raise RuntimeError("Verificação de gravação falhou: " + path)

    def promote(self, staged, target):
        self.mkdirs(str(PurePosixPath(target).parent))
        self.ftp.rename(staged, target)

    def remove(self, path):
        self.ftp.delete(path)


def roots(webroot, backup):
    webroot, backup = webroot.rstrip("/"), backup.rstrip("/")
    if not webroot or not backup or not webroot.startswith("/") or not backup.startswith("/"):
        raise ValueError("Informe raízes absolutas, distintas, sem usar / como public_html.")
    if ".." in PurePosixPath(webroot).parts + PurePosixPath(backup).parts:
        raise ValueError("Raiz inválida")
    if backup == webroot or backup.startswith(webroot + "/") or webroot.startswith(backup + "/"):
        raise ValueError("Backups devem ficar FORA de public_html e separados do runtime.")
    return webroot, backup


def release(store, webroot, backup, base, target, files, publish=False):
    webroot, backup = roots(webroot, backup)
    current_raw = store.read(webroot + "/" + STATE)
    current = json.loads(current_raw) if current_raw else None
    if current and current.get("commit") != base:
        raise ValueError("O servidor já está em outro commit. Atualize base_sha.")
    initial = (ROOT / "deploy/current-production-ref").read_text().strip()
    if not current and base != initial:
        raise ValueError("Primeira publicação deve partir do SHA da reconciliação.")
    originals, desired = {}, {}
    for path in files:
        if not safe_path(path):
            raise ValueError("Caminho proibido: " + path)
        before, after = store.read(webroot + "/" + path), blob(target, path)
        if after is None or len(after) > MAX_BYTES:
            raise ValueError("Conteúdo de destino inválido: " + path)
        expected = blob(base, path)
        if before != expected:
            raise ValueError("Divergência em produção; exporte e reconcilie antes: " + path)
        originals[path], desired[path] = before, after
    if not publish:
        return {"mode": "plan", "base": base, "target": target, "files": files, "preflight": "passed"}
    if not files:
        return {"mode": "publish", "files": [], "result": "nenhum runtime alterado"}
    rid = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + target[:12]
    folder = backup + "/" + rid
    index = {"id": rid, "base": base, "commit": target, "previous_state": current,
             "files": {p: {"before": digest(originals[p]), "after": digest(desired[p])} for p in files}}
    # Todas as cópias e estágios são verificados fora do diretório público.
    for path in files:
        if originals[path] is not None:
            store.write(folder + "/before/" + path, originals[path])
        store.write(folder + "/stage/" + path, desired[path])
    store.write(folder + "/index.json", json.dumps(index, indent=2).encode())
    promoted = []
    try:
        for path in files:
            if store.read(webroot + "/" + path) != originals[path]:
                raise ValueError("Arquivo mudou durante a publicação: " + path)
            store.promote(folder + "/stage/" + path, webroot + "/" + path)
            promoted.append(path)
            if store.read(webroot + "/" + path) != desired[path]:
                raise RuntimeError("Conteúdo publicado não confere: " + path)
        state = {"commit": target, "previous_commit": base, "release_id": rid,
                 "files": {p: digest(desired[p]) for p in files}}
        store.write(folder + "/stage-state.json", json.dumps(state).encode())
        store.promote(folder + "/stage-state.json", webroot + "/" + STATE)
    except Exception:
        for path in reversed(promoted):
            if store.read(webroot + "/" + path) != desired[path]:
                raise RuntimeError("Retorno interrompido por alteração concorrente: " + path)
            if originals[path] is None:
                store.remove(webroot + "/" + path)
            else:
                store.write(folder + "/restore/" + path, originals[path])
                store.promote(folder + "/restore/" + path, webroot + "/" + path)
        raise
    return {"mode": "publish", "commit": target, "release_id": rid, "files": files, "verified": True}


def rollback(store, webroot, backup, rid):
    webroot, backup = roots(webroot, backup)
    if not re.fullmatch(r"\d{8}T\d{6}Z-[a-f0-9]{12}", rid):
        raise ValueError("ID de release inválido")
    state = json.loads(store.read(webroot + "/" + STATE) or b"{}")
    if state.get("release_id") != rid:
        raise ValueError("Só é permitido reverter a release mais recente.")
    folder = backup + "/" + rid
    index = json.loads(store.read(folder + "/index.json") or b"{}")
    if index.get("id") != rid or index.get("commit") != state.get("commit"):
        raise ValueError("Índice de backup não confere")
    restored = {}
    for path, info in index["files"].items():
        if not safe_path(path) or digest(store.read(webroot + "/" + path)) != info["after"]:
            raise ValueError("Divergência impede retorno: " + path)
        data = store.read(folder + "/before/" + path) if info["before"] is not None else None
        if digest(data) != info["before"]:
            raise ValueError("Backup não confere: " + path)
        restored[path] = data
    for path, data in restored.items():
        if data is None:
            store.remove(webroot + "/" + path)
        else:
            store.write(folder + "/rollback-stage/" + path, data)
            store.promote(folder + "/rollback-stage/" + path, webroot + "/" + path)
    previous = index.get("previous_state")
    if previous:
        store.write(folder + "/previous-state.json", json.dumps(previous).encode())
        store.promote(folder + "/previous-state.json", webroot + "/" + STATE)
    else:
        store.remove(webroot + "/" + STATE)
    return {"mode": "rollback", "release_id": rid, "commit": index["base"], "verified": True}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("mode", choices=["plan", "publish", "rollback"])
    p.add_argument("--base", default="")
    p.add_argument("--target", default="")
    p.add_argument("--release-id", default="")
    p.add_argument("--offline", action="store_true")
    args = p.parse_args()
    target = args.target or git("rev-parse", "HEAD").decode().strip()
    base = args.base or (ROOT / "deploy/current-production-ref").read_text().strip()
    files, skipped = plan(base, target) if args.mode != "rollback" else ([], [])
    if args.offline:
        if args.mode != "plan":
            p.error("--offline só pode ser usado em plan")
        print(json.dumps({"mode": "offline-plan", "base": base, "target": target, "files": files, "skipped": skipped, "remote_checked": False}, indent=2))
        return
    required = ["LOCAWEB_FTP_HOST", "LOCAWEB_FTP_USER", "LOCAWEB_FTP_PASSWORD", "LOCAWEB_WEBROOT", "LOCAWEB_BACKUP_ROOT"]
    if any(not os.environ.get(k) for k in required):
        p.error("Cadastre os segredos e variáveis LOCAWEB documentados no guia.")
    with ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=45) as ftp:
        ftp.connect(os.environ[required[0]], int(os.environ.get("LOCAWEB_FTP_PORT") or "21"))
        ftp.login(os.environ[required[1]], os.environ[required[2]])
        ftp.prot_p()  # dados também criptografados; nunca recuar para FTP sem TLS
        store = Store(ftp)
        webroot, backup = os.environ[required[3]], os.environ[required[4]]
        result = rollback(store, webroot, backup, args.release_id) if args.mode == "rollback" else release(store, webroot, backup, base, target, files, args.mode == "publish")
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
