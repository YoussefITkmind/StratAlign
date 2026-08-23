"""Deterministic baseline data for the standalone PixelRAG demonstration.

The real StratAlign integration is proposal-only, so this dataset lives only in the
isolated PixelRAG JSON store.  It represents a small amount of strategy/KPI state
that would already exist before a new performance report is captured.
"""

from __future__ import annotations

from .models import Alert, KPIMeasurement, MockInitiative, MockKPI, MockObjective, MockSPMData
from .storage import MockSPMRepository


_BASELINE_RECORDED_AT = "2026-06-30T12:00:00+00:00"


def demo_baseline() -> MockSPMData:
    """Return a fresh deterministic POC baseline.

    The values are intentionally pre-Q3 where possible so Data Capture can propose
    the Q3 measurements extracted from the demonstration report rather than making
    the current report look as though it has already been applied.
    """
    return MockSPMData(
        objectives=[
            MockObjective(
                name="Improve Customer Experience",
                owner="Customer Experience Director",
                status="Amber",
                confidence=1.0,
            ),
        ],
        kpis=[
            MockKPI(
                name="Customer Satisfaction",
                aliases=["CSAT", "Customer Satisfaction (CSAT)", "Customer Satisfaction Score"],
                target=">= 90%",
                actual="82%",
                status="Amber",
                period="Q2 FY2026",
                category="kpi",
            ),
            MockKPI(
                name="Average Response Time",
                aliases=["ART"],
                target="< 2.0 hours",
                actual="1.8 hours",
                status="Green",
                period="Q2 FY2026",
                category="operational",
            ),
            MockKPI(
                name="First Contact Resolution",
                aliases=["FCR"],
                target=">= 80%",
                actual="72%",
                status="Amber",
                period="Q2 FY2026",
                category="operational",
            ),
            MockKPI(
                name="Complaint Reopen Rate",
                target="<= 5%",
                actual="7.1%",
                status="Red",
                period="Q2 FY2026",
                category="operational",
            ),
            MockKPI(
                name="Digital Self-Service Adoption",
                target=">= 65%",
                actual="64%",
                status="Amber",
                period="Q2 FY2026",
                category="kpi",
            ),
            MockKPI(
                name="Cost to Serve",
                target="<= $17.50",
                actual="$19.10",
                status="Red",
                period="Q2 FY2026",
                category="financial",
                unit="$",
            ),
        ],
        initiatives=[
            MockInitiative(
                name="Customer Support Transformation Initiative",
                owner="Chief Operating Officer",
                status="Amber",
                planned_completion="31 December 2026",
                confidence=1.0,
            ),
        ],
        measurements=[
            KPIMeasurement(
                id="baseline-csat-q4fy25",
                kpi_name="Customer Satisfaction",
                period="Q4 FY2025",
                actual="88%",
                recorded_at=_BASELINE_RECORDED_AT,
            ),
            KPIMeasurement(
                id="baseline-csat-q1fy26",
                kpi_name="Customer Satisfaction",
                period="Q1 FY2026",
                actual="86%",
                recorded_at=_BASELINE_RECORDED_AT,
            ),
            KPIMeasurement(
                id="baseline-csat-q2fy26",
                kpi_name="Customer Satisfaction",
                period="Q2 FY2026",
                actual="82%",
                recorded_at=_BASELINE_RECORDED_AT,
            ),
            KPIMeasurement(
                id="baseline-art-q4fy25",
                kpi_name="Average Response Time",
                period="Q4 FY2025",
                actual="2.8 hours",
                recorded_at=_BASELINE_RECORDED_AT,
            ),
            KPIMeasurement(
                id="baseline-art-q1fy26",
                kpi_name="Average Response Time",
                period="Q1 FY2026",
                actual="2.4 hours",
                recorded_at=_BASELINE_RECORDED_AT,
            ),
            KPIMeasurement(
                id="baseline-art-q2fy26",
                kpi_name="Average Response Time",
                period="Q2 FY2026",
                actual="1.8 hours",
                recorded_at=_BASELINE_RECORDED_AT,
            ),
            KPIMeasurement(
                id="baseline-digital-q1fy26",
                kpi_name="Digital Self-Service Adoption",
                period="Q1 FY2026",
                actual="59%",
                recorded_at=_BASELINE_RECORDED_AT,
            ),
            KPIMeasurement(
                id="baseline-digital-q2fy26",
                kpi_name="Digital Self-Service Adoption",
                period="Q2 FY2026",
                actual="64%",
                recorded_at=_BASELINE_RECORDED_AT,
            ),
            KPIMeasurement(
                id="baseline-cost-q1fy26",
                kpi_name="Cost to Serve",
                period="Q1 FY2026",
                actual="$19.60",
                recorded_at=_BASELINE_RECORDED_AT,
            ),
            KPIMeasurement(
                id="baseline-cost-q2fy26",
                kpi_name="Cost to Serve",
                period="Q2 FY2026",
                actual="$19.10",
                recorded_at=_BASELINE_RECORDED_AT,
            ),
        ],
        alerts=[
            Alert(
                id="baseline-alert-csat-q2",
                severity="warning",
                kind="below_target",
                title="Customer Satisfaction remains below target",
                message="Customer Satisfaction was 82% in Q2 FY2026 against a target of >= 90%.",
                kpi_name="Customer Satisfaction",
                created_at=_BASELINE_RECORDED_AT,
            ),
        ],
    )


def ensure_demo_baseline(repository: MockSPMRepository) -> bool:
    """Seed the isolated POC store only when it has no core business state.

    Existing local POC data is never replaced.  Returning True means a baseline was
    written; False means the caller already had state and was left untouched.
    """
    current = repository.read()
    if current.objectives or current.kpis or current.initiatives or current.measurements:
        return False

    baseline = demo_baseline()
    if current.alerts:
        baseline.alerts = current.alerts
    repository.write(baseline)
    return True
