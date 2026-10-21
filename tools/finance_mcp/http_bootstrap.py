"""Uvicorn entrypoint: read only explicitly configured non-secret binding metadata.

Invalid/missing metadata refuses sidecar startup. No listener or key is created.
"""
import os

from .http_server import create_http_app
from reporting.binding_config import read_binding

app = create_http_app(read_binding(os.environ.get("FINANCE_MCP_BINDING_FILE")))
