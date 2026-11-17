import io
from datetime import date

import pytest
from docx import Document

from app.cv_parser import find_education, find_skills, parse_cv, parse_date, split_sections
from app.cv_text import CvReadError, extract_text

# A made-up CV in a typical Bangladeshi format (not a real person).
SAMPLE_CV = """
RAHIM UDDIN AHMED
Mirpur, Dhaka | rahim.sample@example.com | +880 1700-000000

Career Objective
Aspiring software engineer who enjoys building web applications with React and Node.js.

Education
B.Sc. in Computer Science and Engineering
Sample University of Dhaka
CGPA: 3.62 / 4.00                          2019 - 2023
Higher Secondary Certificate (HSC), Science
Sample College, Dhaka — GPA 5.00, 2018
Secondary School Certificate (SSC)
Sample High School — GPA 5.00 out of 5, 2016

Work Experience
Junior Software Engineer, Example Tech Ltd
Jan 2024 - Present
Intern, Demo Software
Jun 2023 - Dec 2023

Technical Skills
JavaScript, TypeScript, React.js, Next.js, NodeJS, Express, PostgreSQL, Git, Docker, C, C++, REST APIs

Languages
English, Bangla

Personal Information
Date of Birth: 15th March, 2001
"""


def test_reads_the_basics():
    result = parse_cv(SAMPLE_CV, today=date(2026, 11, 17))
    f = result["fields"]
    assert f["fullName"]["value"] == "Rahim Uddin Ahmed"
    assert f["dateOfBirth"]["value"] == "2001-03-15"
    assert "Aspiring software engineer" in f["summary"]["value"]
    assert result["warnings"] == []


def test_skills_with_different_spellings():
    skills = find_skills(SAMPLE_CV)
    for expected in ["JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Express", "PostgreSQL",
                     "Git", "Docker", "C", "C++", "REST API", "English", "Bangla"]:
        assert expected in skills, expected
    assert "Java" not in skills  # "JavaScript" must not count as Java
    assert "R" not in skills


def test_education_entries():
    edu = parse_cv(SAMPLE_CV)["fields"]["education"]["value"]
    assert [e["level"] for e in edu] == ["Bachelor", "HSC", "SSC"]
    bsc = edu[0]
    assert bsc["subject"] == "Computer Science and Engineering"
    assert "Sample University" in bsc["institution"]
    assert "3.62" in bsc["result"]
    assert bsc["year"] == 2023
    assert edu[1]["result"].startswith("GPA 5.00")
    assert edu[2]["year"] == 2016


def test_experience_adds_up_date_ranges():
    # Jan 2024 -> Nov 2026 = 34 months, Jun 2023 -> Dec 2023 = 6 months: 40 months ≈ 3.3 years
    f = parse_cv(SAMPLE_CV, today=date(2026, 11, 17))["fields"]
    assert f["experienceYears"]["value"] == 3.3


def test_explicit_years_of_experience_wins():
    text = "Profile\nBackend developer with 5+ years of professional experience.\nSkills\nPython"
    assert parse_cv(text)["fields"]["experienceYears"]["value"] == 5.0


def test_warns_when_nothing_found():
    result = parse_cv("Hello\nThis is not really a CV at all, just some words here.")
    assert len(result["warnings"]) == 2


@pytest.mark.parametrize(
    "text,expected",
    [
        ("15/03/2001", "2001-03-15"),
        ("2001-03-15", "2001-03-15"),
        ("15th March, 2001", "2001-03-15"),
        ("March 15, 2001", "2001-03-15"),
        ("১৫/০৩/২০০১", "2001-03-15"),
        ("31/02/2001", None),
    ],
)
def test_parse_date(text, expected):
    assert parse_date(text) == expected


def test_sections_split_on_headings():
    sections = split_sections(["Name", "Education:", "BSc", "Skills", "Python"])
    assert sections["education"] == ["BSc"]
    assert sections["skills"] == ["Python"]


def test_dakhil_and_alim_are_recognised():
    edu = find_education(["Alim, Sample Madrasah, GPA 4.50, 2019", "Dakhil, Sample Madrasah, GPA 4.80, 2017"])
    assert [e["level"] for e in edu] == ["HSC", "SSC"]
    assert "Madrasah" in edu[0]["institution"]


# ---------- reading files ----------

def _docx_bytes(paragraphs: list[str]) -> bytes:
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Skills"
    table.rows[0].cells[1].text = "Python, Django"
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def test_reads_docx_including_tables():
    data = _docx_bytes(["Sample Person", "Career Objective", "I want to build useful software for people."])
    text = extract_text("cv.docx", data)
    assert "Sample Person" in text
    assert "Python, Django" in text


def test_rejects_other_file_types():
    with pytest.raises(CvReadError):
        extract_text("cv.txt", b"plain text file")


def test_rejects_broken_pdf():
    with pytest.raises(CvReadError):
        extract_text("cv.pdf", b"%PDF-1.4 this is not really a pdf")
