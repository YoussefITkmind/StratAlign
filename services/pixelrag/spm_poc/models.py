"""Pydantic data contracts for retrieval, extraction, governed workflows, and intelligence."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class RetrievalResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    score: float
    article_id: int
    tile_index: int
    chunk_index: int = 0
    path: str | None = None
    url: str | None = None


class ResolvedTile(BaseModel):
    hit: RetrievalResult
    image_path: Path


class EvidenceRef(BaseModel):
    document_id: str | None = None
    document_name: str | None = None
    article_id: int | None = None
    tile_index: int | None = None
    chunk_index: int = 0
    score: float | None = None
    page_hint: str | None = None


class VLMAnswer(BaseModel):
    answer: str
    evidence: list[str] = Field(default_factory=list)


class DocumentAnswer(BaseModel):
    answer: str
    evidence: list[str] = Field(default_factory=list)
    tiles: list[ResolvedTile]


class Objective(BaseModel):
    name: str | None = None
    owner: str | None = None
    status: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    evidence: list[EvidenceRef] = Field(default_factory=list)


class KPI(BaseModel):
    name: str | None = None
    target: str | None = None
    actual: str | None = None
    status: str | None = None
    category: Literal["kpi", "financial", "risk", "operational", "people", "other"] = "kpi"
    unit: str | None = None
    period: str | None = None
    aliases: list[str] = Field(default_factory=list)
    confidence: float | None = Field(default=None, ge=0, le=1)
    evidence: list[EvidenceRef] = Field(default_factory=list)


class Initiative(BaseModel):
    name: str | None = None
    owner: str | None = None
    status: str | None = None
    planned_completion: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    evidence: list[EvidenceRef] = Field(default_factory=list)


class ExtractedSPMDocument(BaseModel):
    reporting_period: str | None = None
    objectives: list[Objective] = Field(default_factory=list)
    kpis: list[KPI] = Field(default_factory=list)
    initiatives: list[Initiative] = Field(default_factory=list)
    extracted_at: str | None = None
    source_document_id: str | None = None
    source_document_name: str | None = None
    extraction_version: str = "v1"


class KPIMeasurement(BaseModel):
    id: str
    kpi_name: str
    period: str
    actual: str
    source_document_id: str | None = None
    source_document_name: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    evidence: list[EvidenceRef] = Field(default_factory=list)
    recorded_at: str


class Alert(BaseModel):
    id: str
    severity: Literal["info", "warning", "critical"]
    kind: str
    title: str
    message: str
    kpi_name: str | None = None
    document_id: str | None = None
    created_at: str
    acknowledged: bool = False


class MockObjective(Objective):
    model_config = ConfigDict(extra="allow")


class MockKPI(KPI):
    model_config = ConfigDict(extra="allow")


class MockInitiative(Initiative):
    model_config = ConfigDict(extra="allow")


class MockSPMData(BaseModel):
    """Typed view of the local store; unknown data is retained on writes."""

    model_config = ConfigDict(extra="allow")

    objectives: list[MockObjective] = Field(default_factory=list)
    kpis: list[MockKPI] = Field(default_factory=list)
    initiatives: list[MockInitiative] = Field(default_factory=list)
    measurements: list[KPIMeasurement] = Field(default_factory=list)
    alerts: list[Alert] = Field(default_factory=list)


class ProposedObjective(Objective):
    action: Literal["create", "skip"]
    reason: str | None = None
    selected: bool = True
    edited: bool = False


class ProposedKPI(KPI):
    action: Literal["create", "skip"]
    reason: str | None = None
    selected: bool = True
    edited: bool = False


class ProposedInitiative(Initiative):
    action: Literal["create", "skip"]
    reason: str | None = None
    selected: bool = True
    edited: bool = False


class SmartImportProposal(BaseModel):
    job_id: str | None = None
    document_id: str | None = None
    reporting_period: str | None = None
    objectives: list[ProposedObjective] = Field(default_factory=list)
    kpis: list[ProposedKPI] = Field(default_factory=list)
    initiatives: list[ProposedInitiative] = Field(default_factory=list)
    status: Literal["awaiting_review", "approved", "applied", "rejected"] = "awaiting_review"
    extraction_cached: bool = False


class KPIUpdateMatch(BaseModel):
    extracted_kpi: str | None = None
    matched_kpi: str | None = None
    current_actual: str | None = None
    proposed_actual: str | None = None
    period: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    match_score: float | None = Field(default=None, ge=0, le=1)
    source_document_id: str | None = None
    source_document_name: str | None = None
    evidence: list[EvidenceRef] = Field(default_factory=list)
    match_status: Literal["matched", "unmatched", "ambiguous", "missing_actual", "low_confidence"]
    matched_index: int | None = None
    selected: bool = True


class DataCaptureProposal(BaseModel):
    job_id: str | None = None
    document_id: str | None = None
    reporting_period: str | None = None
    updates: list[KPIUpdateMatch] = Field(default_factory=list)
    status: Literal["awaiting_review", "approved", "applied", "rejected"] = "awaiting_review"
    extraction_cached: bool = False


class ApplyResult(BaseModel):
    created_objectives: int = 0
    created_kpis: int = 0
    created_initiatives: int = 0
    updated_kpis: int = 0
    created_measurements: int = 0
    generated_alerts: int = 0
    skipped: int = 0
    job_id: str | None = None


class GovernanceSettings(BaseModel):
    require_human_approval: bool = True
    minimum_extraction_confidence: float = Field(default=0.70, ge=0, le=1)
    minimum_match_confidence: float = Field(default=0.78, ge=0, le=1)
    allow_automatic_writes: bool = False
    retain_evidence: bool = True
    retain_audit_history: bool = True
    allowed_apply_roles: list[str] = Field(default_factory=lambda: ["admin", "data_steward"])
    max_multi_document_sources: int = Field(default=3, ge=1, le=10)


class AuditEvent(BaseModel):
    id: str
    at: str
    actor: str
    role: str
    action: str
    resource: str
    resource_id: str | None = None
    detail: dict = Field(default_factory=dict)


class WorkflowJob(BaseModel):
    id: str
    kind: Literal["smart_import", "data_capture"]
    document_id: str
    document_name: str
    status: Literal["awaiting_review", "approved", "applied", "rejected"] = "awaiting_review"
    created_at: str
    updated_at: str
    actor: str = "demo.user"
    role: str = "admin"
    extraction_version: str = "v1"
    proposal: dict = Field(default_factory=dict)


class MultiDocumentQARequest(BaseModel):
    question: str
    document_ids: list[str]
    top_k_per_document: int = 3


class IntelligenceRequest(BaseModel):
    kind: Literal[
        "variance_explanation",
        "executive_summary",
        "explain_kpi",
        "objective_health",
        "initiative_impact",
        "recommendations",
    ]
    subject: str | None = None


class IntelligenceResult(BaseModel):
    kind: str
    subject: str | None = None
    answer: str
    evidence: list[str] = Field(default_factory=list)
    document_id: str | None = None


class ForecastPoint(BaseModel):
    period: str
    actual: float


class ForecastResult(BaseModel):
    kpi_name: str
    unit: str | None = None
    history: list[ForecastPoint] = Field(default_factory=list)
    forecast_period: str
    forecast_value: float | None = None
    method: str = "linear_trend"
    note: str | None = None
