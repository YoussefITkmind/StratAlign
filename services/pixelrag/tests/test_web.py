import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

import fitz
from fastapi.testclient import TestClient

from spm_poc.documents import DocumentLibrary
from spm_poc.models import (
    DocumentAnswer,
    ExtractedSPMDocument,
    MockKPI,
    MockSPMData,
    ResolvedTile,
    RetrievalResult,
)
from spm_poc.storage import MockSPMRepository
from spm_poc.web import WebRuntime, create_app


class WebApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "mock-data").mkdir(parents=True)
        self._create_legacy_fixture()

        def fake_index_builder(_record, _source_dir, output_dir):
            output_dir.mkdir(parents=True, exist_ok=True)
            (output_dir / "index.faiss").write_bytes(b"fake-index")
            (output_dir / "articles.json").write_text("{}", encoding="utf-8")

        library = DocumentLibrary(self.root, index_builder=fake_index_builder)
        self.runtime = WebRuntime(self.root, document_library=library)
        self.client = TestClient(create_app(self.runtime))

    def _create_legacy_fixture(self):
        documents = self.root / "documents"
        documents.mkdir(parents=True)
        pdf = fitz.open()
        pdf.new_page()
        pdf.save(documents / "1.pdf")
        pdf.close()
        index = self.root / "indexes" / "spm"
        index.mkdir(parents=True)
        (index / "index.faiss").write_bytes(b"fake-index")
        (index / "articles.json").write_text("{}", encoding="utf-8")

    @staticmethod
    def pdf_bytes():
        pdf = fitz.open()
        pdf.new_page()
        data = pdf.tobytes()
        pdf.close()
        return data

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    @staticmethod
    def extraction():
        return ExtractedSPMDocument.model_validate({
            "objectives": [{"name": "Improve CX", "owner": "CX Director"}],
            "kpis": [{"name": "CSAT", "target": ">= 90%", "actual": "82%", "status": "Red"}],
            "initiatives": [{"name": "Support Transformation"}],
        })

    def test_health_endpoint(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_document_library_seeds_bundled_demo(self):
        response = self.client.get("/api/documents")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["selected_document_id"], "legacy-spm")
        self.assertEqual(body["documents"][0]["status"], "ready")
        self.assertTrue(body["documents"][0]["legacy"])

    def test_pdf_upload_builds_own_index_and_selects_document(self):
        response = self.client.post(
            "/api/documents/upload",
            files={"file": ("Q3 Report.pdf", self.pdf_bytes(), "application/pdf")},
        )
        self.assertEqual(response.status_code, 200)
        uploaded = response.json()
        self.assertEqual(uploaded["status"], "ready")
        self.assertEqual(uploaded["name"], "Q3 Report.pdf")
        self.assertTrue((self.root / "indexes" / "documents" / uploaded["id"] / "index.faiss").exists())
        library = self.client.get("/api/documents").json()
        self.assertEqual(library["selected_document_id"], uploaded["id"])

    def test_upload_rejects_non_pdf(self):
        response = self.client.post(
            "/api/documents/upload",
            files={"file": ("notes.txt", b"not a pdf", "text/plain")},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("PDF", response.json()["detail"])

    def test_spm_state_endpoint(self):
        MockSPMRepository(self.runtime.store_path).write(MockSPMData(kpis=[MockKPI(name="CSAT", actual="80%")]))
        response = self.client.get("/api/spm-data")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["kpis"][0]["name"], "CSAT")

    def test_qa_endpoint_uses_selected_document_and_hides_local_path(self):
        hit = RetrievalResult(score=0.91, article_id=1, tile_index=2, chunk_index=0)
        answer = DocumentAnswer(
            answer="< 2 hours",
            evidence=["Target is visible"],
            tiles=[ResolvedTile(hit=hit, image_path=Path("/private/local/tile.jpg"))],
        )
        service = Mock()
        service.ask.return_value = answer
        self.runtime.document_service = lambda: service

        response = self.client.post("/api/qa", json={"question": "What is the target?", "top_k": 3})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["document_id"], "legacy-spm")
        self.assertEqual(body["answer"], "< 2 hours")
        self.assertNotIn("image_path", str(body))
        self.assertEqual(body["tiles"][0]["image_url"], "/api/documents/legacy-spm/evidence/1/2/0")
        service.ask.assert_called_once_with("What is the target?", 3)

    def test_qa_validation_rejects_empty_question(self):
        response = self.client.post("/api/qa", json={"question": "", "top_k": 3})
        self.assertEqual(response.status_code, 422)

    def test_smart_import_preview_does_not_modify_store_and_apply_is_not_exposed(self):
        service = Mock()
        service.extract_spm.return_value = self.extraction()
        self.runtime.document_service = lambda: service

        preview = self.client.post("/api/smart-import/preview")
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.json()["kpis"][0]["action"], "create")
        self.assertEqual(MockSPMRepository(self.runtime.store_path).read().kpis, [])

        applied = self.client.post("/api/smart-import/apply")
        self.assertEqual(applied.status_code, 404)
        self.assertEqual(MockSPMRepository(self.runtime.store_path).read().kpis, [])

    def test_data_capture_apply_is_not_exposed(self):
        response = self.client.post("/api/data-capture/apply")
        self.assertEqual(response.status_code, 404)

    def test_data_capture_preview_does_not_modify_store_and_apply_is_not_exposed(self):
        MockSPMRepository(self.runtime.store_path).write(
            MockSPMData(kpis=[MockKPI(name="CSAT", target=">= 90%", actual="86%", status="Red")])
        )
        service = Mock()
        service.extract_spm.return_value = self.extraction()
        self.runtime.document_service = lambda: service

        preview = self.client.post("/api/data-capture/preview")
        self.assertEqual(preview.status_code, 200)
        update = preview.json()["updates"][0]
        self.assertEqual(update["current_actual"], "86%")
        self.assertEqual(update["proposed_actual"], "82%")

        applied = self.client.post("/api/data-capture/apply")
        self.assertEqual(applied.status_code, 404)

        stored = MockSPMRepository(self.runtime.store_path).read().kpis[0]
        self.assertEqual(stored.actual, "86%")
        self.assertEqual(stored.target, ">= 90%")
        self.assertEqual(stored.status, "Red")

    def test_evidence_endpoint_is_scoped_to_document(self):
        image = self.root / "tile.jpg"
        image.write_bytes(b"jpeg-bytes")
        self.runtime.resolve_evidence = lambda document_id, article_id, tile_index, chunk_index: image

        response = self.client.get("/api/documents/legacy-spm/evidence/1/2/0")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"jpeg-bytes")

        invalid = self.client.get("/api/documents/legacy-spm/evidence/-1/2/0")
        self.assertEqual(invalid.status_code, 404)


if __name__ == "__main__":
    unittest.main()
