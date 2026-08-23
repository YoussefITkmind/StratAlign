"""Lightweight FAISS search backed by remote text embeddings.

This avoids loading the large Qwen embedding model in the local PixelRAG service
when EMBED_API_URL is configured.
"""

from __future__ import annotations

from pathlib import Path

import faiss
import numpy as np

from .errors import PixelRAGError
from .models import RetrievalResult
from .remote_embeddings import RemoteEmbeddingClient


class RemotePixelRAGClient:
    """Drop-in search client exposing the same search() contract as PixelRAGClient."""

    def __init__(self, index_dir: str | Path, *, minimum_recall_k: int = 6) -> None:
        self.index_dir = Path(index_dir).resolve()
        self.minimum_recall_k = max(1, minimum_recall_k)
        index_path = self.index_dir / "index.faiss"
        metadata_path = self.index_dir / "metadata.npz"
        if not index_path.exists():
            raise PixelRAGError(f"Missing FAISS index: {index_path}")
        if not metadata_path.exists():
            raise PixelRAGError(f"Missing PixelRAG metadata: {metadata_path}")

        self.index = faiss.read_index(str(index_path))
        self.metadata = np.load(metadata_path)
        self.embedder = RemoteEmbeddingClient()

    def search(self, query: str, top_k: int = 3) -> list[RetrievalResult]:
        question = query.strip()
        if not question:
            raise ValueError("query must not be empty")

        vector = self.embedder.embed_text(question).astype(np.float32)
        if len(vector) != self.index.d:
            raise PixelRAGError(
                f"Embedding dimension mismatch: remote={len(vector)}, index={self.index.d}"
            )

        # RemoteEmbeddingClient already L2-normalizes; normalizing defensively
        # keeps the search compatible with PixelRAG's cosine/IP index contract.
        norm = float(np.linalg.norm(vector))
        if norm <= 0:
            raise PixelRAGError("Remote query embedding is empty")
        query_vector = (vector / norm).reshape(1, -1)

        # Keep a small recall floor for visually rich reports. Appendix pages can
        # contain the exact wording of a question and outrank the page containing
        # the answer; the grounded VLM should see a broader candidate evidence set.
        requested_k = max(top_k, 1)
        candidate_k = max(requested_k, self.minimum_recall_k)
        fetch_k = min(candidate_k, int(self.index.ntotal)) if self.index.ntotal else 0
        if fetch_k == 0:
            return []

        distances, indices = self.index.search(query_vector, fetch_k)
        article_ids = self.metadata["article_ids"]
        tile_indices = self.metadata["tile_indices"]
        chunk_indices = self.metadata["chunk_indices"]

        results: list[RetrievalResult] = []
        for position in range(fetch_k):
            vector_id = int(indices[0, position])
            if vector_id < 0:
                continue
            results.append(
                RetrievalResult(
                    score=float(distances[0, position]),
                    article_id=int(article_ids[vector_id]),
                    tile_index=int(tile_indices[vector_id]),
                    chunk_index=int(chunk_indices[vector_id]),
                )
            )
        return results
