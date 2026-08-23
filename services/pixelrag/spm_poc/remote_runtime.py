"""Runtime adapter for remote Qwen embeddings with local PixelRAG storage/FAISS."""

from __future__ import annotations

from pathlib import Path

from .documents import DocumentLibrary, DocumentRecord
from .remote_index import build_remote_index
from .remote_search import RemotePixelRAGClient
from .service import DocumentService
from .tiles import TileResolver
from .vlm import OpenAICompatibleVLMReader
from .web import WebRuntime


def _remote_index_builder(record: DocumentRecord, source_dir: Path, output_dir: Path) -> None:
    build_remote_index(source_dir, output_dir, article_title=record.name)


class RemoteEmbeddingWebRuntime(WebRuntime):
    """WebRuntime variant that never loads the Qwen embedding model locally."""

    def __init__(self, root: Path | str | None = None) -> None:
        resolved_root = Path(root or Path(__file__).resolve().parents[1]).resolve()
        documents = DocumentLibrary(
            resolved_root,
            index_builder=_remote_index_builder,
        )
        super().__init__(resolved_root, document_library=documents)
        # Preserve the same one-at-a-time indexing safety used by WebRuntime.
        self.documents._before_index = self.process_manager.stop

    def document_service_for(self, document_id: str) -> DocumentService:
        try:
            document = self.documents.get(document_id)
        except KeyError as error:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Document not found") from error
        if document.status != "ready":
            from fastapi import HTTPException

            raise HTTPException(status_code=409, detail=f"{document.name} is not ready")

        index_dir = self.documents.index_dir(document.id)
        return DocumentService(
            RemotePixelRAGClient(index_dir),
            TileResolver(index_dir),
            OpenAICompatibleVLMReader.from_env(),
        )
