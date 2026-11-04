"""Boot the real API with disposable credentials and disabled integrations."""
import json
import os
from pathlib import Path
from safety import guard

guard()
session = json.loads(Path('/run/secrets/session').read_text())
os.environ.update(SECRET_KEY=session['jwt_key'], ALGORITHM='HS256',
                  ACCESS_TOKEN_EXPIRE_MINUTES='15',
                  WAZZUP24_API_KEY='e2e-disabled-synthetic',
                  WAZZUP24_API_URL='http://127.0.0.1:9/disabled')
# The image contains no .env, uploads, credentials, or production data.
from server import app  # noqa: E402
from starlette.responses import JSONResponse  # noqa: E402
import routers.auth as real_auth  # noqa: E402

if real_auth.SECRET_KEY != session['jwt_key'] or real_auth.ALGORITHM != 'HS256':
    raise RuntimeError('E2E refuses auth fallback or a foreign signing key')


@app.middleware('http')
async def disable_integrations(request, call_next):
    if request.url.path.startswith(('/api/wazzup', '/api/telephony', '/api/chat', '/api/service-quality', '/api/feedback')):
        return JSONResponse({'detail': 'External integration disabled in disposable E2E'}, status_code=503)
    return await call_next(request)


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8001, access_log=True)
