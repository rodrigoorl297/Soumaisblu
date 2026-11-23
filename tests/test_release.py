import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("release", ROOT / "tools/locaweb_release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
BASE, TARGET = "a" * 40, "b" * 40


class FakeStore:
    def __init__(self, values=None):
        self.data = dict(values or {})
        self.writes = []
        self.fail_once = None

    def read(self, path):
        return self.data.get(path)

    def write(self, path, data):
        self.writes.append(path)
        self.data[path] = data

    def promote(self, source, target):
        if self.fail_once == target:
            self.fail_once = None
            raise RuntimeError("simulated FTP failure")
        self.data[target] = self.data.pop(source)

    def remove(self, path):
        del self.data[path]


class ReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "deploy").mkdir()
        (self.root / "deploy/initial-production-ref").write_text(BASE)
        self.root_patch = patch.object(release, "ROOT", self.root)
        self.root_patch.start()
        self.blob_patch = patch.object(release, "blob", side_effect=lambda ref, p: b"old" if ref == BASE else b"new")
        self.blob_patch.start()

    def tearDown(self):
        self.blob_patch.stop()
        self.root_patch.stop()
        self.temp.cleanup()

    def test_no_data_or_maintenance_upload(self):
        for path in ["uploads/client.pdf", "storage/cache.php", "config.db.local.php", "../index.html", "api/purge-users.php", "api/remote-deploy.php", "api/chunk-deploy.php", "api/server-inventory.php", "C:\\foo.js", "/js/db.js"]:
            self.assertFalse(release.safe_path(path), path)
        for path in ["js/db.js", "js/config.js", "pages/admin.html", "api/upload.php", "css/global.css"]:
            self.assertTrue(release.safe_path(path), path)

    def test_backups_must_be_outside_public_root(self):
        with self.assertRaises(ValueError):
            release.roots("/public_html", "/public_html/backups")
        with self.assertRaises(ValueError):
            release.roots("/", "/backups")

    def test_plan_never_writes(self):
        store = FakeStore({"/public_html/js/db.js": b"old"})
        result = release.release(store, "/public_html", "/backup", BASE, TARGET, ["js/db.js"])
        self.assertEqual(result["preflight"], "passed")
        self.assertEqual(store.writes, [])

    def test_drift_blocks_every_write(self):
        store = FakeStore({"/public_html/js/db.js": b"server hotfix"})
        with self.assertRaisesRegex(ValueError, "Divergência"):
            release.release(store, "/public_html", "/backup", BASE, TARGET, ["js/db.js"], True)
        self.assertEqual(store.writes, [])

    def test_publish_and_latest_rollback_preserve_data(self):
        values = {"/public_html/js/db.js": b"old", "/public_html/uploads/client.pdf": b"private", "/public_html/config.db.local.php": b"secret"}
        store = FakeStore(values)
        result = release.release(store, "/public_html", "/backup", BASE, TARGET, ["js/db.js"], True)
        self.assertEqual(store.data["/public_html/js/db.js"], b"new")
        self.assertEqual(store.data["/backup/" + result["release_id"] + "/before/js/db.js"], b"old")
        release.rollback(store, "/public_html", "/backup", result["release_id"])
        self.assertEqual(store.data, {**store.data, **values})
        self.assertNotIn("/public_html/" + release.STATE, store.data)

    def test_failure_restores_already_promoted_files(self):
        store = FakeStore({"/public_html/js/a.js": b"old", "/public_html/js/b.js": b"old"})
        store.fail_once = "/public_html/js/b.js"
        with self.assertRaisesRegex(RuntimeError, "simulated"):
            release.release(store, "/public_html", "/backup", BASE, TARGET, ["js/a.js", "js/b.js"], True)
        self.assertEqual(store.data["/public_html/js/a.js"], b"old")
        self.assertEqual(store.data["/public_html/js/b.js"], b"old")

    def test_changed_server_blocks_rollback(self):
        store = FakeStore({"/public_html/js/db.js": b"old"})
        result = release.release(store, "/public_html", "/backup", BASE, TARGET, ["js/db.js"], True)
        store.data["/public_html/js/db.js"] = b"another hotfix"
        with self.assertRaisesRegex(ValueError, "Divergência"):
            release.rollback(store, "/public_html", "/backup", result["release_id"])
        self.assertEqual(store.data["/public_html/js/db.js"], b"another hotfix")


if __name__ == "__main__":
    unittest.main()
