"""Linux file protection and atomic revocation tests; synthetic metadata only."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]
from reporting.grok_oauth import CLIENT_ID, SCOPES, OAuthError, OAuthFileStore


@unittest.skipUnless(os.name == "posix" and os.geteuid() == 0, "requires isolated Linux root test container")
class OAuthFileTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.parent = Path(self.directory.name)
        self.path = self.parent / "grok-oauth.json"
        self.store = OAuthFileStore(self.path)
        self.original = dict(version=1, client_id=CLIENT_ID, clinic_id="curai", owner_id="synthetic-owner",
            owner_login="alex", scopes=list(SCOPES), active=True, consented_at=None, expires_at=None,
            code_hash=None, code_expires_at=None, code_challenge=None, token_hash=None)
        self.path.write_text(json.dumps(self.original), encoding="utf-8")
        self.path.chmod(0o600)

    def test_exact_permissions_owner_and_no_symlinks(self):
        self.assertEqual(self.store.read(), self.original)
        for mode in (0o644, 0o660, 0o400, 0o000):
            self.path.chmod(mode)
            with self.assertRaises(OAuthError):
                self.store.read()
        self.path.chmod(0o600)
        for mode in (0o755, 0o770, 0o711):
            self.parent.chmod(mode)
            with self.assertRaises(OAuthError):
                self.store.read()
        self.parent.chmod(0o700)
        os.chown(self.path, 65534, 65534)
        with self.assertRaises(OAuthError):
            self.store.read()
        os.chown(self.path, 0, 0)
        target = self.parent / "other"
        self.path.rename(target)
        self.path.symlink_to(target)
        with self.assertRaises(OAuthError):
            self.store.read()
        self.path.unlink()
        target.rename(self.path)
        alias = self.parent / "alias"
        alias.symlink_to(self.parent, target_is_directory=True)
        with self.assertRaises(OAuthError):
            OAuthFileStore(alias / self.path.name).read()
        hardlink = self.parent / "hardlink"
        os.link(self.path, hardlink)
        with self.assertRaises(OAuthError):
            self.store.read()

    def test_missing_fifo_oversize_duplicates_invalid_utf8_never_create_or_block(self):
        self.path.unlink()
        with self.assertRaises(OAuthError):
            self.store.update(lambda row: row.update(active=False))
        self.assertFalse(self.path.exists())
        os.mkfifo(self.path, 0o600)
        with self.assertRaises(OAuthError):
            self.store.read()
        self.path.unlink()
        for raw in (b"x" * 4097, b"\xff", b'{"version":1,"version":1}', b'{"version":NaN}'):
            self.path.write_bytes(raw)
            self.path.chmod(0o600)
            with self.assertRaises(OAuthError):
                self.store.read()

    def test_atomic_update_rejects_invalid_state_and_retains_exact_file_mode(self):
        self.store.update(lambda row: row.update(active=False))
        self.assertFalse(self.store.read()["active"])
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        self.assertEqual(self.path.stat().st_uid, 0)
        saved = self.path.read_bytes()
        with self.assertRaises(OAuthError):
            self.store.update(lambda row: row.update(token_hash="plaintext"))
        self.assertEqual(self.path.read_bytes(), saved)
        with patch("os.replace", side_effect=OSError("synthetic write failure")):
            with self.assertRaises(OAuthError):
                self.store.update(lambda row: row.update(active=True))
        self.assertEqual(self.path.read_bytes(), saved)
        self.assertFalse(list(self.parent.glob(".grok-*")))

    def test_concurrent_updates_have_at_most_one_winner_and_no_lost_revocation(self):
        def consume(row):
            if not row["active"]:
                raise OAuthError("invalid_grant")
            row["active"] = False
        def attempt(_):
            try:
                self.store.update(consume)
                return True
            except OAuthError:
                return False
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, range(20)))
        self.assertEqual(sum(results), 1)
        self.assertFalse(self.store.read()["active"])

    def test_lock_file_must_be_protected_regular_single_link(self):
        lock = self.path.with_name(self.path.name + ".lock")
        lock.write_text("synthetic", encoding="utf-8")
        lock.chmod(0o644)
        with self.assertRaises(OAuthError):
            self.store.update(lambda row: row.update(active=False))
        lock.unlink()
        lock.symlink_to(self.path)
        with self.assertRaises(OAuthError):
            self.store.update(lambda row: row.update(active=False))
