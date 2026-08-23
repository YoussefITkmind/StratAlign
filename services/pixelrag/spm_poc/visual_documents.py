"""DocumentLibrary enhancement that preserves Office layout when LibreOffice exists."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import fitz

from .documents import DocumentLibrary


class VisualDocumentLibrary(DocumentLibrary):
    """Prefer true Office-to-PDF rendering, with the existing text fallback."""

    OFFICE_EXTENSIONS = {".docx", ".pptx", ".xlsx"}

    def _normalize_to_pdf(self, original: Path, normalized: Path, extension: str) -> int:
        if extension not in self.OFFICE_EXTENSIONS:
            return super()._normalize_to_pdf(original, normalized, extension)

        soffice = shutil.which("soffice") or shutil.which("libreoffice")
        if not soffice:
            return super()._normalize_to_pdf(original, normalized, extension)

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
                    return super()._normalize_to_pdf(original, normalized, extension)

                shutil.copy2(generated, normalized)
                with fitz.open(normalized) as pdf:
                    if pdf.page_count < 1:
                        raise ValueError("Converted Office document has no pages")
                    return pdf.page_count
        except (OSError, subprocess.SubprocessError, ValueError):
            # Layout-preserving conversion is an enhancement. The existing
            # extraction fallback remains the compatibility path.
            return super()._normalize_to_pdf(original, normalized, extension)
