import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

import fitz
from fastapi.testclient import TestClient

from spm_poc.advanced import ExtractionSnapshotStore, GovernanceStore
from spm_poc.documents import DocumentLibrary
from spm_poc.models import ExtractedSPMDocument, MockKPI, MockSPMData
from spm_poc.storage import MockSPMRepository
from spm_poc.web import WebRuntime, create_app
from spm_poc.workflows import DataCaptureService


class EnterpriseFeatureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "mock-data").mkdir(parents=True)
        docs = self.root / "documents"
        docs.mkdir()
        pdf = fitz.open(); pdf.new_page(); pdf.save(docs / "1.pdf"); pdf.close()
        index = self.root / "indexes" / "spm"; index.mkdir(parents=True)
        (index / "index.faiss").write_bytes(b"index")
        (index / "articles.json").write_text("{}")
        self.runtime = WebRuntime(self.root, document_library=DocumentLibrary(self.root, index_builder=lambda *_: None))
        self.client = TestClient(create_app(self.runtime))

    def tearDown(self):
        self.client.close(); self.temp.cleanup()

    @staticmethod
    def extraction():
        return ExtractedSPMDocument.model_validate({
            "reporting_period": "Q3 FY2026",
            "objectives": [{"name": "Improve CX", "owner": "CX Director", "confidence": 0.95}],
            "kpis": [{"name": "Customer Satisfaction", "target": ">= 90%", "actual": "85%", "confidence": 0.96}],
            "initiatives": [{"name": "Support Transformation", "confidence": 0.90}],
        })

    def test_preview_reuses_stable_extraction_snapshot(self):
        service = Mock()
        service.extract_spm.return_value = self.extraction()
        self.runtime.document_service = lambda: service
        first = self.client.post("/api/smart-import/preview").json()
        second = self.client.post("/api/smart-import/preview").json()
        self.assertFalse(first["extraction_cached"])
        self.assertTrue(second["extraction_cached"])
        self.assertEqual(len(first["kpis"]), len(second["kpis"]))
        service.extract_spm.assert_called_once()

    def test_period_capture_creates_measurement_and_lineage(self):
        MockSPMRepository(self.runtime.store_path).write(MockSPMData(kpis=[MockKPI(name="Customer Satisfaction", actual="82%")]))
        proposal = DataCaptureService(MockSPMRepository(self.runtime.store_path)).preview(self.extraction())
        result = DataCaptureService(MockSPMRepository(self.runtime.store_path)).apply(proposal)
        self.assertEqual(result.created_measurements, 1)
        stored = MockSPMRepository(self.runtime.store_path).read()
        self.assertEqual(stored.measurements[0].period, "Q3 FY2026")
        self.assertEqual(stored.measurements[0].actual, "85%")

    def test_alias_matching_understands_csat(self):
        repo = MockSPMRepository(self.runtime.store_path)
        repo.write(MockSPMData(kpis=[MockKPI(name="Customer Satisfaction", actual="80%")] ))
        extracted = ExtractedSPMDocument(kpis=[{"name": "CSAT", "actual": "85%"}])
        proposal = DataCaptureService(repo).preview(extracted)
        self.assertEqual(proposal.updates[0].match_status, "matched")
        self.assertGreaterEqual(proposal.updates[0].match_score or 0, 0.98)

    def test_apply_endpoint_is_not_exposed(self):
        settings = GovernanceStore(self.root).get()
        self.assertNotIn("manager", settings.allowed_apply_roles)

        response = self.client.post(
            "/api/smart-import/apply",
            headers={"X-User-Role": "manager"},
        )
        self.assertEqual(response.status_code, 404)

    def test_audit_records_selection(self):
        response = self.client.post("/api/documents/legacy-spm/select")
        self.assertEqual(response.status_code, 200)
        events = self.client.get("/api/audit").json()
        self.assertTrue(any(item["action"] == "document.selected" for item in events))


if __name__ == "__main__":
    unittest.main()

class IngestionSafetyTests(unittest.TestCase):
    def test_same_file_is_not_ingested_twice(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import MagicMock

        from spm_poc.web import WebRuntime

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            (root / "mock-data").mkdir()
            watched = root / "ingestion-drop"
            watched.mkdir()

            payload = b"%PDF-1.4 synthetic test pdf bytes"
            first = watched / "report.pdf"
            first.write_bytes(payload)

            library = MagicMock()

            record = MagicMock()
            record.id = "doc-001"

            library.upload.return_value = record
            library.index.return_value = record

            runtime = WebRuntime(root, document_library=library)

            first_result = runtime.scan_ingestion_folder()

            self.assertEqual(first_result[0]["status"], "ready")
            self.assertEqual(library.upload.call_count, 1)
            self.assertEqual(library.index.call_count, 1)

            # Same exact document, but renamed.
            second = watched / "renamed-report.pdf"
            second.write_bytes(payload)

            second_result = runtime.scan_ingestion_folder()

            self.assertEqual(second_result[0]["status"], "skipped")
            self.assertEqual(second_result[0]["reason"], "already_ingested")

            # PixelRAG must not be invoked again.
            self.assertEqual(library.upload.call_count, 1)
            self.assertEqual(library.index.call_count, 1)


    def test_second_scan_returns_busy_when_scan_is_locked(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import MagicMock

        from spm_poc.web import WebRuntime

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "mock-data").mkdir()

            runtime = WebRuntime(root, document_library=MagicMock())

            acquired = runtime._ingestion_lock.acquire(blocking=False)
            self.assertTrue(acquired)

            try:
                result = runtime.scan_ingestion_folder()
            finally:
                runtime._ingestion_lock.release()

            self.assertEqual(result[0]["status"], "busy")

class ScheduledIngestionTests(unittest.TestCase):
    def test_enabling_schedule_is_detected_without_backend_restart(self):
        import tempfile
        import time
        from pathlib import Path
        from unittest.mock import MagicMock

        from fastapi.testclient import TestClient

        from spm_poc.web import WebRuntime, create_app

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "mock-data").mkdir()

            runtime = WebRuntime(root, document_library=MagicMock())
            runtime.scan_ingestion_folder = MagicMock(return_value=[])

            app = create_app(runtime)

            with TestClient(app) as client:
                # Scheduler starts disabled.
                response = client.put(
                    "/api/ingestion/settings",
                    json={
                        "enabled": True,
                        "poll_seconds": 60,
                        "watched_folder": "ingestion-drop",
                    },
                )
                self.assertEqual(response.status_code, 200)

                # The scheduler re-checks settings every 5 seconds, so the
                # newly enabled schedule should be noticed promptly rather
                # than waiting for a previous 900-second interval.
                deadline = time.time() + 7

                while (
                    runtime.scan_ingestion_folder.call_count == 0
                    and time.time() < deadline
                ):
                    time.sleep(0.1)

                self.assertGreaterEqual(
                    runtime.scan_ingestion_folder.call_count,
                    1,
                )
