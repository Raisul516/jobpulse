"""Rule-based CV reader: finds name, date of birth, skills, education, experience and summary.

No AI and nothing leaves the computer. It's a GUESS: the result is shown to the user
as a draft, and only what they confirm is used. Every field says how it was found.
"""

from __future__ import annotations

import re
from datetime import date

from .skills import SKILLS

# ---------- helpers ----------

BANGLA_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
MONTH_WORD = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"


def field(value, found_by: str = "text"):
    return None if value in (None, "", []) else {"value": value, "foundBy": found_by}


def _iso(year: int, month: int, day: int) -> str | None:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def parse_date(text: str) -> str | None:
    """First date in the text, as YYYY-MM-DD. Numbers are read day-first (Bangladesh style)."""
    t = text.translate(BANGLA_DIGITS)
    if m := re.search(r"(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)", t):
        return _iso(int(m[1]), int(m[2]), int(m[3]))
    if m := re.search(r"(?<!\d)(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?!\d)", t):
        return _iso(int(m[3]), int(m[2]), int(m[1]))
    if m := re.search(rf"(?<!\d)(\d{{1,2}})(?:st|nd|rd|th)?(?:\s+of)?[\s\-/]+{MONTH_WORD},?[\s\-/]+(\d{{4}})", t, re.I):
        return _iso(int(m[3]), MONTHS[m[2][:3].lower()], int(m[1]))
    if m := re.search(rf"{MONTH_WORD}\s*(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(\d{{4}})", t, re.I):
        return _iso(int(m[3]), MONTHS[m[1][:3].lower()], int(m[2]))
    return None


def _contains(text_lower: str, phrase: str) -> bool:
    """Whole-word search that still works for 'c++', '.net' and 'ci/cd'."""
    p = phrase.lower()
    before = r"(?<![a-z0-9])" if re.match(r"[a-z0-9]", p) else ""
    after = r"(?![a-z0-9])" if re.search(r"[a-z0-9]$", p) else ""
    return re.search(before + re.escape(p) + after, text_lower) is not None


# ---------- sections ----------

SECTION_HEADERS = {
    "experience": r"(work\s+|professional\s+|job\s+)?experience|employment(\s+history)?|work\s+history",
    "education": r"education(al)?(\s+(qualifications?|background))?|academic(\s+(qualifications?|background|records?))?",
    "skills": r"(technical\s+|key\s+|core\s+)?skills?(\s+(&|and)\s+\w+)?|technologies|competenc(ies|e)",
    "summary": r"(career\s+)?objective|(professional\s+)?summary|profile|about\s+me",
    "other": r"projects?|certifications?|training|languages?|references?|personal\s+(information|details)|interests|hobbies|achievements|awards",
}


def split_sections(lines: list[str]) -> dict[str, list[str]]:
    """Group lines under the CV's own headings ("Education", "Work Experience", ...)."""
    sections: dict[str, list[str]] = {"top": []}
    current = "top"
    for line in lines:
        heading = line.strip().rstrip(":").strip()
        matched = None
        if 0 < len(heading) <= 40:
            for name, pattern in SECTION_HEADERS.items():
                if re.fullmatch(pattern, heading, re.I):
                    matched = name
                    break
        if matched:
            current = matched
            sections.setdefault(current, [])
        else:
            sections.setdefault(current, []).append(line)
    return sections


# ---------- individual fields ----------

def find_name(lines: list[str]) -> str | None:
    for line in lines[:6]:
        words = line.strip().split()
        if not 2 <= len(words) <= 5:
            continue
        if re.search(r"curriculum|vitae|resume|résumé|\bcv\b|@|\d", line, re.I):
            continue
        if all(re.fullmatch(r"[A-Za-z.\-']+", w) for w in words):
            return " ".join(w.capitalize() if w.isupper() and len(w) > 2 else w for w in words)
    return None


def find_date_of_birth(text: str) -> str | None:
    m = re.search(r"(date\s+of\s+birth|d\.?\s?o\.?\s?b\.?|birth\s*date|জন্ম\s*তারিখ)\s*[:\-]?\s*(.{0,40})", text, re.I)
    return parse_date(m[2]) if m else None


def find_skills(text: str) -> list[str]:
    lower = text.lower()
    found = []
    for name, aliases in SKILLS.items():
        # One-letter names ("C", "R") are only trusted when written exactly like that in a list: "C, C++, Python"
        if len(name) == 1:
            if re.search(rf"(^|[\s,;|(]){re.escape(name)}([\s,;|)]|$)(?!\+)", text):
                found.append(name)
            continue
        if any(_contains(lower, spelling) for spelling in [name, *aliases]):
            found.append(name)
    return found


LEVELS = [
    ("PhD", r"\b(ph\.?\s?d|doctor\s+of\s+philosophy)\b"),
    ("Masters", r"\b(m\.?\s?sc|m\.?\s?s\.?s|mba|m\.?\s?com|m\.?\s?a|m\.?\s?eng|master'?s?(\s+of|\s+in)?)\b"),
    ("Bachelor", r"\b(b\.?\s?sc|b\.?\s?s\.?s|bba|b\.?\s?com|b\.?\s?a|b\.?\s?eng|bachelor'?s?(\s+of|\s+in)?|honou?rs)\b"),
    ("Diploma", r"\bdiploma\b"),
    ("HSC", r"\b(hsc|h\.s\.c|higher\s+secondary(\s+certificate)?|alim|a[\s\-]level)\b"),
    ("SSC", r"\b(ssc|s\.s\.c|secondary\s+school\s+certificate|dakhil|o[\s\-]level)\b"),
]
INSTITUTION = re.compile(r"[^,|;\n]*(university|college|school|institute|madrasa[h]?|academy|polytechnic)[^,|;\n]*", re.I)
RESULT = re.compile(
    r"((c?gpa)\s*[:\-]?\s*(\d\.\d{1,2})(\s*(/|out\s+of)\s*(\d\.\d{1,2}|\d))?)|(first|second|third)\s+(class|division)",
    re.I,
)
YEAR = re.compile(r"(?<!\d)(19[89]\d|20[0-4]\d)(?!\d)")


def _degree_level(line: str) -> tuple[str, str] | None:
    for level, pattern in LEVELS:
        if m := re.search(pattern, line, re.I):
            return level, m[0]
    return None


def find_education(lines: list[str]) -> list[dict]:
    """One entry per degree line, using the next few lines for institution / result / year."""
    entries = []
    degree_rows = [i for i, line in enumerate(lines) if _degree_level(line)]
    for n, i in enumerate(degree_rows):
        end = degree_rows[n + 1] if n + 1 < len(degree_rows) else min(len(lines), i + 4)
        block = "\n".join(lines[i:min(end, i + 4)])
        level, degree_text = _degree_level(lines[i])

        subject = None
        if m := re.search(r"\bin\s+([A-Za-z&,.\s]{3,60}?)(?=\s*(\(|,|;|\||-|from|at|\d|$))", lines[i], re.I):
            subject = m[1].strip(" ,.")
        elif m := re.search(r"\(([A-Z&]{2,6})\)", lines[i]):  # "BSc (CSE)"
            subject = m[1]

        institution = None
        if m := INSTITUTION.search(block):
            institution = m[0].strip(" -–:")[:100]

        result = None
        if m := RESULT.search(block):
            result = m[0].strip()

        years = [int(y) for y in YEAR.findall(block)]
        entries.append(
            {
                "level": level,
                "degree": lines[i].strip()[:120] or degree_text,
                "subject": subject,
                "institution": institution,
                "result": result,
                "year": max(years) if years else None,
            }
        )
    # Highest level first
    order = [lvl for lvl, _ in LEVELS]
    entries.sort(key=lambda e: order.index(e["level"]))
    return entries


DATE_RANGE = re.compile(
    rf"(?:{MONTH_WORD}\s*,?\s*)?((?:19|20)\d\d)\s*(?:-|–|—|to)\s*(present|current|now|till\s+date|(?:{MONTH_WORD}\s*,?\s*)?((?:19|20)\d\d))",
    re.I,
)


def find_experience_years(text: str, experience_lines: list[str], today: date | None = None) -> tuple[float | None, str]:
    """Either '3 years of experience' written in the CV, or the job date ranges added up."""
    if m := re.search(r"(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:\w+\s+)?experience", text, re.I):
        return float(m[1]), "text"

    today = today or date.today()
    months = 0
    for m in DATE_RANGE.finditer("\n".join(experience_lines)):
        start_month = MONTHS[m[1][:3].lower()] if m[1] else 1
        start_year = int(m[2])
        if m[3].lower().startswith(("present", "current", "now", "till")):
            end_year, end_month = today.year, today.month
        else:
            end_month = MONTHS[m[4][:3].lower()] if m[4] else 12
            end_year = int(m[5])
        span = (end_year - start_year) * 12 + (end_month - start_month)
        if 0 < span < 600:
            months += span
    if months:
        return round(months / 12, 1), "text"
    return None, "text"


# ---------- main ----------

def parse_cv(text: str, today: date | None = None) -> dict:
    lines = [line.strip() for line in text.translate(BANGLA_DIGITS).splitlines() if line.strip()]
    sections = split_sections(lines)
    full_text = "\n".join(lines)

    education = find_education(sections.get("education") or lines)
    experience_years, _ = find_experience_years(full_text, sections.get("experience", []), today)
    summary_lines = sections.get("summary", [])
    summary = " ".join(summary_lines)[:600] or None

    fields = {
        "fullName": field(find_name(lines)),
        "dateOfBirth": field(find_date_of_birth(full_text)),
        "skills": field(find_skills(full_text)),
        "education": field(education),
        "experienceYears": field(experience_years),
        "summary": field(summary),
    }

    warnings = []
    if not fields["skills"]:
        warnings.append("No known skills were found. Please add your skills by hand.")
    if not education:
        warnings.append("No education entries were found. Please add your degrees by hand.")

    return {"fields": {k: v for k, v in fields.items() if v is not None}, "warnings": warnings}
