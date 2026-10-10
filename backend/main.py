"""Yale SOM Virtual: professor chat API.

Run from backend/:  uvicorn main:app --port 8002
API docs:           http://127.0.0.1:8002/docs
Frontend (Vite):    http://127.0.0.1:5173  (proxies /api to this server)
"""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# .env can live in the project or any folder above it (e.g. the course folder)
for folder in Path(__file__).resolve().parents:
    load_dotenv(folder / ".env")

import agent  # noqa: E402  (needs the env loaded first)
import professors  # noqa: E402
from models import ChatRequest, ChatResponse, ProfessorInfo  # noqa: E402

app = FastAPI(title="Yale SOM Virtual: Professors", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/professors", response_model=list[ProfessorInfo])
def list_professors(styled_only: bool = False):
    profs = professors.list_professors()
    return [p for p in profs if p.styled] if styled_only else profs


@app.get("/api/professors/{prof_id}", response_model=ProfessorInfo)
def get_professor(prof_id: str):
    p = professors.info(prof_id)
    if not p:
        raise HTTPException(404, f"No professor '{prof_id}'")
    return p


@app.post("/api/professors/{prof_id}/chat", response_model=ChatResponse)
async def chat(prof_id: str, body: ChatRequest):
    if not professors.faculty_for(prof_id):
        raise HTTPException(404, f"No professor '{prof_id}'")
    try:
        reply, tools_used = await agent.chat(prof_id, body.message, body.session_id)
    except Exception as exc:
        raise HTTPException(502, f"The professor couldn't answer: {exc}") from exc
    return ChatResponse(professor=prof_id, reply=reply, tools_used=tools_used)


@app.delete("/api/professors/{prof_id}/chat/{session_id}")
def reset_chat(prof_id: str, session_id: str):
    agent.reset(prof_id, session_id)
    return {"ok": True}
