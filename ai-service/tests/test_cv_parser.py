import io
from datetime import date

import pytest
from docx import Document

from app.cv_parser import find_education, find_skills, parse_cv, parse_date, skills_from_section, split_sections
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


def test_skills_section_with_group_labels_and_unknown_skills():
    # Grouped skills, as PDFs often extract them: labels mid-line and items wrapped across lines
    section = [
        "Languages: Python, JavaScript, C/C++, SQL Web/Backend: React, Node.js, Express.js, REST APIs, HTML,",
        "CSS, Tailwind CSS",
        "Databases: PostgreSQL, MongoDB, Mongoose, PL/pgSQL AI/ML: PyTorch, scikit-learn, BERT, Hugging Face,",
        "β-VAE, NLP, TF-IDF, XGBoost, LSTM, GRU",
        "Tools/APIs: Git, GitHub, JWT, Axios, Socket.IO, Vercel, Cloudinary, Gemini API, Google Maps/Leaflet",
        "Frameworks & Libraries: SomeBrandNewLib",
    ]
    skills = skills_from_section(section)
    assert skills[:5] == ["Python", "JavaScript", "C", "C++", "SQL"]
    for expected in ["React", "Node.js", "Express", "REST API", "Tailwind CSS", "Mongoose", "PL/pgSQL",
                     "scikit-learn", "Hugging Face", "β-VAE", "TF-IDF", "XGBoost", "GRU", "GitHub", "JWT",
                     "Socket.IO", "Cloudinary", "Gemini API", "Google Maps API", "Leaflet", "SomeBrandNewLib"]:
        assert expected in skills, expected
    # group labels must not become skills
    for label in ["Languages", "Web/Backend", "Databases", "AI/ML", "Tools/APIs", "Frameworks & Libraries"]:
        assert label not in skills


def test_skills_section_bullets_and_sentences():
    skills = skills_from_section(["• Communication • Leadership", "- MS Excel; Tally", "I am a quick learner who loves to work in teams"])
    assert skills == ["Communication", "Leadership", "MS Excel", "Tally"]


def test_common_words_are_not_skills():
    # "rest", "spring", "transformers" used to be aliases and matched ordinary sentences
    assert find_skills("I helped the rest of the team in spring 2024 with power transformers.") == []


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


def test_education_institution_line_before_degree():
    # Layout where the institution and year come ABOVE each degree
    edu = find_education([
        "Sample University, Dhaka 2026",
        "B.Sc. in Computer Science and Engineering CGPA: 3.40/4.00",
        "Sample City College, Rajshahi 2021",
        "HSC GPA: 5.00/5.00",
        "Sample High School, Rajshahi 2019",
        "SSC GPA: 5.00/5.00",
    ])
    assert [(e["level"], e["institution"], e["year"]) for e in edu] == [
        ("Bachelor", "Sample University", 2026),
        ("HSC", "Sample City College", 2021),
        ("SSC", "Sample High School", 2019),
    ]
    assert edu[0]["subject"] == "Computer Science and Engineering"
    assert edu[0]["degree"] == "B.Sc. in Computer Science and Engineering"
    assert edu[0]["result"] == "CGPA: 3.40/4.00"


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
