import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock

from pydantic import ValidationError

from spm_poc.errors import PixelRAGError, StructuredOutputError, TileResolutionError
from spm_poc.models import ExtractedSPMDocument, ResolvedTile, RetrievalResult, VLMAnswer
from spm_poc.pixelrag import PixelRAGClient
from spm_poc.service import DocumentService
from spm_poc.tiles import TileResolver
from spm_poc.vlm import OpenAICompatibleVLMReader


class FakeResponse:
    def __init__(self, body):
        self.body = json.dumps(body).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.body


class PixelRAGClientTests(unittest.TestCase):
    def test_normalizes_first_query_hits(self):
        captured = {}

        def open_request(request, timeout):
            captured["payload"] = json.loads(request.data)
            return FakeResponse({"results": [{"hits": [{
                "score": 0.91, "vector_id": 2, "article_id": 1,
                "tile_index": 3, "chunk_index": 0, "path": "ignored",
                "url": "", "y_offset": 0, "tile_height": 100,
            }]}]})

        hits = PixelRAGClient(urlopen=open_request).search("question", top_k=4)
        self.assertEqual(captured["payload"], {"queries": [{"text": "question"}], "n_docs": 4})
        self.assertEqual(hits, [RetrievalResult(score=0.91, article_id=1, tile_index=3, chunk_index=0, path="ignored", url="")])

    def test_reports_connection_failure(self):
        def unavailable(*args, **kwargs):
            raise urllib.error.URLError("offline")

        with self.assertRaisesRegex(PixelRAGError, "Cannot reach PixelRAG"):
            PixelRAGClient(urlopen=unavailable).search("question")


class TileResolverTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.index = Path(self.temp.name)
        tile_dir = self.index / "tiles" / "42.png.tiles"
        tile_dir.mkdir(parents=True)
        (self.index / "articles.json").write_text(json.dumps([{}, {"title": "42"}]))
        (tile_dir / "chunks.json").write_text(json.dumps({"chunks": [
            {"tile_index": 2, "chunk_index": 0, "file": "tile_0002.jpg"}
        ]}))
        (tile_dir / "tile_0002.jpg").write_bytes(b"image")

    def tearDown(self):
        self.temp.cleanup()

    def test_resolves_article_and_tile_metadata(self):
        hit = RetrievalResult(score=1, article_id=1, tile_index=2)
        tile = TileResolver(self.index).resolve(hit)
        self.assertEqual(tile.image_path.name, "tile_0002.jpg")

    def test_rejects_unknown_tile(self):
        hit = RetrievalResult(score=1, article_id=1, tile_index=99)
        with self.assertRaisesRegex(TileResolutionError, "No tile"):
            TileResolver(self.index).resolve(hit)


class VLMReaderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.image = Path(self.temp.name) / "evidence.jpg"
        self.image.write_bytes(b"jpeg-data")

    def tearDown(self):
        self.temp.cleanup()

    def test_answer_uses_vision_request_and_parses_mocked_response(self):
        captured = {}

        def open_request(request, timeout):
            captured["request"] = request
            return FakeResponse({"choices": [{"message": {"content": json.dumps({
                "answer": "Visible answer", "evidence": ["Visible label"]
            })}}]})

        reader = OpenAICompatibleVLMReader("secret", "https://vlm.test/v1", "vision", urlopen=open_request)
        answer = reader.answer("What is visible?", [self.image])
        content = json.loads(captured["request"].data)["messages"][0]["content"]
        self.assertEqual(answer.answer, "Visible answer")
        self.assertIn("Do not invent", content[0]["text"])
        self.assertTrue(content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,"))
        self.assertEqual(captured["request"].get_header("Authorization"), "Bearer secret")

    def test_validates_structured_response(self):
        body = {"objectives": [{"name": "Objective", "owner": None}], "kpis": [], "initiatives": []}
        reader = OpenAICompatibleVLMReader(
            "secret", "https://vlm.test/v1", "vision",
            urlopen=lambda *args, **kwargs: FakeResponse({"choices": [{"message": {"content": json.dumps(body)}}]}),
        )
        self.assertEqual(reader.extract_spm([self.image]).objectives[0].name, "Objective")

    def test_reports_invalid_structured_response(self):
        reader = OpenAICompatibleVLMReader(
            "secret", "https://vlm.test/v1", "vision",
            urlopen=lambda *args, **kwargs: FakeResponse({"choices": [{"message": {"content": "not json"}}]}),
        )
        with self.assertRaises(StructuredOutputError):
            reader.extract_spm([self.image])


    def test_recovers_grounded_answer_from_json_wrapped_in_prose(self):
        def open_request(request, timeout):
            return FakeResponse({
                "choices": [{
                    "message": {
                        "content": (
                            'Here is the JSON:\n'
                            '{"answer":"Recovered answer",'
                            '"evidence":["Visible fact"]}'
                        )
                    }
                }]
            })

        reader = OpenAICompatibleVLMReader(
            "secret",
            "https://vlm.test/v1",
            "vision",
            urlopen=open_request,
        )

        answer = reader.answer("What is visible?", [self.image])

        self.assertEqual(answer.answer, "Recovered answer")
        self.assertEqual(answer.evidence, ["Visible fact"])

    def test_repairs_invalid_grounded_answer_once(self):
        responses = iter([
            "this is not valid json",
            '{"answer":"Recovered after repair","evidence":["Existing fact"]}',
        ])
        calls = []

        def open_request(request, timeout):
            calls.append(json.loads(request.data))
            return FakeResponse({
                "choices": [{
                    "message": {
                        "content": next(responses)
                    }
                }]
            })

        reader = OpenAICompatibleVLMReader(
            "secret",
            "https://vlm.test/v1",
            "vision",
            urlopen=open_request,
        )

        answer = reader.answer("What is visible?", [self.image])

        self.assertEqual(answer.answer, "Recovered after repair")
        self.assertEqual(answer.evidence, ["Existing fact"])
        self.assertEqual(len(calls), 2)

        repair_prompt = calls[1]["messages"][0]["content"]
        self.assertIn("Repair the supplied model output", repair_prompt)
        self.assertIn("Do not add new facts", repair_prompt)


class SchemaTests(unittest.TestCase):
    def test_optional_source_fields_and_strict_container_types(self):
        result = ExtractedSPMDocument.model_validate({
            "objectives": [{"name": "Improve", "owner": None}],
            "kpis": [{"name": "CSAT", "target": ">= 90%", "actual": None, "status": None}],
            "initiatives": [{"name": "Transformation"}],
        })
        self.assertIsNone(result.kpis[0].actual)
        with self.assertRaises(ValidationError):
            ExtractedSPMDocument.model_validate({"objectives": "not-a-list"})


class ServiceTests(unittest.TestCase):
    def test_qa_orchestration(self):
        hit = RetrievalResult(score=0.9, article_id=1, tile_index=0)
        tile = ResolvedTile(hit=hit, image_path=Path("tile.jpg"))
        pixelrag, resolver, reader = Mock(), Mock(), Mock()
        pixelrag.search.return_value = [hit]
        resolver.resolve_all.return_value = [tile]
        reader.answer.return_value = VLMAnswer(answer="Grounded", evidence=["fact"])
        result = DocumentService(pixelrag, resolver, reader).ask("Question", 2)
        pixelrag.search.assert_called_once_with("Question", 2)
        reader.answer.assert_called_once_with("Question", [Path("tile.jpg")])
        self.assertEqual(result.answer, "Grounded")

    def test_extraction_orchestration(self):
        tile = Mock(image_path=Path("tile.jpg"))
        pixelrag, resolver, reader = Mock(), Mock(), Mock()
        pixelrag.search.return_value = []
        resolver.resolve_all.return_value = [tile]
        expected = ExtractedSPMDocument()
        reader.extract_spm.return_value = expected
        result = DocumentService(pixelrag, resolver, reader).extract_spm(4)
        self.assertIs(result, expected)
        self.assertEqual(pixelrag.search.call_args.args[1], 4)
        reader.extract_spm.assert_called_once_with([Path("tile.jpg")])


if __name__ == "__main__":
    unittest.main()
