"""Get plain text out of an uploaded CV (PDF or DOCX)."""

import io

from docx import Document
from pypdf import PdfReader

MAX_PAGES = 15


class CvReadError(Exception):
    """The file couldn't be read as a CV. The message is shown to the user."""


def _from_pdf(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as err:  # pypdf raises many different errors for broken files
        raise CvReadError("This PDF could not be opened. Is it a valid PDF file?") from err
    if reader.is_encrypted:
        raise CvReadError("This PDF is password-protected. Please upload a copy without a password.")
    pages = reader.pages[:MAX_PAGES]
    return "\n".join((page.extract_text() or "") for page in pages)


def _from_docx(data: bytes) -> str:
    try:
        doc = Document(io.BytesIO(data))
    except Exception as err:
        raise CvReadError("This Word file could not be opened. Please save it as .docx and try again.") from err
    lines = [p.text for p in doc.paragraphs]
    # Many CV templates put everything inside tables
    for table in doc.tables:
        for row in table.rows:
            lines.append("  ".join(cell.text for cell in row.cells))
    return "\n".join(lines)


def extract_text(filename: str, data: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        text = _from_pdf(data)
    elif name.endswith(".docx") or data[:2] == b"PK":  # .docx files are zip archives
        text = _from_docx(data)
    else:
        raise CvReadError("Please upload your CV as a PDF or a .docx file.")

    text = text.replace("\x00", "").strip()
    if len(text) < 50:
        raise CvReadError(
            "Almost no text could be read. If your CV is a scanned image, please upload a PDF made from Word instead."
        )
    return text
