#!/usr/bin/env python3
"""One command for local/cloud Docker: python3 e2e/run.py [--frontend-ref HEAD | --backend-ref HEAD]."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
from urllib.parse import urlparse
import subprocess
import sys
import tempfile
import uuid
import zipfile

ROOT = Path(__file__).resolve().parent.parent
HARNESS = ROOT / 'e2e'


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True).strip()


JWT = rb'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'


def redact(data, sensitive):
    # Apply to binary resources too: an undecodable resource must not bypass scrub.
    for value in sensitive:
        data = data.replace(value.encode(), b'[REDACTED]')
    return re.sub(JWT, b'[REDACTED_JWT]', data)


def sanitize(directory, session):
    sensitive = [session['password'], session['jwt_key']]
    for path in directory.rglob('*'):
        if not path.is_file():
            continue
        if path.suffix == '.zip' and not zipfile.is_zipfile(path):
            raise RuntimeError('Cannot sanitize a corrupt trace archive')
        if zipfile.is_zipfile(path):
            replacement = path.with_suffix('.clean')
            with zipfile.ZipFile(path) as source, zipfile.ZipFile(replacement, 'w', zipfile.ZIP_DEFLATED) as target:
                for info in source.infolist():
                    target.writestr(info, redact(source.read(info.filename), sensitive))
            replacement.replace(path)
        else:
            path.write_bytes(redact(path.read_bytes(), sensitive))


def publish_artifacts(directory, session):
    """Only this atomically published, verified directory is uploaded by CI."""
    sanitize(directory, session)
    sensitive = [value.encode() for value in session.values()]
    files = [path for path in directory.iterdir() if path.is_file()]
    for path in files:
        if zipfile.is_zipfile(path):
            with zipfile.ZipFile(path) as archive:
                if archive.testzip():
                    raise RuntimeError('Artifact archive integrity check failed')
                records = [archive.read(name) for name in archive.namelist()]
        else:
            records = [path.read_bytes()]
        if any(re.search(JWT, data) or any(value in data for value in sensitive) for data in records):
            raise RuntimeError('Artifact credential scan failed; upload withheld')
    staging = directory / '.publish.tmp'
    staging.mkdir()
    manifest = {}
    for path in files:
        shutil.copyfile(path, staging / path.name)
        manifest[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    (staging / 'SANITIZED.json').write_text(json.dumps({'files_sha256': manifest}, indent=2) + '\n')
    staging.rename(directory / 'published')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frontend-ref', default='refs/remotes/origin/main')
    parser.add_argument('--backend-ref', default='refs/remotes/origin/ref-2')
    parser.add_argument('--no-fetch', action='store_true', help='Use already fetched objects (offline/reproduction)')
    args = parser.parse_args()
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    output = ROOT / 'e2e-artifacts' / run_id
    output.mkdir(parents=True)
    project = 'medcrm-e2e-' + uuid.uuid4().hex[:12]
    session = {'password': secrets.token_urlsafe(24), 'jwt_key': secrets.token_urlsafe(48)}
    metadata = {'run_id': run_id, 'project': project, 'status': 'starting',
                'frontend_ref': args.frontend_ref, 'backend_ref': args.backend_ref,
                'harness_sha': git('rev-parse', 'HEAD'),
                'harness_files_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                         for p in HARNESS.iterdir() if p.is_file()},
                'database': 'medcrm_browser_e2e', 'runtime_network': 'internal',
                'scope': 'ordinary service 3000 KZT / fixed compensation 1000 KZT'}
    log = (output / 'runner.log').open('w')
    worktrees = []
    compose = None
    env = None
    exit_code = 1

    def save():
        (output / 'run.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')

    def command(argv, *, check=True, timeout=1200):
        print('E2E:', ' '.join(map(str, argv)), flush=True)
        result = subprocess.run(list(map(str, argv)), cwd=ROOT, env=env,
                                stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
        log.flush()
        if check and result.returncode:
            raise RuntimeError(f'Command failed ({result.returncode}): {" ".join(map(str, argv))}; see runner.log')
        return result.returncode

    def interrupted(signum, frame):
        raise RuntimeError(f'Interrupted by signal {signum}; cleaning temporary resources')

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        with tempfile.TemporaryDirectory(prefix='medcrm-e2e-') as temporary:
            temp = Path(temporary)
            secret_file = temp / 'session.json'
            secret_file.write_text(json.dumps(session))
            secret_file.chmod(0o600)
            build_ca = temp / 'build-ca.crt'
            certificate = os.environ.get('E2E_BUILD_CA') or os.environ.get('CODEX_PROXY_CERT')
            build_ca.write_bytes(Path(certificate).read_bytes() if certificate else b'')
            if not args.no_fetch:
                command(['git', 'fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main',
                         '+refs/heads/ref-2:refs/remotes/origin/ref-2'])
            for side, ref in [('frontend', args.frontend_ref), ('backend', args.backend_ref)]:
                sha = git('rev-parse', '--verify', ref + '^{commit}')
                if not re.fullmatch('[a-f0-9]{40}', sha):
                    raise RuntimeError('Expected an exact 40-character source SHA')
                metadata[side + '_sha'] = sha
                source = temp / side
                command(['git', 'worktree', 'add', '--detach', source, sha])
                worktrees.append(source)
            env = {**os.environ, 'HARNESS': str(HARNESS), 'SESSION_FILE': str(secret_file),
                   'FRONTEND_SOURCE': str(temp / 'frontend'), 'BACKEND_SOURCE': str(temp / 'backend'),
                   'DOCKER_CONFIG': str(temp / 'docker-config'), 'BUILD_CA_FILE': str(build_ca),
                   'BUILD_NETWORK': os.environ.get('E2E_BUILD_NETWORK', 'host' if certificate else 'default')}
            proxy_host = urlparse(os.environ.get('HTTPS_PROXY', '')).hostname
            if certificate and proxy_host:
                env.update(BUILD_PROXY_HOST=proxy_host, BUILD_PROXY_IP=socket.gethostbyname(proxy_host))
            compose = ['docker', 'compose', '--env-file', '/dev/null', '-p', project, '-f', str(HARNESS / 'compose.yml')]
            metadata['status'] = 'running'
            save()
            print(f'Artifacts: {output}\nFrontend: {metadata["frontend_sha"]}\nBackend: {metadata["backend_sha"]}', flush=True)
            try:
                command(compose + ['build'])
                command(compose + ['up', '-d', '--wait', '--wait-timeout', '120', 'mongo'])
                command(compose + ['run', '--rm', '--no-deps', 'api', 'python', '/harness/seed.py'])
                command(compose + ['up', '-d', '--wait', '--wait-timeout', '180', 'api', 'web'])
                command(compose + ['exec', '-T', 'api', 'python', '/harness/check_safety.py'])
                freeze = subprocess.check_output(compose + ['exec', '-T', 'api', 'pip', 'freeze'], env=env)
                (output / 'backend-dependencies.txt').write_bytes(freeze)
                network = json.loads(subprocess.check_output(['docker', 'network', 'inspect', project + '_isolated'], env=env))[0]
                if not network['Internal']:
                    raise RuntimeError('Runtime network must be internal')
                ids = subprocess.check_output(compose + ['ps', '-q'], env=env, text=True).split()
                runtime = json.loads(subprocess.check_output(['docker', 'inspect', *ids], env=env))
                metadata['runtime'] = []
                for container in runtime:
                    if container['HostConfig']['PortBindings']:
                        raise RuntimeError('E2E must never publish host ports')
                    if set(container['NetworkSettings']['Networks']) != {project + '_isolated'}:
                        raise RuntimeError('Unexpected runtime network')
                    metadata['runtime'].append({'name': container['Name'], 'image_id': container['Image'], 'published_ports': []})
                metadata['network_internal_verified'] = True
                save()
                metadata['browser_started'] = True
                command(compose + ['up', '--no-deps', '--abort-on-container-exit', '--exit-code-from', 'browser', 'browser'], timeout=300)
                metadata['status'] = 'passed'
                exit_code = 0
            finally:
                # Evidence failures must never prevent resource cleanup.
                collection_errors = []
                try:
                    copy_status = command(compose + ['cp', 'browser:/artifacts/.', str(output)], check=False, timeout=30)
                    if copy_status and metadata.get('browser_started'):
                        collection_errors.append('Could not copy browser evidence')
                except Exception as error:
                    collection_errors.append(str(error))
                try:
                    with (output / 'stack.log').open('w') as stack_log:
                        subprocess.run(compose + ['logs', '--no-color', '--timestamps'], env=env,
                                       stdout=stack_log, stderr=subprocess.STDOUT, timeout=30)
                except Exception as error:
                    collection_errors.append(str(error))
                finally:
                    command(compose + ['down', '--volumes', '--remove-orphans', '--rmi', 'local'], timeout=120)
                    metadata['cleanup'] = 'compose down --volumes --remove-orphans --rmi local succeeded'
                    for listing in (['docker', 'ps', '-aq'], ['docker', 'network', 'ls', '-q'], ['docker', 'volume', 'ls', '-q']):
                        remaining = subprocess.check_output(listing + ['--filter', 'label=com.docker.compose.project=' + project], env=env, text=True).strip()
                        if remaining:
                            raise RuntimeError('Temporary Docker resources remain after cleanup')
                    metadata['cleanup_verified'] = True
                if collection_errors:
                    metadata['evidence_collection_errors'] = collection_errors
                    # Preserve the original build/readiness/browser error when one exists.
                    if sys.exc_info()[0] is None:
                        raise RuntimeError('Evidence collection failed; temporary stack cleaned; see run.json')
    except Exception as error:
        exit_code = 1
        metadata['status'] = 'failed'
        metadata['error'] = str(error)
        evidence_path = output / 'evidence.json'
        if evidence_path.exists():
            failure = json.loads(evidence_path.read_text()).get('failure')
            if failure:
                metadata['failed_stage'] = failure['stage']
                message = f"{failure['stage']}: {failure['message']}"
                print('E2E FAILED: ' + redact(message.encode(), [session['password'], session['jwt_key']]).decode(), file=sys.stderr)
        print(f'E2E FAILED: {error}', file=sys.stderr)
    finally:
        for source in worktrees:
            # TemporaryDirectory may already have removed files after an exception.
            result = subprocess.run(['git', '-C', str(ROOT), 'worktree', 'remove', '--force', str(source)],
                                    stdout=log, stderr=subprocess.STDOUT)
            if result.returncode:
                metadata['status'] = 'failed'
                metadata['error'] = 'Could not unregister a temporary worktree'
                exit_code = 1
        metadata['finished_at'] = datetime.now(timezone.utc).isoformat()
        save()
        log.close()
        try:
            publish_artifacts(output, session)
        except Exception:
            # The upload glob never includes raw logs or partially cleaned traces.
            metadata['status'] = 'failed'
            metadata['error'] = 'Artifact sanitation/publication failed; CI upload withheld'
            save()
            exit_code = 1
            print(metadata['error'], file=sys.stderr)
    print(f'E2E {metadata["status"].upper()}: {output}', flush=True)
    return exit_code


if __name__ == '__main__':
    sys.exit(main())
