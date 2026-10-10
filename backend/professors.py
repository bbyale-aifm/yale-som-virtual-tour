"""Professor registry: every faculty member in the database can be a chat agent.

Professors with a custom speaking style live in STYLED below (style text in
prompts/styles/<id>.md). Everyone else gets a neutral, friendly professor voice.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import db
from models import CourseRow, ProfessorInfo

PROMPTS = Path(__file__).resolve().parent / "prompts"

DEFAULT_STYLE = (
    "- Friendly, clear, and encouraging, like a good office-hours conversation.\n"
    "- Plain English; define jargon when you use it."
)


@dataclass(frozen=True)
class Styled:
    faculty_name: str  # as stored in the database ("Last, First")
    greeting: str


# Add professors here as their styles get designed.
STYLED: dict[str, Styled] = {
    "zaman": Styled(
        faculty_name="Zaman, Tauhid",
        greeting="Yo yo yo! Welcome to MGT 409 🖤💗 What's good? Ask me anything: AI, stats, regression, or what classes to take, I got you.",
    ),
}


def display_name(faculty_name: str) -> str:
    last, _, first = faculty_name.partition(",")
    return f"{first.strip()} {last.strip()}".strip()


def slug(faculty_name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", display_name(faculty_name).lower()).strip("-")


@lru_cache(maxsize=1)
def _id_to_faculty() -> dict[str, str]:
    ids = {slug(f): f for f in db.all_faculty()}
    ids.update({pid: s.faculty_name for pid, s in STYLED.items()})
    return ids


def faculty_for(prof_id: str) -> str | None:
    return _id_to_faculty().get(prof_id)


def _primary_room(rows: list[CourseRow]) -> str:
    rooms = [r.room for r in rows if r.room.strip()]
    return max(set(rooms), key=rooms.count) if rooms else "TBA"


def info(prof_id: str) -> ProfessorInfo | None:
    faculty = faculty_for(prof_id)
    if not faculty:
        return None
    rows = db.courses_for_faculty(faculty)
    styled = STYLED.get(prof_id)
    name = display_name(faculty)
    return ProfessorInfo(
        id=prof_id,
        name=name,
        faculty_name=faculty,
        room=_primary_room(rows),
        courses=list(dict.fromkeys(f"{r.course_number} {r.course_title}" for r in rows)),
        greeting=styled.greeting if styled else f"Hello! I'm Professor {name.split()[-1]}. What can I help you with?",
        styled=styled is not None,
    )


def list_professors() -> list[ProfessorInfo]:
    return [p for pid in _id_to_faculty() if (p := info(pid))]


def build_prompt(prof_id: str) -> str:
    """System prompt assembled from the database plus the professor's style file."""
    faculty = faculty_for(prof_id)
    if not faculty:
        raise KeyError(prof_id)
    rows = db.courses_for_faculty(faculty)
    courses: dict[str, list[CourseRow]] = {}
    for r in rows:
        courses.setdefault(f"{r.course_number}: {r.course_title}", []).append(r)
    course_md = []
    for title, secs in courses.items():
        first = secs[0]
        times = "; ".join(
            f"sec {s.section} {' '.join(s.daytimes.split()) or 'time TBA'} in {s.room or 'room TBA'}" for s in secs
        )
        desc = first.course_description.replace("\r\n", " ").strip()
        course_md.append(
            f"### {title}\n- Category: {first.course_category} · {first.course_session} · {first.units} units\n"
            f"- Sections: {times}\n- Description: {desc or 'n/a'}"
        )
    bio = next((r.faculty_bio for r in rows if r.faculty_bio.strip()), "") or "No bio on file."
    style_file = PROMPTS / "styles" / f"{prof_id}.md"
    style = style_file.read_text(encoding="utf-8") if style_file.exists() else DEFAULT_STYLE
    return (PROMPTS / "professor.md").read_text(encoding="utf-8").format(
        display_name=display_name(faculty),
        room=_primary_room(rows),
        bio=bio.strip(),
        courses="\n\n".join(course_md) or "No courses on file this term.",
        style=style.strip(),
    )
