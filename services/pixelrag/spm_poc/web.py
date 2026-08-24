"""FastAPI facade for the StratAlign Document & Performance Intelligence POC."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, field_validator

from .advanced import AuditLog, ExtractionSnapshotStore, ForecastService, GovernanceStore, WorkflowStore, utcnow
from .documents import DocumentLibrary, PixelRAGProcessManager, SUPPORTED_EXTENSIONS
from .errors import PixelRAGError, StructuredOutputError, TileResolutionError, VLMError
from .models import (
    DataCaptureProposal,
    ExtractedSPMDocument,
    GovernanceSettings,
    IntelligenceRequest,
    MultiDocumentQARequest,
    RetrievalResult,
    SmartImportProposal,
)
from .pixelrag import PixelRAGClient
from .service import DocumentService
from .storage import MockSPMRepository
from .tiles import TileResolver
from .vlm import OpenAICompatibleVLMReader
from .workflows import DataCaptureService, SmartImportService


class QARequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    top_k: int = Field(default=3, ge=1, le=5)

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("question must not be blank")
        return value


class IngestionSettings(BaseModel):
    enabled: bool = False
    poll_seconds: int = Field(default=900, ge=60, le=86400)
    watched_folder: str = "ingestion-drop"


class WebRuntime:
    """Filesystem/configuration boundary used by the HTTP endpoints."""

    def __init__(self, root: Path | str | None = None, *, document_library: DocumentLibrary | None = None) -> None:
        self.root = Path(root or Path(__file__).resolve().parents[1]).resolve()
        self.store_path = self.root / "mock-data" / "spm-data.json"
        self.process_manager = PixelRAGProcessManager(self.root)
        self.documents = document_library or DocumentLibrary(self.root, before_index=self.process_manager.stop)
        self.extractions = ExtractionSnapshotStore(self.root)
        self.audit = AuditLog(self.root)
        self.governance = GovernanceStore(self.root)
        self.workflows = WorkflowStore(self.root)
        self.ingestion_settings_path = self.root / "mock-data" / "ingestion-settings.json"
        self.ingestion_history_path = self.root / "mock-data" / "ingestion-history.json"

        # PixelRAG indexing is memory-heavy. Never allow multiple watched-folder
        # scans to launch indexing jobs at the same time.
        self._ingestion_lock = threading.Lock()

    def repository(self) -> MockSPMRepository:
        return MockSPMRepository(self.store_path)

    def selected_document(self):
        try:
            document = self.documents.selected()
        except KeyError as error:
            raise HTTPException(status_code=409, detail="No document is selected") from error
        if document.status != "ready":
            raise HTTPException(status_code=409, detail="The selected document is not ready yet")
        return document

    def document_service_for(self, document_id: str) -> DocumentService:
        try:
            document = self.documents.get(document_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Document not found") from error
        if document.status != "ready":
            raise HTTPException(status_code=409, detail=f"{document.name} is not ready")
        index_dir = self.documents.index_dir(document.id)
        external = os.getenv("PIXELRAG_BASE_URL")
        if external:
            pixelrag_base_url = external
        else:
            pixelrag_base_url = self.process_manager.ensure(document, index_dir)
        return DocumentService(
            PixelRAGClient(base_url=pixelrag_base_url),
            TileResolver(index_dir),
            OpenAICompatibleVLMReader.from_env(),
        )

    def document_service(self) -> DocumentService:
        return self.document_service_for(self.selected_document().id)

    def extraction(self, *, force: bool = False) -> tuple[ExtractedSPMDocument, bool]:
        document = self.selected_document()
        source = self.documents.source_path(document.id)
        if not force:
            cached = self.extractions.get(document.id, source)
            if cached is not None:
                return cached, True
        service = self.document_service()
        # Tests replace document_service with a Mock that only configures extract_spm.
        if isinstance(service, DocumentService):
            extracted = service.extract_spm_comprehensive(top_k=5)
        else:
            extracted = service.extract_spm(top_k=5)
        extracted = ExtractedSPMDocument.model_validate(extracted)
        extracted.source_document_id = document.id
        extracted.source_document_name = document.name
        extracted.extracted_at = utcnow()
        for item in [*extracted.objectives, *extracted.kpis, *extracted.initiatives]:
            for ref in item.evidence:
                ref.document_id = document.id
                ref.document_name = document.name
        self.extractions.put(document.id, source, extracted)
        return extracted, False

    def smart_import_service(self) -> SmartImportService:
        return SmartImportService(self.repository())

    def data_capture_service(self) -> DataCaptureService:
        return DataCaptureService(self.repository(), self.governance.get().minimum_match_confidence)

    def proposal_path(self, kind: str) -> Path:
        document = self.selected_document()
        return self.root / "mock-data" / "proposals" / document.id / f"{kind}.json"

    def resolve_evidence(self, document_id: str, article_id: int, tile_index: int, chunk_index: int) -> Path:
        try:
            document = self.documents.get(document_id)
        except KeyError as error:
            raise TileResolutionError("Unknown source document") from error
        if document.status != "ready":
            raise TileResolutionError("Source document is not ready")
        hit = RetrievalResult(score=0.0, article_id=article_id, tile_index=tile_index, chunk_index=chunk_index)
        return TileResolver(self.documents.index_dir(document_id)).resolve(hit).image_path

    def get_ingestion_settings(self) -> IngestionSettings:
        if not self.ingestion_settings_path.exists():
            settings = IngestionSettings()
            self.set_ingestion_settings(settings)
            return settings
        try:
            return IngestionSettings.model_validate_json(self.ingestion_settings_path.read_text(encoding="utf-8"))
        except ValueError:
            return IngestionSettings()

    def set_ingestion_settings(self, settings: IngestionSettings) -> IngestionSettings:
        self.ingestion_settings_path.parent.mkdir(parents=True, exist_ok=True)
        self.ingestion_settings_path.write_text(settings.model_dump_json(indent=2) + "\n", encoding="utf-8")
        return settings

    def _load_ingestion_history(self) -> dict[str, dict[str, Any]]:
        if not self.ingestion_history_path.exists():
            return {}

        try:
            data = json.loads(self.ingestion_history_path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def _save_ingestion_history(self, history: dict[str, dict[str, Any]]) -> None:
        self.ingestion_history_path.parent.mkdir(parents=True, exist_ok=True)

        temporary = self.ingestion_history_path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(history, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temporary.replace(self.ingestion_history_path)

    @staticmethod
    def _file_fingerprint(path: Path) -> str:
        digest = hashlib.sha256()

        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)

        return digest.hexdigest()

    def scan_ingestion_folder(self) -> list[dict[str, Any]]:
        # Only one watched-folder scan may run at once. A repeated button click
        # or scheduler tick therefore cannot launch another PixelRAG indexer.
        if not self._ingestion_lock.acquire(blocking=False):
            return [{
                "status": "busy",
                "message": "An ingestion scan is already running.",
            }]

        try:
            settings = self.get_ingestion_settings()
            folder = (self.root / settings.watched_folder).resolve()

            if self.root not in folder.parents and folder != self.root:
                raise ValueError("Watched folder must be inside the POC project")

            folder.mkdir(parents=True, exist_ok=True)

            processed = folder / "processed"
            failed = folder / "failed"

            processed.mkdir(exist_ok=True)
            failed.mkdir(exist_ok=True)

            history = self._load_ingestion_history()
            results: list[dict[str, Any]] = []

            for path in sorted(folder.iterdir()):
                if not path.is_file():
                    continue

                if path.suffix.casefold() not in SUPPORTED_EXTENSIONS:
                    continue

                fingerprint = self._file_fingerprint(path)

                # Content-based duplicate detection. This works even if the same
                # document is dropped again using a different filename.
                previous = history.get(fingerprint)

                if previous:
                    destination = processed / path.name

                    if destination.exists():
                        destination.unlink()

                    path.replace(destination)

                    results.append({
                        "name": path.name,
                        "status": "skipped",
                        "reason": "already_ingested",
                        "document_id": previous.get("document_id"),
                        "original_name": previous.get("name"),
                    })

                    continue

                try:
                    content = path.read_bytes()

                    record = self.documents.upload(
                        path.name,
                        content,
                        None,
                    )

                    record = self.documents.index(record.id)

                    # A fingerprint is remembered only after successful indexing.
                    # Failed indexing can therefore be retried later.
                    history[fingerprint] = {
                        "document_id": record.id,
                        "name": path.name,
                        "size_bytes": len(content),
                        "ingested_at": utcnow(),
                    }

                    self._save_ingestion_history(history)

                    destination = processed / path.name

                    if destination.exists():
                        destination.unlink()

                    path.replace(destination)

                    results.append({
                        "name": path.name,
                        "status": "ready",
                        "document_id": record.id,
                    })

                except Exception as error:
                    try:
                        destination = failed / path.name

                        if destination.exists():
                            destination.unlink()

                        path.replace(destination)

                    except OSError:
                        pass

                    results.append({
                        "name": path.name,
                        "status": "failed",
                        "error": str(error),
                    })

            return results

        finally:
            self._ingestion_lock.release()

    def close(self) -> None:
        self.process_manager.stop()


def _write_model(path: Path, model: BaseModel) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(model.model_dump_json(indent=2) + "\n", encoding="utf-8")


def _read_model(path: Path, model_type: type[BaseModel]) -> BaseModel:
    if not path.exists():
        raise HTTPException(status_code=409, detail="No preview proposal exists for this document. Run Preview first.")
    try:
        return model_type.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=409, detail="The saved preview proposal is invalid. Run Preview again.") from error


def _actor_role(actor: str | None, role: str | None) -> tuple[str, str]:
    return actor or "demo.user", role or "admin"


def _require_apply(runtime: WebRuntime, role: str) -> None:
    if not runtime.governance.can_apply(role):
        raise HTTPException(status_code=403, detail=f"Role '{role}' is not allowed to apply governed AI changes")


def create_app(runtime: WebRuntime | None = None) -> FastAPI:
    runtime = runtime or WebRuntime()
    scheduler_task: asyncio.Task | None = None

    async def ingestion_loop() -> None:
        # Re-read scheduler settings frequently so changes made in the UI
        # take effect without waiting for an old poll interval to expire.
        loop = asyncio.get_running_loop()
        next_scan_at: float | None = None
        previous_poll_seconds: int | None = None

        while True:
            settings = runtime.get_ingestion_settings()
            now = loop.time()

            if not settings.enabled:
                next_scan_at = None
                previous_poll_seconds = None
                await asyncio.sleep(5)
                continue

            # Enabling the schedule or changing its interval should take
            # effect promptly instead of waiting for the previous interval.
            if (
                next_scan_at is None
                or previous_poll_seconds != settings.poll_seconds
            ):
                next_scan_at = now
                previous_poll_seconds = settings.poll_seconds

            if now >= next_scan_at:
                try:
                    await asyncio.to_thread(runtime.scan_ingestion_folder)
                except Exception as error:
                    print(f"Scheduled ingestion failed: {error}", flush=True)

                next_scan_at = loop.time() + settings.poll_seconds

            await asyncio.sleep(5)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        nonlocal scheduler_task
        scheduler_task = asyncio.create_task(ingestion_loop())
        yield
        if scheduler_task:
            scheduler_task.cancel()
        runtime.close()

    app = FastAPI(
        title="StratAlign Document & Performance Intelligence POC API",
        version="1.0.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH"],
        allow_headers=["Content-Type", "X-User-Role", "X-User-Name"],
    )

    @app.exception_handler(PixelRAGError)
    @app.exception_handler(TileResolutionError)
    @app.exception_handler(VLMError)
    @app.exception_handler(StructuredOutputError)
    async def upstream_error_handler(_request, error: RuntimeError) -> JSONResponse:
        return JSONResponse(status_code=502, content={"detail": str(error)})

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "stratalign-pixelrag-poc", "version": "1.0.0"}

    @app.get("/api/documents")
    def list_documents() -> dict[str, Any]:
        return runtime.documents.list_state().model_dump(mode="json")

    @app.post("/api/documents/upload")
    def upload_document(
        file: UploadFile = File(...),
        x_user_name: str | None = Header(default=None),
        x_user_role: str | None = Header(default=None),
    ) -> dict[str, Any]:
        actor, role = _actor_role(x_user_name, x_user_role)
        try:
            content = file.file.read(50 * 1024 * 1024 + 1)
            record = runtime.documents.upload(file.filename or "uploaded.pdf", content, file.content_type)
            record = runtime.documents.index(record.id)
            runtime.audit.append("document.uploaded", "document", resource_id=record.id, actor=actor, role=role, detail={"name": record.name, "type": record.original_type})
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        finally:
            file.file.close()
        return record.model_dump(mode="json")

    @app.post("/api/documents/{document_id}/select")
    def select_document(
        document_id: str,
        x_user_name: str | None = Header(default=None),
        x_user_role: str | None = Header(default=None),
    ) -> dict[str, Any]:
        actor, role = _actor_role(x_user_name, x_user_role)
        try:
            selected = runtime.documents.select(document_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Document not found") from error
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        runtime.process_manager.stop()
        runtime.audit.append("document.selected", "document", resource_id=document_id, actor=actor, role=role)
        return selected.model_dump(mode="json")

    @app.post("/api/documents/{document_id}/reindex")
    def reindex_document(document_id: str) -> dict[str, Any]:
        try:
            record = runtime.documents.index(document_id)
            runtime.extractions.invalidate(document_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Document not found") from error
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return record.model_dump(mode="json")

    @app.post("/api/documents/{document_id}/reanalyze")
    def reanalyze_document(document_id: str) -> dict[str, Any]:
        try:
            runtime.documents.select(document_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Document not found") from error
        runtime.extractions.invalidate(document_id)
        extraction, cached = runtime.extraction(force=True)
        runtime.audit.append("document.reanalyzed", "document", resource_id=document_id, detail={"kpis": len(extraction.kpis)})
        return {"cached": cached, "extraction": extraction.model_dump(mode="json")}

    @app.get("/api/spm-data")
    def spm_data() -> dict[str, Any]:
        return runtime.repository().read().model_dump(mode="json")

    @app.post("/api/qa")
    def qa(payload: QARequest, x_user_role: str | None = Header(default=None)) -> dict[str, Any]:
        document = runtime.selected_document()
        role = x_user_role or "admin"
        question = payload.question.strip()
        if role == "executive":
            question += " Answer concisely and emphasize strategic impact, material risks, and decisions."
        elif role == "data_steward":
            question += " Emphasize exact values, periods, source evidence, and data quality caveats."
        result = runtime.document_service().ask(question, payload.top_k)
        runtime.audit.append("ai.question", "document", resource_id=document.id, role=role, detail={"question": payload.question[:300]})
        return {
            "document_id": document.id,
            "answer": result.answer,
            "evidence": result.evidence,
            "tiles": [
                {
                    "score": tile.hit.score,
                    "article_id": tile.hit.article_id,
                    "tile_index": tile.hit.tile_index,
                    "chunk_index": tile.hit.chunk_index,
                    "image_url": f"/api/documents/{document.id}/evidence/{tile.hit.article_id}/{tile.hit.tile_index}/{tile.hit.chunk_index}",
                }
                for tile in result.tiles
            ],
        }

    @app.post("/api/qa/multi")
    def multi_document_qa(payload: MultiDocumentQARequest) -> dict[str, Any]:
        settings = runtime.governance.get()
        ids = list(dict.fromkeys(payload.document_ids))
        if not ids:
            raise HTTPException(status_code=422, detail="Select at least one document")
        if len(ids) > settings.max_multi_document_sources:
            raise HTTPException(status_code=400, detail=f"Multi-document Q&A is limited to {settings.max_multi_document_sources} sources in this POC")
        if os.getenv("PIXELRAG_BASE_URL") and len(ids) > 1:
            raise HTTPException(status_code=409, detail="Multi-document Q&A requires the managed local PixelRAG process in this POC")
        blocks: list[str] = []
        sources: list[dict[str, Any]] = []
        for document_id in ids:
            document = runtime.documents.get(document_id)
            answer = runtime.document_service_for(document_id).ask(payload.question, payload.top_k_per_document)
            blocks.append(f"SOURCE: {document.name}\nANSWER: {answer.answer}\nEVIDENCE: {'; '.join(answer.evidence)}")
            sources.append({"document_id": document.id, "document_name": document.name, "answer": answer.answer, "evidence": answer.evidence})
        synthesis = OpenAICompatibleVLMReader.from_env().synthesize_text(payload.question, blocks)
        return {"answer": synthesis.answer, "evidence": synthesis.evidence, "sources": sources}

    @app.get("/api/documents/{document_id}/evidence/{article_id}/{tile_index}/{chunk_index}")
    def evidence(document_id: str, article_id: int, tile_index: int, chunk_index: int) -> FileResponse:
        if article_id < 0 or tile_index < 0 or chunk_index < 0:
            raise HTTPException(status_code=404, detail="Evidence tile not found")
        try:
            path = runtime.resolve_evidence(document_id, article_id, tile_index, chunk_index)
        except TileResolutionError as error:
            raise HTTPException(status_code=404, detail="Evidence tile not found") from error
        return FileResponse(path, media_type="image/jpeg", filename=path.name)

    @app.post("/api/smart-import/preview")
    def smart_import_preview(
        x_user_name: str | None = Header(default=None),
        x_user_role: str | None = Header(default=None),
    ) -> dict[str, Any]:
        actor, role = _actor_role(x_user_name, x_user_role)
        document = runtime.selected_document()
        extracted, cached = runtime.extraction()
        proposal = runtime.smart_import_service().preview(extracted)
        proposal.extraction_cached = cached
        job = runtime.workflows.create("smart_import", document.id, document.name, proposal.model_dump(mode="json"), actor, role, extracted.extraction_version)
        proposal.job_id = job.id
        _write_model(runtime.proposal_path("smart-import"), proposal)
        runtime.workflows.update(job.id, proposal=proposal.model_dump(mode="json"))
        runtime.audit.append("smart_import.previewed", "workflow", resource_id=job.id, actor=actor, role=role, detail={"cached": cached, "creates": sum(i.action == "create" for i in proposal.objectives + proposal.kpis + proposal.initiatives)})
        return proposal.model_dump(mode="json")

    @app.post("/api/data-capture/preview")
    def data_capture_preview(
        x_user_name: str | None = Header(default=None),
        x_user_role: str | None = Header(default=None),
    ) -> dict[str, Any]:
        actor, role = _actor_role(x_user_name, x_user_role)
        document = runtime.selected_document()
        extracted, cached = runtime.extraction()
        proposal = runtime.data_capture_service().preview(extracted)
        proposal.extraction_cached = cached
        job = runtime.workflows.create("data_capture", document.id, document.name, proposal.model_dump(mode="json"), actor, role, extracted.extraction_version)
        proposal.job_id = job.id
        _write_model(runtime.proposal_path("data-capture"), proposal)
        runtime.workflows.update(job.id, proposal=proposal.model_dump(mode="json"))
        runtime.audit.append("data_capture.previewed", "workflow", resource_id=job.id, actor=actor, role=role, detail={"cached": cached, "updates": len(proposal.updates)})
        return proposal.model_dump(mode="json")

    @app.post("/api/intelligence")
    def intelligence(payload: IntelligenceRequest, x_user_role: str | None = Header(default=None)) -> dict[str, Any]:
        role = x_user_role or "admin"
        subject = payload.subject or "the selected performance report"
        prompts = {
            "variance_explanation": f"Explain the main variance and likely documented causes for {subject}. Separate visible facts from interpretation.",
            "executive_summary": "Create a concise executive performance brief: strategic health, material KPI movements, risks, initiatives, and decisions required.",
            "explain_kpi": f"Explain the current performance of KPI '{subject}', including target, actual, trend, causes, risks and relevant initiative evidence.",
            "objective_health": f"Assess the health of objective '{subject}' from the report: KPI drivers, positives, risks, and management actions.",
            "initiative_impact": f"Assess whether initiative '{subject}' is delivering intended KPI outcomes. Contrast progress/activity with measurable performance results.",
            "recommendations": f"Provide evidence-backed management recommendations for {subject}. Do not invent facts; distinguish report evidence from recommendations.",
        }
        prompt = prompts[payload.kind]
        if role == "executive":
            prompt += " Keep it board-ready and decision-oriented."
        elif role == "data_steward":
            prompt += " Focus on data quality, exact values, periods, and provenance."
        result = runtime.document_service().ask(prompt, top_k=5)
        document = runtime.selected_document()
        return {"kind": payload.kind, "subject": payload.subject, "answer": result.answer, "evidence": result.evidence, "document_id": document.id}

    @app.get("/api/forecast/{kpi_name}")
    def forecast(kpi_name: str) -> dict[str, Any]:
        return ForecastService(runtime.repository()).forecast(kpi_name).model_dump(mode="json")

    @app.get("/api/lineage/kpi/{kpi_name}")
    def lineage(kpi_name: str) -> dict[str, Any]:
        data = runtime.repository().read()
        measurements = [item for item in data.measurements if item.kpi_name.casefold() == kpi_name.casefold()]
        return {"kpi_name": kpi_name, "measurements": [item.model_dump(mode="json") for item in measurements]}

    @app.get("/api/alerts")
    def alerts() -> list[dict[str, Any]]:
        return [item.model_dump(mode="json") for item in reversed(runtime.repository().read().alerts)]

    @app.post("/api/alerts/{alert_id}/acknowledge")
    def acknowledge_alert(alert_id: str) -> dict[str, Any]:
        data = runtime.repository().read()
        for alert in data.alerts:
            if alert.id == alert_id:
                alert.acknowledged = True
                runtime.repository().write(data)
                return alert.model_dump(mode="json")
        raise HTTPException(status_code=404, detail="Alert not found")

    @app.get("/api/governance")
    def governance() -> dict[str, Any]:
        return runtime.governance.get().model_dump(mode="json")

    @app.put("/api/governance")
    def update_governance(settings: GovernanceSettings, x_user_role: str | None = Header(default=None)) -> dict[str, Any]:
        role = x_user_role or "admin"
        if role != "admin":
            raise HTTPException(status_code=403, detail="Only admins can change AI governance settings")
        runtime.governance.set(settings)
        runtime.audit.append("governance.updated", "governance", role=role, detail=settings.model_dump(mode="json"))
        return settings.model_dump(mode="json")

    @app.get("/api/audit")
    def audit(limit: int = 100) -> list[dict[str, Any]]:
        return [item.model_dump(mode="json") for item in runtime.audit.list(max(1, min(limit, 500)))]

    @app.get("/api/workflows")
    def workflows(limit: int = 100) -> list[dict[str, Any]]:
        return [item.model_dump(mode="json") for item in runtime.workflows.list(max(1, min(limit, 500)))]

    @app.get("/api/ingestion/settings")
    def ingestion_settings() -> dict[str, Any]:
        return runtime.get_ingestion_settings().model_dump(mode="json")

    @app.put("/api/ingestion/settings")
    def update_ingestion_settings(settings: IngestionSettings) -> dict[str, Any]:
        return runtime.set_ingestion_settings(settings).model_dump(mode="json")

    @app.post("/api/ingestion/scan")
    def scan_ingestion() -> dict[str, Any]:
        try:
            results = runtime.scan_ingestion_folder()
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return {"results": results, "supported_types": sorted(SUPPORTED_EXTENSIONS)}

    @app.get("/api/connectors")
    def connector_catalog() -> dict[str, Any]:
        return {
            "active": [{"id": "watched-folder", "name": "Local Watched Folder", "status": "ready"}],
            "adapter_ready": [
                {"id": "sharepoint", "name": "SharePoint / OneDrive", "status": "credentials_required"},
                {"id": "google-drive", "name": "Google Drive", "status": "credentials_required"},
                {"id": "api", "name": "External API", "status": "configuration_required"},
                {"id": "email", "name": "Email Attachments", "status": "configuration_required"},
            ],
            "note": "External connector credentials are intentionally not bundled with the local POC.",
        }

    return app


app = create_app()
