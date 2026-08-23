"""Resolve PixelRAG hit coordinates through generated index metadata."""

import json
from pathlib import Path

from .errors import TileResolutionError
from .models import ResolvedTile, RetrievalResult


class TileResolver:
    def __init__(self, index_dir: Path | str = "indexes/spm") -> None:
        self.index_dir = Path(index_dir)
        try:
            self.articles = json.loads(
                (self.index_dir / "articles.json").read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError) as error:
            raise TileResolutionError(
                f"Cannot read PixelRAG article metadata under {self.index_dir}"
            ) from error

    def resolve(self, hit: RetrievalResult) -> ResolvedTile:
        try:
            article = self.articles[hit.article_id]
            article_title = str(article["title"])
        except (IndexError, KeyError, TypeError) as error:
            raise TileResolutionError(
                f"Unknown article_id {hit.article_id} in PixelRAG metadata"
            ) from error

        metadata_dir = self.index_dir / "tiles" / f"{article_title}.png.tiles"
        try:
            chunks = json.loads(
                (metadata_dir / "chunks.json").read_text(encoding="utf-8")
            )["chunks"]
        except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
            raise TileResolutionError(
                f"Cannot read tile metadata for article_id {hit.article_id}"
            ) from error

        match = next(
            (
                chunk
                for chunk in chunks
                if chunk.get("tile_index") == hit.tile_index
                and chunk.get("chunk_index", 0) == hit.chunk_index
            ),
            None,
        )
        if not match or not isinstance(match.get("file"), str):
            raise TileResolutionError(
                f"No tile for article_id={hit.article_id}, "
                f"tile_index={hit.tile_index}, chunk_index={hit.chunk_index}"
            )

        image_path = metadata_dir / match["file"]
        if not image_path.is_file() or image_path.parent != metadata_dir:
            raise TileResolutionError(f"Resolved tile image does not exist: {image_path}")
        return ResolvedTile(hit=hit, image_path=image_path.resolve())

    def resolve_all(self, hits: list[RetrievalResult]) -> list[ResolvedTile]:
        resolved: list[ResolvedTile] = []
        seen: set[Path] = set()
        for hit in hits:
            tile = self.resolve(hit)
            if tile.image_path not in seen:
                seen.add(tile.image_path)
                resolved.append(tile)
        return resolved
