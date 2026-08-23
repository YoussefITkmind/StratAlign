#!/usr/bin/env python3
"""Run the local FastAPI facade and managed PixelRAG document service."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import uvicorn


if __name__ == "__main__":
    uvicorn.run("spm_poc.web:app", host="0.0.0.0", port=8000, reload=False)
