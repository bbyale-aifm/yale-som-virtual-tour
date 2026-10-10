"""Pydantic models shared by the database layer, tools, agents, and API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CourseRow(BaseModel):
    """One section row from the `courses` table in data/yale_som.db."""

    course_number: str
    section: str
    course_title: str
    course_category: str
    course_type: str
    course_session: str
    units: str
    daytimes: str
    room: str
    faculty_1: str
    course_description: str
    faculty_bio: str


class CourseHit(BaseModel):
    """Slimmed-down row the agent sees from search tools (keeps prompts small)."""

    course_number: str
    section: str
    course_title: str
    faculty: str
    category: str
    session: str
    daytimes: str
    room: str
    description: str

    @classmethod
    def from_row(cls, r: CourseRow, max_desc: int = 500) -> "CourseHit":
        desc = r.course_description.replace("\r\n", " ")
        return cls(
            course_number=r.course_number,
            section=r.section,
            course_title=r.course_title,
            faculty=r.faculty_1,
            category=r.course_category,
            session=r.course_session,
            daytimes=" ".join(r.daytimes.split()),
            room=r.room,
            description=desc if len(desc) <= max_desc else desc[:max_desc].rstrip() + "…",
        )


class SearchResult(BaseModel):
    total_matches: int = Field(description="Matching section rows in the database")
    returned: int
    courses: list[CourseHit]


class ProfessorInfo(BaseModel):
    """What the frontend needs to show a professor and open a chat."""

    id: str
    name: str
    faculty_name: str = Field(description="Name exactly as stored in the database")
    room: str
    courses: list[str]
    greeting: str
    styled: bool = Field(description="True when this professor has a custom speaking style")


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str = Field(default="default", max_length=100)


class ChatResponse(BaseModel):
    professor: str
    reply: str
    tools_used: list[str] = Field(default_factory=list)
