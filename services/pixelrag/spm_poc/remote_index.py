"""Build PixelRAG FAISS indexes while delegating embedding inference remotely."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from pixelrag_render.render import render_pdf

from .remote_embeddings import build_remote_embeddings


class RemoteIndexError(RuntimeError):
    """Raised when a remote-backed PixelRAG index cannot be completed."""


def build_remote_index(
    source_dir: str | Path,
    output_dir: str | Path,
    *,
    article_title: str | None = None,
) -> Path:
    source = Path(source_dir).resolve()
    output = Path(output_dir).resolve()
    pdfs = sorted(source.glob("*.pdf"))
    if len(pdfs) != 1:
        raise RemoteIndexError(
            f"Expected exactly one normalized PDF in {source}, found {len(pdfs)}"
        )

    pdf = pdfs[0]
    tiles_dir = output / "tiles"
    embeddings_dir = output / "embeddings"
    if tiles_dir.exists():
        shutil.rmtree(tiles_dir)
    if embeddings_dir.exists():
        shutil.rmtree(embeddings_dir)
    output.mkdir(parents=True, exist_ok=True)
    tiles_dir.mkdir(parents=True, exist_ok=True)
    embeddings_dir.mkdir(parents=True, exist_ok=True)

    print("PixelRAG 1/4: rendering document", flush=True)
    render_pdf(str(pdf), str(tiles_dir))

    print("PixelRAG 2/4: chunking visual tiles", flush=True)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pixelrag_embed.chunk",
            "--shard-dir",
            str(tiles_dir),
            "--workers",
            "8",
        ],
        check=True,
    )

    print("PixelRAG 3/4: embedding through remote GPU", flush=True)
    build_remote_embeddings(tiles_dir, embeddings_dir)

    npz_files = sorted(embeddings_dir.glob("shard_*.npz"))
    if not npz_files:
        raise RemoteIndexError("Remote embedding completed without shard artifacts")

    total_vectors = 0
    for path in npz_files:
        with np.load(path, mmap_mode="r") as shard:
            total_vectors += int(shard["embeddings"].shape[0])
    if total_vectors < 1:
        raise RemoteIndexError("Remote embedding produced zero vectors")

    nlist = min(4096, max(1, total_vectors // 40))
    print(
        f"PixelRAG 4/4: building FAISS index ({total_vectors} vectors, nlist={nlist})",
        flush=True,
    )
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pixelrag_embed.index",
            "build",
            "--embeddings-dir",
            str(embeddings_dir),
            "--output-dir",
            str(output),
            "--nlist",
            str(nlist),
        ],
        check=True,
    )

    # StratAlign normalizes every uploaded document to source/1.pdf, so the
    # PixelRAG renderer emits article id 1. Keep the numeric title for tile
    # resolution and expose the user's filename separately as display_title.
    articles = [
        {"title": "", "url": ""},
        {
            "title": pdf.stem,
            "display_title": article_title or pdf.stem,
            "url": "",
        },
    ]
    (output / "articles.json").write_text(
        json.dumps(articles, indent=2) + "\n",
        encoding="utf-8",
    )

    required = [output / "index.faiss", output / "metadata.npz", output / "articles.json"]
    missing = [path.name for path in required if not path.exists()]
    if missing:
        raise RemoteIndexError("Remote index build is missing: " + ", ".join(missing))

    return output
