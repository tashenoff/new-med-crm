"""Security regression: credentials must not survive artifact/trace collection."""
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from run import sanitize, publish_artifacts
from unittest.mock import patch


class ArtifactSanitization(unittest.TestCase):
    def test_redacts_credentials_and_jwt_inside_and_outside_trace(self):
        session = {'password': 'temporary-password-value', 'jwt_key': 'temporary-jwt-key'}
        jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJlMmUifQ.signature'
        record = json.dumps({**session, 'Authorization': 'Bearer ' + jwt}).encode()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'stack.log').write_bytes(record)
            with zipfile.ZipFile(root / 'trace.zip', 'w') as archive:
                archive.writestr('trace.network', record)
                archive.writestr('resources/image.png', b'\x89PNG\xffbinary')
            sanitize(root, session)
            with zipfile.ZipFile(root / 'trace.zip') as archive:
                records = [archive.read('trace.network'), (root / 'stack.log').read_bytes()]
                self.assertEqual(archive.read('resources/image.png'), b'\x89PNG\xffbinary')
            for sanitized in records:
                for value in [*session.values(), jwt]:
                    self.assertNotIn(value.encode(), sanitized)
                self.assertIn(b'[REDACTED_JWT]', sanitized)
                json.loads(sanitized)

    def test_binary_resource_cannot_bypass_secret_redaction(self):
        session = {'password': 'binary-password', 'jwt_key': 'binary-signing-key'}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'resource.bin').write_bytes(b'\xff' + session['password'].encode())
            publish_artifacts(root, session)
            self.assertNotIn(session['password'].encode(), (root / 'published/resource.bin').read_bytes())
            self.assertTrue((root / 'published/SANITIZED.json').exists())

    def test_sanitizer_failure_withholds_upload_directory(self):
        session = {'password': 'secret-password', 'jwt_key': 'secret-key'}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'raw.log').write_text(session['password'])
            with patch('run.sanitize', side_effect=OSError('simulated read failure')):
                with self.assertRaises(OSError):
                    publish_artifacts(root, session)
            self.assertFalse((root / 'published').exists())

    def test_corrupt_trace_withholds_upload_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'trace.zip').write_bytes(b'broken archive')
            with self.assertRaises(RuntimeError):
                publish_artifacts(root, {'password': 'secret-password', 'jwt_key': 'secret-key'})
            self.assertFalse((root / 'published').exists())


if __name__ == '__main__':
    unittest.main()
