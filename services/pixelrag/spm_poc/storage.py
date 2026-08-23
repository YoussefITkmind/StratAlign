"""Deterministic JSON repositories used by the local enterprise-style POC."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from .models import MockSPMData


class MockSPMRepository:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)

    def read(self) -> MockSPMData:
        if not self.path.exists():
            return MockSPMData()
        return MockSPMData.model_validate_json(self.path.read_text(encoding="utf-8"))

    def write(self, data: MockSPMData) -> None:
        """Atomically replace the store with stable, human-readable JSON."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "objectives": [item.model_dump(mode="json", exclude_unset=True) for item in data.objectives],
            "kpis": [item.model_dump(mode="json", exclude_unset=True) for item in data.kpis],
            "initiatives": [item.model_dump(mode="json", exclude_unset=True) for item in data.initiatives],
            "measurements": [item.model_dump(mode="json", exclude_unset=True) for item in data.measurements],
            "alerts": [item.model_dump(mode="json", exclude_unset=True) for item in data.alerts],
            **(data.model_extra or {}),
        }
        rendered = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
        descriptor, temporary_name = tempfile.mkstemp(prefix=f".{self.path.name}.", dir=self.path.parent)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as temporary:
                temporary.write(rendered)
                temporary.flush()
                os.fsync(temporary.fileno())
            Path(temporary_name).replace(self.path)
        except Exception:
            Path(temporary_name).unlink(missing_ok=True)
            raise
