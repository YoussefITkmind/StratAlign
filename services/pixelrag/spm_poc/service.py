"""Application orchestration for grounded Q&A and comprehensive SPM extraction."""

from __future__ import annotations

from .models import DocumentAnswer, EvidenceRef, ExtractedSPMDocument, Initiative, KPI, Objective
from .pixelrag import PixelRAGClient
from .tiles import TileResolver
from .vlm import VLMReader


class DocumentService:
    def __init__(self, pixelrag: PixelRAGClient, resolver: TileResolver, reader: VLMReader) -> None:
        self.pixelrag = pixelrag
        self.resolver = resolver
        self.reader = reader

    def ask(self, question: str, top_k: int = 3) -> DocumentAnswer:
        tiles = self.resolver.resolve_all(self.pixelrag.search(question, top_k))
        answer = self.reader.answer(question, [tile.image_path for tile in tiles])
        return DocumentAnswer(answer=answer.answer, evidence=answer.evidence, tiles=tiles)

    def extract_spm(self, top_k: int = 5) -> ExtractedSPMDocument:
        """Legacy single-pass extraction retained for compatibility and tests."""
        query = "SPM objectives and owners, KPIs targets actuals statuses, and initiatives"
        tiles = self.resolver.resolve_all(self.pixelrag.search(query, top_k))
        return self.reader.extract_spm([tile.image_path for tile in tiles])

    def extract_spm_comprehensive(self, top_k: int = 5) -> ExtractedSPMDocument:
        """Targeted multi-pass extraction.

        Strategy reports scatter objectives, KPIs, financial measures and initiatives across
        different pages. Separate retrieval passes make coverage much more reliable; the
        result is then cached by the web runtime so repeat previews are stable.
        """
        queries = [
            "all strategic objectives goals objective owners strategic priorities objective status objective health",
            "all KPIs performance measures metrics targets actuals results RAG status financial operational people measures",
            "Digital Growth Operational Excellence measures Q1 Q2 Q3 target status digital adoption journey completion conversion cost to serve cases per FTE automation straight-through",
            "People Capability Financial View measures actual target budget variance employee capability learning vacancy attrition transformation spend benefits operating cost savings",
            "all initiatives projects programmes transformation initiatives owners milestones status completion dates",
            "reporting period quarter fiscal year performance period executive summary",
        ]
        extractions: list[ExtractedSPMDocument] = []
        for query in queries:
            tiles = self.resolver.resolve_all(self.pixelrag.search(query, top_k))
            if not tiles:
                continue
            extraction = self.reader.extract_spm([tile.image_path for tile in tiles])
            refs = [EvidenceRef(
                article_id=tile.hit.article_id,
                tile_index=tile.hit.tile_index,
                chunk_index=tile.hit.chunk_index,
                score=tile.hit.score,
            ) for tile in tiles]
            for item in [*extraction.objectives, *extraction.kpis, *extraction.initiatives]:
                if not item.evidence:
                    item.evidence = refs
            extractions.append(extraction)
        if not extractions:
            return ExtractedSPMDocument()
        return self._merge(extractions)

    @staticmethod
    def _key(value: str | None) -> str:
        return " ".join((value or "").casefold().replace("-", " ").split())

    @classmethod
    def _merge(cls, extractions: list[ExtractedSPMDocument]) -> ExtractedSPMDocument:
        objective_map: dict[str, Objective] = {}
        kpi_map: dict[str, KPI] = {}
        initiative_map: dict[str, Initiative] = {}
        period: str | None = None

        def choose(existing, incoming):
            if existing is None:
                return incoming
            payload = existing.model_dump()
            for field, value in incoming.model_dump().items():
                current = payload.get(field)
                if value not in (None, "", [], {}) and current in (None, "", [], {}):
                    payload[field] = value
                elif field == "confidence" and value is not None:
                    payload[field] = max(current or 0, value)
                elif field == "aliases" and value:
                    payload[field] = sorted(set((current or []) + value))
                elif field == "evidence" and value:
                    seen = {str(item) for item in current or []}
                    payload[field] = (current or []) + [item for item in value if str(item) not in seen]
            return existing.__class__.model_validate(payload)

        for extraction in extractions:
            if not period and extraction.reporting_period:
                period = extraction.reporting_period
            for item in extraction.objectives:
                key = cls._key(item.name)
                if key:
                    objective_map[key] = choose(objective_map.get(key), item)
            for item in extraction.kpis:
                key = cls._key(item.name)
                if key:
                    kpi_map[key] = choose(kpi_map.get(key), item)
            for item in extraction.initiatives:
                key = cls._key(item.name)
                if key:
                    initiative_map[key] = choose(initiative_map.get(key), item)

        return ExtractedSPMDocument(
            reporting_period=period,
            objectives=list(objective_map.values()),
            kpis=list(kpi_map.values()),
            initiatives=list(initiative_map.values()),
            extraction_version="comprehensive-v2",
        )
