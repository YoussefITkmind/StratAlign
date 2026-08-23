"""Enterprise-style supporting services for the StratAlign PixelRAG POC.

These services deliberately use local JSON/filesystem persistence so the POC remains
portable. Their interfaces mirror production concerns: extraction snapshots, audit,
governance, workflow staging, alerts, forecasting, and watched-folder ingestion.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .models import (
    AuditEvent,
    ExtractedSPMDocument,
    ForecastPoint,
    ForecastResult,
    GovernanceSettings,
    WorkflowJob,
)
from .storage import MockSPMRepository


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


class ExtractionSnapshotStore:
    """Stable extraction cache keyed by the immutable source document fingerprint."""

    def __init__(self, root: Path | str) -> None:
        self.root = Path(root).resolve()
        self.directory = self.root / "mock-data" / "extractions"

    def path(self, document_id: str) -> Path:
        return self.directory / f"{document_id}.json"

    @staticmethod
    def fingerprint(source_path: Path) -> str:
        digest = hashlib.sha256()
        with source_path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def get(self, document_id: str, source_path: Path) -> ExtractedSPMDocument | None:
        path = self.path(document_id)
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if payload.get("source_fingerprint") != self.fingerprint(source_path):
                return None
            return ExtractedSPMDocument.model_validate(payload["extraction"])
        except (OSError, ValueError, KeyError):
            return None

    def put(self, document_id: str, source_path: Path, extraction: ExtractedSPMDocument) -> None:
        atomic_json(self.path(document_id), {
            "source_fingerprint": self.fingerprint(source_path),
            "saved_at": utcnow(),
            "extraction": extraction.model_dump(mode="json"),
        })

    def invalidate(self, document_id: str) -> None:
        self.path(document_id).unlink(missing_ok=True)


class AuditLog:
    def __init__(self, root: Path | str) -> None:
        self.path = Path(root).resolve() / "mock-data" / "audit.jsonl"

    def append(
        self,
        action: str,
        resource: str,
        *,
        resource_id: str | None = None,
        actor: str = "demo.user",
        role: str = "admin",
        detail: dict | None = None,
    ) -> AuditEvent:
        event = AuditEvent(
            id=f"audit-{uuid.uuid4().hex[:12]}",
            at=utcnow(),
            actor=actor,
            role=role,
            action=action,
            resource=resource,
            resource_id=resource_id,
            detail=detail or {},
        )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(event.model_dump_json() + "\n")
        return event

    def list(self, limit: int = 100) -> list[AuditEvent]:
        if not self.path.exists():
            return []
        rows: list[AuditEvent] = []
        for line in self.path.read_text(encoding="utf-8").splitlines():
            try:
                rows.append(AuditEvent.model_validate_json(line))
            except ValueError:
                continue
        return list(reversed(rows[-limit:]))


class GovernanceStore:
    def __init__(self, root: Path | str) -> None:
        self.path = Path(root).resolve() / "mock-data" / "governance.json"

    def get(self) -> GovernanceSettings:
        if not self.path.exists():
            settings = GovernanceSettings()
            self.set(settings)
            return settings
        try:
            return GovernanceSettings.model_validate_json(self.path.read_text(encoding="utf-8"))
        except ValueError:
            return GovernanceSettings()

    def set(self, settings: GovernanceSettings) -> GovernanceSettings:
        atomic_json(self.path, settings.model_dump(mode="json"))
        return settings

    def can_apply(self, role: str) -> bool:
        return role in self.get().allowed_apply_roles


class WorkflowStore:
    def __init__(self, root: Path | str) -> None:
        self.path = Path(root).resolve() / "mock-data" / "workflow-jobs.json"

    def _load(self) -> list[WorkflowJob]:
        if not self.path.exists():
            return []
        try:
            return [WorkflowJob.model_validate(item) for item in json.loads(self.path.read_text(encoding="utf-8"))]
        except (OSError, ValueError):
            return []

    def _save(self, jobs: list[WorkflowJob]) -> None:
        atomic_json(self.path, [item.model_dump(mode="json") for item in jobs])

    def create(self, kind: str, document_id: str, document_name: str, proposal: dict, actor: str, role: str, extraction_version: str) -> WorkflowJob:
        now = utcnow()
        job = WorkflowJob(
            id=f"job-{uuid.uuid4().hex[:12]}",
            kind=kind, document_id=document_id, document_name=document_name,
            created_at=now, updated_at=now, actor=actor, role=role,
            extraction_version=extraction_version, proposal=proposal,
        )
        jobs = self._load()
        jobs.append(job)
        self._save(jobs[-500:])
        return job

    def get(self, job_id: str) -> WorkflowJob:
        for job in self._load():
            if job.id == job_id:
                return job
        raise KeyError(job_id)

    def update(self, job_id: str, *, status: str | None = None, proposal: dict | None = None) -> WorkflowJob:
        jobs = self._load()
        for index, job in enumerate(jobs):
            if job.id != job_id:
                continue
            changes: dict[str, Any] = {"updated_at": utcnow()}
            if status is not None:
                changes["status"] = status
            if proposal is not None:
                changes["proposal"] = proposal
            updated = job.model_copy(update=changes)
            jobs[index] = updated
            self._save(jobs)
            return updated
        raise KeyError(job_id)

    def list(self, limit: int = 100) -> list[WorkflowJob]:
        return list(reversed(self._load()[-limit:]))


class ForecastService:
    """Simple explainable linear-trend forecast over period-aware KPI measurements."""

    def __init__(self, repository: MockSPMRepository) -> None:
        self.repository = repository

    @staticmethod
    def _number(value: str) -> float | None:
        match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
        return float(match.group()) if match else None

    def forecast(self, kpi_name: str) -> ForecastResult:
        measurements = [
            item for item in self.repository.read().measurements
            if item.kpi_name.casefold() == kpi_name.casefold()
        ]
        points: list[ForecastPoint] = []
        for item in measurements:
            value = self._number(item.actual)
            if value is not None:
                points.append(ForecastPoint(period=item.period, actual=value))
        if len(points) < 2:
            return ForecastResult(
                kpi_name=kpi_name,
                history=points,
                forecast_period="next period",
                forecast_value=None,
                note="At least two period measurements are required for a trend forecast.",
            )
        xs = list(range(len(points)))
        mean_x = sum(xs) / len(xs)
        mean_y = sum(point.actual for point in points) / len(points)
        denom = sum((x - mean_x) ** 2 for x in xs)
        slope = sum((x - mean_x) * (point.actual - mean_y) for x, point in zip(xs, points)) / denom if denom else 0.0
        intercept = mean_y - slope * mean_x
        predicted = intercept + slope * len(points)
        return ForecastResult(
            kpi_name=kpi_name,
            history=points,
            forecast_period="next period",
            forecast_value=round(predicted, 2),
            note="Explainable linear trend only; this is not a production predictive model.",
        )
