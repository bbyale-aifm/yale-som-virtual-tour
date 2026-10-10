"""Read-only helpers over data/yale_som.db (one row per course section)."""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path

from models import CourseRow

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "yale_som.db"
COLUMNS = list(CourseRow.model_fields)


def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def _rows(sql: str, params: tuple = ()) -> list[CourseRow]:
    with _connect() as con:
        cur = con.execute(f"SELECT {', '.join(COLUMNS)} FROM courses {sql}", params)
        return [CourseRow(**{k: (r[k] or "") for k in COLUMNS}) for r in cur]


def _norm_number(text: str) -> str:
    # "mgt409" / "MGT  409" -> "MGT 409"
    m = re.match(r"^\s*([A-Za-z]+)\s*(\d+)\s*$", text)
    return f"{m.group(1).upper()} {m.group(2)}" if m else text.strip()


def courses_for_faculty(name: str) -> list[CourseRow]:
    """All sections taught by a faculty member ("Zaman, Tauhid" or just "Zaman")."""
    return _rows("WHERE faculty_1 LIKE ? ORDER BY course_number, section", (f"%{name}%",))


def get_course(number: str) -> list[CourseRow]:
    return _rows("WHERE course_number = ? ORDER BY section", (_norm_number(number),))


def search_courses(query: str = "", faculty: str = "", category: str = "", limit: int = 15) -> tuple[int, list[CourseRow]]:
    """Every query word must appear in number/title/description/faculty/category/bio."""
    where, params = [], []
    hay = "(course_number || ' ' || course_title || ' ' || course_description || ' ' || faculty_1 || ' ' || course_category || ' ' || course_type || ' ' || faculty_bio || ' ' || daytimes || ' ' || room)"
    for word in re.findall(r"\w+", query.lower()):
        where.append(f"lower({hay}) LIKE ?")
        params.append(f"%{word}%")
    if faculty:
        where.append("faculty_1 LIKE ?")
        params.append(f"%{faculty}%")
    if category:
        where.append("lower(course_category) LIKE ?")
        params.append(f"%{category.lower()}%")
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    rows = _rows(f"{clause} ORDER BY course_number, section", tuple(params))
    return len(rows), rows[:limit]


def all_faculty() -> list[str]:
    with _connect() as con:
        cur = con.execute("SELECT DISTINCT faculty_1 FROM courses WHERE faculty_1 != '' ORDER BY faculty_1")
        return [r[0] for r in cur]
