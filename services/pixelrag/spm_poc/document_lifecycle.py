"""Document lifecycle routes kept inside the isolated PixelRAG service."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Header, HTTPException

from .web import WebRuntime


def register_document_lifecycle_routes(app: FastAPI, runtime: WebRuntime) -> None:
    """Register destructive document operations with explicit local-only scope."""

    @app.delete("/api/documents/{document_id}")
    def delete_document(
        document_id: str,
        x_user_name: str | None = Header(default=None),
        x_user_role: str | None = Header(default=None),
    ) -> dict[str, Any]:
        actor = x_user_name or "demo.user"
        role = x_user_role or "admin"

        try:
            record, replacement_document_id = runtime.documents.delete(document_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Document not found") from error
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

        # Remove derived analysis/proposal state. Audit/workflow history is
        # intentionally retained so destructive actions remain traceable.
        runtime.extractions.invalidate(document_id)

        # A watched-folder file that was deliberately deleted must be eligible
        # for ingestion again. Remove only fingerprints that point at this doc.
        history = runtime._load_ingestion_history()
        retained = {
            fingerprint: item
            for fingerprint, item in history.items()
            if item.get("document_id") != document_id
        }
        if retained != history:
            runtime._save_ingestion_history(retained)

        runtime.audit.append(
            "document.deleted",
            "document",
            resource_id=document_id,
            actor=actor,
            role=role,
            detail={
                "name": record.name,
                "replacement_document_id": replacement_document_id,
            },
        )
        return record.model_dump(mode="json")
