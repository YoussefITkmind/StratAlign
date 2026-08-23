#!/usr/bin/env python3
"""Run the PixelRAG service using the local or remote-embedding runtime."""

import hmac
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import uvicorn
from fastapi import Request
from fastapi.responses import JSONResponse

from spm_poc.demo_seed import ensure_demo_baseline
from spm_poc.document_lifecycle import register_document_lifecycle_routes
from spm_poc.visual_documents import VisualDocumentLibrary
from spm_poc.web import WebRuntime, create_app


if __name__ == "__main__":
    if os.getenv("EMBED_API_URL", "").strip():
        from spm_poc.remote_runtime import RemoteEmbeddingWebRuntime

        runtime = RemoteEmbeddingWebRuntime(ROOT)
        print("PixelRAG: using remote embedding runtime", flush=True)
    else:
        documents = VisualDocumentLibrary(ROOT)
        runtime = WebRuntime(ROOT, document_library=documents)
        documents._before_index = runtime.process_manager.stop
        print("PixelRAG: using local embedding runtime", flush=True)

    seeded = ensure_demo_baseline(runtime.repository())
    if seeded:
        print("PixelRAG: seeded isolated demo strategy/KPI baseline", flush=True)

    app = create_app(runtime)
    register_document_lifecycle_routes(app, runtime)
    service_token = os.getenv("PIXELRAG_SERVICE_TOKEN", "").strip()

    @app.middleware("http")
    async def service_boundary(request: Request, call_next):
        """Optional bearer auth plus audit completion for operational actions."""
        if service_token:
            expected = f"Bearer {service_token}"
            supplied = request.headers.get("authorization", "")
            if not hmac.compare_digest(supplied, expected):
                return JSONResponse(status_code=401, content={"detail": "PixelRAG service authentication failed"})

        response = await call_next(request)

        prefix = "/api/alerts/"
        suffix = "/acknowledge"
        if (
            request.method == "POST"
            and response.status_code < 400
            and request.url.path.startswith(prefix)
            and request.url.path.endswith(suffix)
        ):
            alert_id = request.url.path[len(prefix):-len(suffix)].strip("/")
            if alert_id:
                runtime.audit.append(
                    "alert.acknowledged",
                    "alert",
                    resource_id=alert_id,
                    actor=request.headers.get("x-user-name", "demo.user"),
                    role=request.headers.get("x-user-role", "admin"),
                )

        return response

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
