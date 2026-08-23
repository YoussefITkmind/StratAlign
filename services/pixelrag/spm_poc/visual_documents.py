"""Layout-preserving Office document normalization for PixelRAG.

PixelRAG is a visual retrieval system. Office documents must therefore be
rendered to a real PDF before indexing so evidence tiles preserve the source
page/slide/sheet layout. Text-only reconstruction is intentionally not used.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import fitz

from .documents import DocumentLibrary


class VisualDocumentLibrary(DocumentLibrary):
    """Require true Office-to-PDF rendering for DOCX, PPTX and XLSX uploads."""

    OFFICE_EXTENSIONS = {".docx", ".pptx", ".xlsx"}

    def _normalize_to_pdf(self, original: Path, normalized: Path, extension: str) -> int:
        if extension not in self.OFFICE_EXTENSIONS:
            return super()._normalize_to_pdf(original, normalized, extension)

        soffice = shutil.which("soffice") or shutil.which("libreoffice")
        if not soffice:
            raise ValueError(
                "Visual Office rendering is unavailable. Install LibreOffice/soffice "
                "on the PixelRAG service host before uploading DOCX, PPTX or XLSX files."
            )

        try:
            with tempfile.TemporaryDirectory(prefix="pixelrag-office-") as temporary:
                output = Path(temporary)
                process = subprocess.run(
                    [
                        soffice,
                        "--headless",
                        "--convert-to",
                        "pdf",
                        "--outdir",
                        str(output),
                        str(original),
                    ],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    timeout=180,
                    check=False,
                )

                generated = output / f"{original.stem}.pdf"
                if process.returncode != 0 or not generated.is_file():
                    detail = " ".join((process.stdout or "").split())[-500:]
                    suffix = f" Renderer output: {detail}" if detail else ""
                    raise ValueError(
                        f"The uploaded {extension.lstrip('.').upper()} file could not be "
                        f"visually rendered to PDF.{suffix}"
                    )

                shutil.copy2(generated, normalized)

            with fitz.open(normalized) as pdf:
                if pdf.page_count < 1:
                    raise ValueError("Rendered Office document has no pages")
                return pdf.page_count
        except subprocess.TimeoutExpired as error:
            raise ValueError("Office visual rendering timed out after 180 seconds") from error
        except OSError as error:
            raise ValueError("Office visual rendering could not be started") from error
