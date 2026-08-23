"""Provider-neutral reader over an OpenAI-compatible vision endpoint."""

import base64
import json
import mimetypes
import os
import re
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol

from pydantic import ValidationError

from .errors import StructuredOutputError, VLMError
from .models import ExtractedSPMDocument, VLMAnswer

GROUNDING_PROMPT = (
    "Answer only from the supplied visual evidence. Do not invent information. "
    "If the answer is not visible in the supplied evidence, say so. "
    "Do not claim a comparison, increase, decrease, or cross-document trend unless that relationship is explicitly visible in the supplied evidence. "
    "If a question asks about multiple reports but only one report is visible, state only the facts and any historical movement visible in that report; "
    "do not infer how it compares with an unseen report. Return JSON "
    'with an \"answer\" string and an \"evidence\" array of short visible facts.'
)


class VLMReader(Protocol):
    def answer(self, question: str, image_paths: list[Path]) -> VLMAnswer: ...

    def extract_spm(self, image_paths: list[Path]) -> ExtractedSPMDocument: ...

    def synthesize_text(self, question: str, evidence_blocks: list[str]) -> VLMAnswer: ...


def _json_text(text: str) -> Any:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.I)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as original_error:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end > start:
            candidate = cleaned[start:end + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass
        raise original_error


class OpenAICompatibleVLMReader:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        timeout: float = 300,
        urlopen: Callable[..., Any] = urllib.request.urlopen,
    ) -> None:
        if not api_key or not base_url or not model:
            raise ValueError("VLM api_key, base_url, and model are required")
        self.url = f"{base_url.rstrip('/')}/chat/completions"
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self._urlopen = urlopen

    @classmethod
    def from_env(cls) -> "OpenAICompatibleVLMReader":
        missing = [name for name in ("VLM_API_KEY", "VLM_BASE_URL", "VLM_MODEL") if not os.getenv(name)]
        if missing:
            raise VLMError(f"Missing required environment variables: {', '.join(missing)}")
        return cls(os.environ["VLM_API_KEY"], os.environ["VLM_BASE_URL"], os.environ["VLM_MODEL"])

    @staticmethod
    def _image_part(path: Path) -> dict[str, Any]:
        mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}}

    def _complete(self, instruction: str, image_paths: list[Path]) -> str:
        if not image_paths:
            raise VLMError("At least one evidence image is required")
        content = [{"type": "text", "text": instruction}]
        try:
            content.extend(self._image_part(path) for path in image_paths)
        except OSError as error:
            raise VLMError(f"Cannot read evidence image: {error}") from error
        payload = json.dumps({
            "model": self.model,
            "messages": [{"role": "user", "content": content}],
        }).encode("utf-8")
        request = urllib.request.Request(self.url, data=payload, headers={
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }, method="POST")
        try:
            with self._urlopen(request, timeout=self.timeout) as response:
                result = json.load(response)
            message_content = result["choices"][0]["message"]["content"]
            if not isinstance(message_content, str):
                raise TypeError("message content is not text")
            return message_content
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise VLMError(f"VLM returned HTTP {error.code}: {detail}") from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise VLMError(f"Cannot reach VLM endpoint at {self.url}: {error}") from error
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
            raise VLMError("VLM returned an unexpected response") from error

    def _complete_text(self, instruction: str) -> str:
        payload = json.dumps({
            "model": self.model,
            "messages": [{"role": "user", "content": instruction}],
        }).encode("utf-8")
        request = urllib.request.Request(self.url, data=payload, headers={
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }, method="POST")
        try:
            with self._urlopen(request, timeout=self.timeout) as response:
                result = json.load(response)
            content = result["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise TypeError("message content is not text")
            return content
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise VLMError(f"VLM returned HTTP {error.code}: {detail}") from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise VLMError(f"Cannot reach VLM endpoint at {self.url}: {error}") from error
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
            raise VLMError("VLM returned an unexpected response") from error

    def _grounded_answer_with_repair(self, raw: str, error_message: str) -> VLMAnswer:
        try:
            return VLMAnswer.model_validate(_json_text(raw))
        except (json.JSONDecodeError, ValidationError):
            repair_instruction = (
                "Repair the supplied model output into valid JSON only. "
                'The required schema is exactly {"answer": "string", "evidence": ["string"]}. '
                "Preserve only facts already present in the supplied output. "
                "Do not add new facts or evidence. Return JSON only, with no Markdown or explanation.\n\n"
                "Output to repair:\n" + raw
            )
            repaired = self._complete_text(repair_instruction)
            try:
                return VLMAnswer.model_validate(_json_text(repaired))
            except (json.JSONDecodeError, ValidationError) as error:
                raise VLMError(error_message) from error

    @staticmethod
    def _clean_synthesis_evidence(evidence: list[str]) -> list[str]:
        cleaned: list[str] = []
        for item in evidence:
            value = item.strip()
            value = re.sub(r"^(?:SOURCE|ANSWER|EVIDENCE)\s*:\s*", "", value, flags=re.I)
            value = " ".join(value.split())
            if len(value) > 280:
                value = value[:277].rstrip() + "..."
            if value and value not in cleaned:
                cleaned.append(value)
        return cleaned

    def synthesize_text(self, question: str, evidence_blocks: list[str]) -> VLMAnswer:
        instruction = (
            "Synthesize an answer only from the supplied source summaries. Do not invent facts. "
            "Treat each SOURCE block as a separate report. When the question asks how something changed between reports, "
            "compare the value stated for each report directly and calculate the cross-report direction and difference when the values permit it. "
            "Do not confuse historical movement described inside one report with movement between the reports being compared. "
            "For example, if one source reports a current value of 86 and another source reports a current value of 85 while also saying it rose from 82 to 85 internally, "
            "the cross-report change is 86 to 85 (down 1), while 82 to 85 is only the later report's internal historical trend. "
            "Keep those two timelines explicitly separate. When sources conflict, state the conflict and identify the source labels. "
            "The evidence array is for concise user-facing citations, not for repeating source blocks. Include only short factual statements that directly support the synthesis. "
            "Attribute each fact naturally to its report name when useful, but never include the literal prefixes SOURCE:, ANSWER:, or EVIDENCE:. "
            "Do not copy an entire source summary into one evidence item. Prefer one or two concise facts per source. "
            'Return JSON with an "answer" string and an "evidence" array.\n\n'
            "Question: " + question + "\n\nSources:\n" + "\n\n".join(evidence_blocks)
        )
        raw = self._complete_text(instruction)
        result = self._grounded_answer_with_repair(
            raw,
            "VLM synthesis was not valid grounded-answer JSON after automatic recovery",
        )
        return VLMAnswer(
            answer=result.answer,
            evidence=self._clean_synthesis_evidence(result.evidence),
        )

    def answer(self, question: str, image_paths: list[Path]) -> VLMAnswer:
        raw = self._complete(f"{GROUNDING_PROMPT}\n\nQuestion: {question}", image_paths)
        return self._grounded_answer_with_repair(
            raw,
            "VLM answer was not valid grounded-answer JSON after automatic recovery",
        )

    def extract_spm(self, image_paths: list[Path]) -> ExtractedSPMDocument:
        schema = json.dumps(ExtractedSPMDocument.model_json_schema())
        prompt = (
            "Extract SPM data only from the supplied visual evidence. Be exhaustive across every supplied page. "
            "Do not infer or invent missing values; use null for missing fields and [] for absent groups. "
            "Keep objectives, KPIs and initiatives semantically distinct. A KPI must be a measurable performance indicator "
            "with an explicitly visible metric, target, actual, status, unit or measurement context. Do not turn management "
            "decisions, recommendations, risks, narrative observations, initiatives, milestones or objective statements into KPIs. "
            "Do not emit duplicate entities just because the same item appears in an executive summary and a detail section; "
            "prefer the most complete visible representation. For KPIs, classify category as kpi, financial, risk, operational, "
            "people, or other; capture reporting period when explicitly visible; include aliases only when the document establishes them. "
            "Set confidence from 0 to 1 to reflect extraction certainty from visible evidence, not business confidence. "
            "Do not merge different period values into one KPI actual; prefer the latest/current value explicitly labelled in the evidence. "
            "Return only JSON that validates against this JSON Schema:\n" + schema
        )
        raw = self._complete(prompt, image_paths)
        try:
            return ExtractedSPMDocument.model_validate(_json_text(raw))
        except (json.JSONDecodeError, ValidationError) as error:
            raise StructuredOutputError("VLM returned invalid SPM structured output") from error
