"""Governed preview/apply workflows for Smart Import and period-aware KPI Data Capture."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from difflib import SequenceMatcher

from .models import (
    Alert,
    ApplyResult,
    DataCaptureProposal,
    ExtractedSPMDocument,
    KPIMeasurement,
    KPIUpdateMatch,
    MockInitiative,
    MockKPI,
    MockObjective,
    ProposedInitiative,
    ProposedKPI,
    ProposedObjective,
    SmartImportProposal,
)
from .storage import MockSPMRepository


def normalize_name(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").casefold()).strip()


def _compact(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").casefold())


_COMMON_ALIASES = {
    "csat": "customer satisfaction",
    "customersatisfactionscore": "customer satisfaction",
    "nps": "net promoter score",
    "fcr": "first contact resolution",
    "art": "average response time",
}


def _canonical(value: str | None) -> str:
    normalized = normalize_name(value)
    compact = _compact(value)
    return _COMMON_ALIASES.get(compact, normalized)


def _name_similarity(left: str | None, right: str | None, aliases: list[str] | None = None) -> float:
    a = _canonical(left)
    b = _canonical(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if aliases:
        for alias in aliases:
            if _canonical(alias) == a:
                return 0.98
    seq = SequenceMatcher(None, a, b).ratio()
    ta, tb = set(a.split()), set(b.split())
    jaccard = len(ta & tb) / len(ta | tb) if ta | tb else 0.0
    return max(seq, jaccard)


class SmartImportService:
    def __init__(self, repository: MockSPMRepository) -> None:
        self.repository = repository

    def preview(self, extracted: ExtractedSPMDocument) -> SmartImportProposal:
        current = self.repository.read()
        objective_names = {normalize_name(item.name) for item in current.objectives if item.name}
        kpi_names = {normalize_name(item.name) for item in current.kpis if item.name}
        initiative_names = {normalize_name(item.name) for item in current.initiatives if item.name}

        objectives = self._propose(extracted.objectives, objective_names, ProposedObjective)
        kpis = self._propose(extracted.kpis, kpi_names, ProposedKPI)
        initiatives = self._propose(extracted.initiatives, initiative_names, ProposedInitiative)
        return SmartImportProposal(
            document_id=extracted.source_document_id,
            reporting_period=extracted.reporting_period,
            objectives=objectives,
            kpis=kpis,
            initiatives=initiatives,
        )

    @staticmethod
    def _propose(items, existing_names: set[str], proposal_type):
        proposed = []
        seen = set(existing_names)
        for item in items:
            name = normalize_name(item.name)
            payload = item.model_dump(exclude_unset=True)
            if not name:
                proposed.append(proposal_type(**payload, action="skip", reason="missing name", selected=False))
            elif name in seen:
                proposed.append(proposal_type(**payload, action="skip", reason="duplicate name", selected=False))
            else:
                proposed.append(proposal_type(**payload, action="create", selected=True))
                seen.add(name)
        return proposed

    def apply(self, proposal: SmartImportProposal) -> ApplyResult:
        data = self.repository.read()
        result = ApplyResult(job_id=proposal.job_id)
        collections = (
            (proposal.objectives, data.objectives, MockObjective, "created_objectives"),
            (proposal.kpis, data.kpis, MockKPI, "created_kpis"),
            (proposal.initiatives, data.initiatives, MockInitiative, "created_initiatives"),
        )
        for proposed, stored, record_type, count_field in collections:
            names = {normalize_name(item.name) for item in stored if item.name}
            for item in proposed:
                name = normalize_name(item.name)
                if item.action != "create" or not item.selected or not name or name in names:
                    result.skipped += 1
                    continue
                payload = item.model_dump(
                    exclude={"action", "reason", "selected", "edited"},
                    exclude_defaults=True,
                    exclude_none=True,
                )
                stored.append(record_type(**payload))
                names.add(name)
                setattr(result, count_field, getattr(result, count_field) + 1)
        self.repository.write(data)
        return result


class DataCaptureService:
    def __init__(self, repository: MockSPMRepository, minimum_match_confidence: float = 0.78) -> None:
        self.repository = repository
        self.minimum_match_confidence = minimum_match_confidence

    def preview(self, extracted: ExtractedSPMDocument) -> DataCaptureProposal:
        data = self.repository.read()
        updates: list[KPIUpdateMatch] = []

        for extracted_kpi in extracted.kpis:
            period = extracted_kpi.period or extracted.reporting_period
            common = {
                "extracted_kpi": extracted_kpi.name,
                "proposed_actual": extracted_kpi.actual,
                "period": period,
                "confidence": extracted_kpi.confidence,
                "source_document_id": extracted.source_document_id,
                "source_document_name": extracted.source_document_name,
                "evidence": extracted_kpi.evidence,
            }
            if extracted_kpi.actual is None:
                updates.append(KPIUpdateMatch(**common, match_status="missing_actual", selected=False))
                continue

            scored: list[tuple[float, int, MockKPI]] = []
            for index, kpi in enumerate(data.kpis):
                score = _name_similarity(extracted_kpi.name, kpi.name, getattr(kpi, "aliases", []))
                if score > 0:
                    scored.append((score, index, kpi))
            scored.sort(key=lambda row: row[0], reverse=True)

            if not scored or scored[0][0] < self.minimum_match_confidence:
                updates.append(KPIUpdateMatch(
                    **common,
                    match_status="unmatched" if not scored else "low_confidence",
                    match_score=scored[0][0] if scored else 0.0,
                    selected=False,
                ))
                continue

            best_score, index, match = scored[0]
            equally_good = [row for row in scored if abs(row[0] - best_score) < 0.01]
            # Preserve the conservative ambiguity rule for exact duplicate names.
            if len(equally_good) > 1:
                updates.append(KPIUpdateMatch(
                    **common, match_status="ambiguous", match_score=best_score, selected=False
                ))
                continue

            updates.append(KPIUpdateMatch(
                **common,
                matched_kpi=match.name,
                current_actual=match.actual,
                match_status="matched",
                match_score=best_score,
                matched_index=index,
                selected=True,
            ))
        return DataCaptureProposal(
            document_id=extracted.source_document_id,
            reporting_period=extracted.reporting_period,
            updates=updates,
        )

    def apply(self, proposal: DataCaptureProposal) -> ApplyResult:
        data = self.repository.read()
        result = ApplyResult(job_id=proposal.job_id)
        now = datetime.now(timezone.utc).isoformat()
        for update in proposal.updates:
            if not update.selected or update.match_status != "matched" or update.matched_index is None:
                result.skipped += 1
                continue
            matches = [
                (index, kpi) for index, kpi in enumerate(data.kpis)
                if normalize_name(kpi.name) == normalize_name(update.matched_kpi)
            ]
            if (
                len(matches) != 1
                or matches[0][0] != update.matched_index
                or matches[0][1].actual != update.current_actual
            ):
                result.skipped += 1
                continue

            previous = matches[0][1].actual
            matches[0][1].actual = update.proposed_actual
            result.updated_kpis += 1

            if update.period and update.proposed_actual is not None and update.matched_kpi:
                duplicate = any(
                    normalize_name(item.kpi_name) == normalize_name(update.matched_kpi)
                    and item.period == update.period
                    and item.source_document_id == update.source_document_id
                    and item.actual == update.proposed_actual
                    for item in data.measurements
                )
                if not duplicate:
                    data.measurements.append(KPIMeasurement(
                        id=f"measure-{uuid.uuid4().hex[:12]}",
                        kpi_name=update.matched_kpi,
                        period=update.period,
                        actual=update.proposed_actual,
                        source_document_id=update.source_document_id,
                        source_document_name=update.source_document_name,
                        confidence=update.confidence,
                        evidence=update.evidence,
                        recorded_at=now,
                    ))
                    result.created_measurements += 1

            alert = self._alert_for_change(update.matched_kpi, previous, update.proposed_actual, update.source_document_id)
            if alert:
                data.alerts.append(alert)
                result.generated_alerts += 1
        self.repository.write(data)
        return result

    @staticmethod
    def _number(value: str | None) -> float | None:
        if not value:
            return None
        match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
        return float(match.group()) if match else None

    def _alert_for_change(self, kpi_name: str | None, previous: str | None, current: str | None, document_id: str | None) -> Alert | None:
        old = self._number(previous)
        new = self._number(current)
        if old is None or new is None or old == 0 or kpi_name is None:
            return None
        change = (new - old) / abs(old)
        if abs(change) < 0.10:
            return None
        direction = "increased" if change > 0 else "decreased"
        return Alert(
            id=f"alert-{uuid.uuid4().hex[:12]}",
            severity="warning" if abs(change) < 0.25 else "critical",
            kind="significant_kpi_change",
            title=f"Significant KPI movement: {kpi_name}",
            message=f"{kpi_name} {direction} from {previous} to {current} ({abs(change) * 100:.1f}% change). Review the source report before acting.",
            kpi_name=kpi_name,
            document_id=document_id,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
