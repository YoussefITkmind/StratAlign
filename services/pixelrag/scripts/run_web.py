#!/usr/bin/env python3
"""Run the PixelRAG service using the local or remote-embedding runtime."""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import uvicorn

from spm_poc.web import create_app


if __name__ == "__main__":
    if os.getenv("EMBED_API_URL", "").strip():
        from spm_poc.remote_runtime import RemoteEmbeddingWebRuntime

        app = create_app(RemoteEmbeddingWebRuntime(ROOT))
        print("PixelRAG: using remote embedding runtime", flush=True)
    else:
        app = create_app()
        print("PixelRAG: using local embedding runtime", flush=True)

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
