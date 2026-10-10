"""One PydanticAI agent per professor, plus their course-lookup tools.

Model calls go through Portkey (gpt-6-astra by default; override with OPENAI_MODEL).
Chat history is kept in memory per (professor, session_id) so follow-ups work.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache

from openai import AsyncOpenAI
from pydantic_ai import Agent, RunContext, UsageLimits
from pydantic_ai.messages import ModelMessage, ModelRequest, UserPromptPart
from pydantic_ai.models.openai import OpenAIResponsesModel
from pydantic_ai.providers.openai import OpenAIProvider

import db
import professors
from models import CourseHit, SearchResult

DEFAULT_MODEL = "gpt-6-astra"
USAGE_LIMITS = UsageLimits(request_limit=8, tool_calls_limit=6)
MAX_HISTORY = 30  # messages kept per conversation
os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")


@dataclass
class ProfDeps:
    faculty_name: str
    tools_used: list[str] = field(default_factory=list)

    def used(self, name: str) -> None:
        if name not in self.tools_used:
            self.tools_used.append(name)


@lru_cache(maxsize=1)
def get_model() -> OpenAIResponsesModel:
    api_key = os.getenv("PORTKEY_API_KEY")
    if not api_key:
        raise RuntimeError("PORTKEY_API_KEY is missing from .env")
    client = AsyncOpenAI(
        api_key=api_key,
        base_url="https://api.portkey.ai/v1",
        default_headers={"x-portkey-provider": "openai"},
    )
    return OpenAIResponsesModel(
        os.getenv("OPENAI_MODEL", DEFAULT_MODEL), provider=OpenAIProvider(openai_client=client)
    )


def _search(query: str = "", faculty: str = "", category: str = "") -> SearchResult:
    total, rows = db.search_courses(query, faculty, category)
    hits = [CourseHit.from_row(r) for r in rows]
    return SearchResult(total_matches=total, returned=len(hits), courses=hits)


@lru_cache(maxsize=64)
def get_agent(prof_id: str) -> Agent[ProfDeps, str]:
    agent = Agent(
        get_model(),
        deps_type=ProfDeps,
        output_type=str,
        instructions=professors.build_prompt(prof_id),
        retries=1,
    )

    @agent.tool
    def search_courses(
        ctx: RunContext[ProfDeps], query: str = "", faculty: str = "", category: str = ""
    ) -> SearchResult:
        """Search all Yale SOM courses in the database.

        Args:
            query: Keywords that must all appear (title, number, topic, description, times, room).
            faculty: Part of a faculty member's name, e.g. "Kelly".
            category: Course category, e.g. Core, Finance, Marketing, EMBA, Economics.
        """
        ctx.deps.used("search_courses")
        return _search(query, faculty, category)

    @agent.tool
    def get_course(ctx: RunContext[ProfDeps], course_number: str) -> list[CourseHit]:
        """Get every section of one course by its number, e.g. "MGT 403"."""
        ctx.deps.used("get_course")
        return [CourseHit.from_row(r, max_desc=1500) for r in db.get_course(course_number)]

    @agent.tool
    def my_courses(ctx: RunContext[ProfDeps]) -> list[CourseHit]:
        """Your own sections this term, with days, times, and rooms."""
        ctx.deps.used("my_courses")
        return [CourseHit.from_row(r) for r in db.courses_for_faculty(ctx.deps.faculty_name)]

    return agent


_histories: dict[tuple[str, str], list[ModelMessage]] = {}


def _trim(history: list[ModelMessage]) -> list[ModelMessage]:
    """Keep the last ~MAX_HISTORY messages, cut at a user turn so tool calls stay paired."""
    if len(history) <= MAX_HISTORY:
        return history
    for i in range(len(history) - MAX_HISTORY, len(history)):
        msg = history[i]
        if isinstance(msg, ModelRequest) and any(isinstance(p, UserPromptPart) for p in msg.parts):
            return history[i:]
    return history[-1:]


async def chat(prof_id: str, message: str, session_id: str) -> tuple[str, list[str]]:
    faculty = professors.faculty_for(prof_id)
    if not faculty:
        raise KeyError(prof_id)
    key = (prof_id, session_id)
    deps = ProfDeps(faculty_name=faculty)
    result = await get_agent(prof_id).run(
        message, deps=deps, message_history=_histories.get(key), usage_limits=USAGE_LIMITS
    )
    _histories[key] = _trim(result.all_messages())
    return result.output, deps.tools_used


def reset(prof_id: str, session_id: str) -> None:
    _histories.pop((prof_id, session_id), None)
