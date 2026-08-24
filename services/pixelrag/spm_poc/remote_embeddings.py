"""Remote embedding adapter for the PixelRAG GPU service.

The StratAlign host keeps rendering, chunk metadata, and FAISS artifacts local.
Only model inference is sent to the configured embedding endpoint.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import urllib.error
import urllib.request
import zlib
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

_RESIZE_FACTOR = 28
_MAX_CHUNK_WIDTH = 875


class RemoteEmbeddingError(RuntimeError):
    """Raised when the remote embedding service cannot produce an embedding."""


def _clamp_width(image: Image.Image, max_width: int = _MAX_CHUNK_WIDTH) -> Image.Image:
    """Keep remote image preprocessing aligned with PixelRAG's local embedder."""
    width, height = image.size
    if width <= max_width:
        return image

    scale = max_width / width
    new_width = max(round(width * scale / _RESIZE_FACTOR) * _RESIZE_FACTOR, _RESIZE_FACTOR)
    new_height = max(round(height * scale / _RESIZE_FACTOR) * _RESIZE_FACTOR, _RESIZE_FACTOR)
    resampling = getattr(Image, "Resampling", Image)
    return image.resize((new_width, new_height), resampling.LANCZOS)


def scan_chunks(shard_dir: str | Path) -> list[dict[str, Any]]:
    """Read PixelRAG chunk manifests and retain the metadata expected by FAISS."""
    shard = Path(shard_dir)
    if not shard.is_dir():
        raise RemoteEmbeddingError(f"PixelRAG chunk directory does not exist: {shard}")

    items: list[dict[str, Any]] = []
    for entry in sorted(shard.iterdir()):
        if not entry.is_dir():
            continue

        tile_dirs = [entry] if entry.name.endswith(".png.tiles") else sorted(
            directory
            for directory in entry.iterdir()
            if directory.is_dir() and directory.name.endswith(".png.tiles")
        )

        for tile_dir in tile_dirs:
            article_id_text = tile_dir.name.removesuffix(".png.tiles")
            try:
                article_id = int(article_id_text)
            except ValueError:
                article_id = zlib.crc32(article_id_text.encode("utf-8"))

            chunks_json = tile_dir / "chunks.json"
            tiles_json = tile_dir / "tiles.json"

            if chunks_json.exists():
                manifest = json.loads(chunks_json.read_text(encoding="utf-8"))
                for chunk in manifest.get("chunks", []):
                    chunk_path = tile_dir / str(chunk.get("file", ""))
                    if not chunk_path.is_file():
                        continue
                    items.append({
                        "path": str(chunk_path),
                        "article_id": article_id,
                        "tile_index": int(chunk.get("tile_index", 0)),
                        "chunk_index": int(chunk.get("chunk_index", 0)),
                        "y_offset": int(chunk.get("y_offset", 0)),
                        "height": int(chunk.get("height", 1024)),
                    })
            elif tiles_json.exists():
                manifest = json.loads(tiles_json.read_text(encoding="utf-8"))
                for tile_index, tile_name in enumerate(manifest.get("tiles", [])):
                    tile_path = tile_dir / str(tile_name)
                    if not tile_path.is_file():
                        continue
                    items.append({
                        "path": str(tile_path),
                        "article_id": article_id,
                        "tile_index": tile_index,
                        "chunk_index": 0,
                        "y_offset": 0,
                        "height": 0,
                    })

    return items


class RemoteEmbeddingClient:
    """Small HTTP client for text and image embedding endpoints."""

    def __init__(self, base_url: str | None = None, *, timeout: float = 120.0) -> None:
        resolved_url = (base_url or os.getenv("EMBED_API_URL") or "").strip()
        if not resolved_url:
            raise RemoteEmbeddingError("EMBED_API_URL is not configured")
        self.base_url = resolved_url.rstrip("/")
        self.timeout = timeout

    def _post(self, endpoint: str, payload: dict[str, Any]) -> np.ndarray:
        request = urllib.request.Request(
            f"{self.base_url}{endpoint}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RemoteEmbeddingError(
                f"Embedding API returned HTTP {error.code}: {detail}"
            ) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise RemoteEmbeddingError(
                f"Cannot reach embedding API at {self.base_url}{endpoint}: {error}"
            ) from error

        try:
            embedding = np.asarray(body["embedding"], dtype=np.float32)
            dimension = int(body["dim"])
        except (KeyError, TypeError, ValueError) as error:
            raise RemoteEmbeddingError("Embedding API returned an unexpected response") from error

        if embedding.ndim != 1 or embedding.size == 0:
            raise RemoteEmbeddingError("Embedding API did not return a non-empty 1D vector")
        if len(embedding) != dimension:
            raise RemoteEmbeddingError("Embedding API dimension does not match vector length")
        if not np.all(np.isfinite(embedding)):
            raise RemoteEmbeddingError("Embedding API returned a non-finite vector")

        norm = float(np.linalg.norm(embedding))
        if norm <= 0:
            raise RemoteEmbeddingError("Embedding API returned a zero-length vector")
        return embedding / norm

    def embed_image(self, image: Image.Image) -> np.ndarray:
        image = _clamp_width(image.convert("RGB"))
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return self._post(
            "/embed_image",
            {"image_b64": base64.b64encode(buffer.getvalue()).decode("ascii")},
        )

    def embed_image_path(self, path: str | Path) -> np.ndarray:
        with Image.open(path) as image:
            return self.embed_image(image)

    def embed_text(self, text: str) -> np.ndarray:
        query = text.strip()
        if not query:
            raise ValueError("text must not be empty")
        return self._post("/embed_text", {"text": query})


def build_remote_embeddings(
    shard_dir: str | Path,
    output_dir: str | Path,
    *,
    base_url: str | None = None,
    timeout: float = 120.0,
) -> Path:
    """Embed PixelRAG chunks remotely and write the standard shard artifact."""
    items = scan_chunks(shard_dir)
    if not items:
        raise RemoteEmbeddingError(f"No PixelRAG chunks found in {shard_dir}")

    client = RemoteEmbeddingClient(base_url, timeout=timeout)
    vectors: list[np.ndarray] = []
    expected_dimension: int | None = None

    for index, item in enumerate(items, start=1):
        print(f"Embedding {index}/{len(items)}: {Path(item['path']).name}", flush=True)
        vector = client.embed_image_path(item["path"])
        if expected_dimension is None:
            expected_dimension = len(vector)
        elif len(vector) != expected_dimension:
            raise RemoteEmbeddingError("Remote embedding dimension changed during indexing")
        vectors.append(vector.astype(np.float16))

    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    output_path = output / "shard_000.npz"
    np.savez(
        output_path,
        embeddings=np.stack(vectors),
        article_ids=np.array([item["article_id"] for item in items], dtype=np.int64),
        tile_indices=np.array([item["tile_index"] for item in items], dtype=np.int32),
        chunk_indices=np.array([item["chunk_index"] for item in items], dtype=np.int32),
        y_offsets=np.array([item["y_offset"] for item in items], dtype=np.int32),
        tile_heights=np.array([item["height"] for item in items], dtype=np.int32),
    )
    print(f"Saved {len(vectors)} remote embeddings to {output_path}", flush=True)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build PixelRAG embeddings using a remote GPU service")
    parser.add_argument("--shard-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--embed-api-url", default=None)
    parser.add_argument(
        "--timeout",
        type=float,
        default=float(os.getenv("EMBED_API_TIMEOUT", "120")),
    )
    args = parser.parse_args()
    build_remote_embeddings(
        args.shard_dir,
        args.output_dir,
        base_url=args.embed_api_url,
        timeout=args.timeout,
    )


if __name__ == "__main__":
    main()
