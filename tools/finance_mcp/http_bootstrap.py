"""Uvicorn entrypoint: read only the explicit non-secret binding; never open OAuth state.

Invalid/missing metadata refuses sidecar startup. No listener or key is created.
"""
import os

from .http_server import create_http_app
from reporting.binding_config import read_binding

binding_path = os.environ.get("FINANCE_MCP_BINDING_FILE")
binding = read_binding(binding_path)
app = create_http_app(binding)
