"""Fail closed before browser work if the API can open a non-stack connection."""
import os
import socket
from safety import guard

guard()
with socket.socket() as blocked:
    try:
        # RFC 5737 documentation address; audit hook rejects BEFORE connecting.
        blocked.connect(('192.0.2.1', 443))
    except RuntimeError as error:
        assert str(error) == 'E2E blocked outbound connection'
    else:
        raise AssertionError('Outbound socket was not blocked')
for key, invalid in [('MONGO_URL', 'mongodb://localhost:27017'), ('DB_NAME', 'clinic')]:
    original = os.environ[key]
    os.environ[key] = invalid
    try:
        guard()
    except RuntimeError as error:
        assert 'E2E refuses' in str(error)
    else:
        raise AssertionError('Unsafe database configuration was accepted')
    finally:
        os.environ[key] = original
print('Safety checks PASS: external socket blocked before connect; foreign Mongo URL/database refused')
