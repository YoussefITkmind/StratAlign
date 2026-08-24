"""HTTP client for the local PixelRAG search service."""

import json
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from pydantic import ValidationError

from .errors import PixelRAGError
from .models import RetrievalResult


class PixelRAGClient:
    def __init__(
        self,
        base_url: str = "http://localhost:30001",
        timeout: float = 120,
        urlopen: Callable[..., Any] = urllib.request.urlopen,
    ) -> None:
        self.search_url = f"{base_url.rstrip('/')}/search"
        self.timeout = timeout
        self._urlopen = urlopen

    def search(self, query: str, top_k: int = 3) -> list[RetrievalResult]:
        if not query.strip():
            raise ValueError("query must not be empty")
        if top_k < 1:
            raise ValueError("top_k must be at least 1")
        payload = json.dumps(
            {"queries": [{"text": query}], "n_docs": top_k}
        ).encode("utf-8")
        request = urllib.request.Request(
            self.search_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with self._urlopen(request, timeout=self.timeout) as response:
                body = json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise PixelRAGError(
                f"PixelRAG search returned HTTP {error.code}: {detail}"
            ) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise PixelRAGError(
                f"Cannot reach PixelRAG at {self.search_url}. "
                "Start it with: pixelrag serve --index-dir ./indexes/spm --articles-json ./indexes/spm/articles.json --port 30001"
            ) from error
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise PixelRAGError("PixelRAG returned invalid JSON") from error

        try:
            results = body["results"]
            hits = results[0]["hits"] if results else []
            return [RetrievalResult.model_validate(hit) for hit in hits]
        except (KeyError, TypeError, ValidationError) as error:
            raise PixelRAGError("PixelRAG returned an unexpected response shape") from error
