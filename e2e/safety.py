"""Test-process-only guard. Production modules and auth are unmodified."""
import ipaddress
import os
import socket
import sys


def guard():
    if os.environ.get('MONGO_URL') != 'mongodb://mongo:27017' or os.environ.get('DB_NAME') != 'medcrm_browser_e2e':
        raise RuntimeError('E2E refuses any MongoDB except its disposable mongo/medcrm_browser_e2e')
    mongo_ip = socket.gethostbyname('mongo')

    def audit(event, args):
        if event != 'socket.connect':
            return
        address = args[1]
        if not isinstance(address, tuple):
            raise RuntimeError('E2E blocked non-TCP outbound connection')
        host, port = address[:2]
        if host in ('mongo', mongo_ip) and port == 27017:
            return
        try:
            if ipaddress.ip_address(host).is_loopback and port == 8001:
                return
        except ValueError:
            pass
        raise RuntimeError('E2E blocked outbound connection')

    sys.addaudithook(audit)
