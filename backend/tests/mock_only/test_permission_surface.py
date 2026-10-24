"""All registered HTTP API operations are exercised against an empty grant set."""
import os
import re

import httpx
from fastapi.routing import APIRoute

from api_permissions import PUBLIC, requirements
from models.staff import Permission
from routers.auth import get_current_active_user
from models.auth import UserInDB


async def test_every_registered_api_denies_empty_permissions(monkeypatch):
    monkeypatch.setenv('WAZZUP24_API_KEY', 'synthetic-no-network')
    monkeypatch.setenv('MONGO_URL', 'mongodb://localhost:27017/permission_synthetic')
    monkeypatch.setenv('DB_NAME', 'permission_synthetic')
    import server
    actor = UserInDB(id='synthetic', full_name='Synthetic', role='super_admin', hashed_password='synthetic', permissions=[])
    server.app.dependency_overrides[get_current_active_user] = lambda: actor
    checked = 0
    known = {p.value for p in Permission}
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(server.app), base_url='http://synthetic') as client:
            for route in server.app.routes:
                if not isinstance(route, APIRoute) or not route.path.startswith('/api/') or route.endpoint.__module__.startswith('reporting.'):
                    continue
                for method in route.methods:
                    if (method, route.path) in PUBLIC or route.path.startswith('/api/auth/'):
                        continue
                    required = requirements(route.path, method, route.endpoint.__module__)
                    assert required is not None, route.path
                    assert all(set(clause.split('|')) <= known for clause in required), (route.path, required)
                    path = re.sub(r'\{[^}]+\}', 'synthetic', route.path)
                    response = await client.request(method, path)
                    assert response.status_code == 403, (method, path, response.status_code, response.text[:200])
                    checked += 1
        assert checked >= 280
    finally:
        server.app.dependency_overrides.clear()
