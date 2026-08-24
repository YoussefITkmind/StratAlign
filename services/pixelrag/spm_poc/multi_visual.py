"""Visual multi-document Q&A extension for the PixelRAG web service."""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException

from .models import MultiDocumentQARequest
from .vlm import OpenAICompatibleVLMReader
from .web import WebRuntime


def install_multi_visual_route(app: FastAPI, runtime: WebRuntime) -> None:
    """Register multi-document Q&A that retains per-source visual evidence."""

    @app.post("/api/qa/multi-visual")
    def multi_document_qa_visual(
        payload: MultiDocumentQARequest,
        x_user_name: str | None = Header(default=None),
        x_user_role: str | None = Header(default=None),
    ) -> dict[str, Any]:
        settings = runtime.governance.get()
        ids = list(dict.fromkeys(payload.document_ids))

        if not ids:
            raise HTTPException(status_code=422, detail="Select at least one document")
        if len(ids) > settings.max_multi_document_sources:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Multi-document Q&A is limited to "
                    f"{settings.max_multi_document_sources} sources in this POC"
                ),
            )
        if os.getenv("PIXELRAG_BASE_URL") and len(ids) > 1:
            raise HTTPException(
                status_code=409,
                detail="Multi-document Q&A requires the managed PixelRAG runtime in this POC",
            )

        blocks: list[str] = []
        sources: list[dict[str, Any]] = []

        source_question = (
            payload.question
            + "\n\nPrepare a concise source brief from this report only for a later cross-report synthesis. "
            "Extract the current value relevant to the question, any historical values explicitly visible in this report, the target/status when visible, "
            "the documented causes, and whether this report itself explicitly describes improvement, deterioration, recovery, or forecast movement. "
            "Do not say that other reports are unavailable or that only one report is visible. "
            "Do not compare this source with unseen reports. "
            "Do not infer a fiscal year, quarter, date, chronology, or value from the filename or from other reports; mention them only when explicitly visible in this source evidence."
        )

        for position, document_id in enumerate(ids, start=1):
            try:
                document = runtime.documents.get(document_id)
            except KeyError as error:
                raise HTTPException(status_code=404, detail="Document not found") from error

            answer = runtime.document_service_for(document_id).ask(
                source_question,
                payload.top_k_per_document,
            )

            blocks.append(
                f"SOURCE {position}: {document.name}\n"
                f"ANSWER: {answer.answer}\n"
                f"EVIDENCE: {'; '.join(answer.evidence)}"
            )
            sources.append(
                {
                    "document_id": document.id,
                    "document_name": document.name,
                    "answer": answer.answer,
                    "evidence": answer.evidence,
                    "tiles": [
                        {
                            "score": tile.hit.score,
                            "article_id": tile.hit.article_id,
                            "tile_index": tile.hit.tile_index,
                            "chunk_index": tile.hit.chunk_index,
                            "image_url": (
                                f"/api/documents/{document.id}/evidence/"
                                f"{tile.hit.article_id}/{tile.hit.tile_index}/{tile.hit.chunk_index}"
                            ),
                        }
                        for tile in answer.tiles
                    ],
                }
            )

        synthesis_question = (
            payload.question
            + "\n\nStrict cross-document synthesis rules: "
            "Use the SOURCE names as the canonical report labels. "
            "Do not invent fiscal years, quarters, dates, or chronology that are not explicitly stated in the source summaries/evidence. "
            "Do not reorder reports based on guessed dates. "
            "When chronology and numeric values are explicit, calculate each adjacent percentage-point change and verify the arithmetic and direction before answering. "
            "A larger later value is an increase and a smaller later value is a decrease. "
            "If the first and last periods are explicit, state the overall first-to-last percentage-point change as well. "
            "If chronology is not explicit, state the values by source/report name rather than claiming which occurred first. "
            "Separate actual observed changes from forecasts or possible future recovery."
        )
        synthesis = OpenAICompatibleVLMReader.from_env().synthesize_text(
            synthesis_question,
            blocks,
        )

        runtime.audit.append(
            "ai.multi_question",
            "document_set",
            resource_id=",".join(ids),
            actor=x_user_name or "demo.user",
            role=x_user_role or "admin",
            detail={"question": payload.question[:300], "sources": len(ids)},
        )

        return {
            "answer": synthesis.answer,
            "evidence": synthesis.evidence,
            "sources": sources,
        }
