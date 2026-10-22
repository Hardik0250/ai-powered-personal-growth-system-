from datetime import date, datetime
import base64
import hashlib
import hmac
import os
import secrets
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Date, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker, Session

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./growth_system.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)
engine_options = {"connect_args": {"check_same_thread": False}} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

APP_ENV = os.getenv("APP_ENV", "development").lower()
APP_PASSWORD = os.getenv("APP_PASSWORD")
APP_SECRET_KEY = os.getenv("APP_SECRET_KEY")
AUTH_ENABLED = bool(APP_PASSWORD)
if APP_ENV == "production" and (not APP_PASSWORD or not APP_SECRET_KEY):
    raise RuntimeError("APP_PASSWORD and APP_SECRET_KEY must be set in production")
if AUTH_ENABLED and not APP_SECRET_KEY:
    raise RuntimeError("APP_SECRET_KEY must be set when APP_PASSWORD is configured")
if APP_ENV == "production" and len(APP_PASSWORD) < 16:
    raise RuntimeError("APP_PASSWORD must be at least 16 characters in production")
if APP_ENV == "production" and len(APP_SECRET_KEY) < 32:
    raise RuntimeError("APP_SECRET_KEY must be at least 32 characters in production")

configured_origins = os.getenv("CORS_ORIGINS", "")
allowed_origins = [] if APP_ENV == "production" else ["http://localhost:5173", "http://127.0.0.1:5173"]
allowed_origins.extend(origin.strip().rstrip("/") for origin in configured_origins.split(",") if origin.strip())
if APP_ENV == "production" and not allowed_origins:
    raise RuntimeError("CORS_ORIGINS must contain the frontend origin in production")

class Habit(Base):
    __tablename__ = "habits"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    category = Column(String(60), default="Personal")
    completed_today = Column(Boolean, default=False)
    streak = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class Goal(Base):
    __tablename__ = "goals"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(180), nullable=False)
    category = Column(String(60), default="Personal")
    progress = Column(Integer, default=0)
    target_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id = Column(Integer, primary_key=True, index=True)
    mood = Column(String(40), default="Good")
    note = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI-Powered Personal Growth System", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class HabitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = "Personal"

class GoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    category: str = "Personal"
    target_date: Optional[date] = None

class GoalProgress(BaseModel):
    progress: int = Field(ge=0, le=100)

class CoachRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)

class LoginRequest(BaseModel):
    password: str = Field(min_length=16, max_length=256)

def encode_token_part(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")

def create_auth_token() -> str:
    payload = f"{int(time.time()) + 12 * 60 * 60}:{secrets.token_urlsafe(16)}"
    encoded_payload = encode_token_part(payload.encode("utf-8"))
    signature = hmac.new(APP_SECRET_KEY.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded_payload}.{encode_token_part(signature)}"

def valid_auth_token(token: str) -> bool:
    try:
        encoded_payload, provided_signature = token.split(".", 1)
        payload = base64.urlsafe_b64decode(encoded_payload + "=" * (-len(encoded_payload) % 4)).decode("utf-8")
        expires_at = int(payload.split(":", 1)[0])
        expected_signature = encode_token_part(
            hmac.new(APP_SECRET_KEY.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256).digest()
        )
        return expires_at > int(time.time()) and hmac.compare_digest(provided_signature, expected_signature)
    except (ValueError, UnicodeDecodeError):
        return False

def require_auth(authorization: Optional[str] = Header(default=None)):
    if not AUTH_ENABLED:
        return
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not valid_auth_token(token):
        raise HTTPException(status_code=401, detail="Please sign in to continue")

api = APIRouter(prefix="/api", dependencies=[Depends(require_auth)])

def habit_dict(h):
    return {"id": h.id, "name": h.name, "category": h.category,
            "completed_today": h.completed_today, "streak": h.streak}

def goal_dict(g):
    return {"id": g.id, "title": g.title, "category": g.category,
            "progress": g.progress, "target_date": g.target_date.isoformat() if g.target_date else None}

@app.get("/")
def root():
    return {"message": "AI-Powered Personal Growth System API is running"}

@app.get("/api/auth/config")
def auth_config():
    return {"required": AUTH_ENABLED}

@app.post("/api/login")
def login(payload: LoginRequest):
    if not AUTH_ENABLED:
        raise HTTPException(status_code=404, detail="Sign-in is not enabled")
    if not hmac.compare_digest(payload.password, APP_PASSWORD):
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"token": create_auth_token(), "expires_in": 43200}

@api.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    habits = db.query(Habit).order_by(Habit.id.desc()).all()
    goals = db.query(Goal).order_by(Goal.id.desc()).all()
    total = len(habits)
    completed = sum(1 for h in habits if h.completed_today)
    habit_rate = round((completed / total) * 100) if total else 0
    goal_avg = round(sum(g.progress for g in goals) / len(goals)) if goals else 0
    score = round(habit_rate * 0.6 + goal_avg * 0.4) if (habits or goals) else 0
    return {
        "growth_score": score,
        "habit_completion": habit_rate,
        "completed_habits": completed,
        "total_habits": total,
        "goal_average": goal_avg,
        "habits": [habit_dict(h) for h in habits],
        "goals": [goal_dict(g) for g in goals],
        "weekly": [
            {"day": "Mon", "score": max(15, score - 18)},
            {"day": "Tue", "score": max(20, score - 12)},
            {"day": "Wed", "score": max(24, score - 9)},
            {"day": "Thu", "score": max(28, score - 5)},
            {"day": "Fri", "score": max(30, score - 3)},
            {"day": "Sat", "score": max(35, score - 1)},
            {"day": "Today", "score": score}
        ]
    }

@api.get("/habits")
def list_habits(db: Session = Depends(get_db)):
    return [habit_dict(h) for h in db.query(Habit).order_by(Habit.id.desc()).all()]

@api.post("/habits")
def create_habit(payload: HabitCreate, db: Session = Depends(get_db)):
    habit = Habit(name=payload.name.strip(), category=payload.category.strip() or "Personal")
    db.add(habit); db.commit(); db.refresh(habit)
    return habit_dict(habit)

@api.patch("/habits/{habit_id}/toggle")
def toggle_habit(habit_id: int, db: Session = Depends(get_db)):
    habit = db.query(Habit).filter(Habit.id == habit_id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    habit.completed_today = not habit.completed_today
    habit.streak = max(0, habit.streak + (1 if habit.completed_today else -1))
    db.commit(); db.refresh(habit)
    return habit_dict(habit)

@api.delete("/habits/{habit_id}")
def delete_habit(habit_id: int, db: Session = Depends(get_db)):
    habit = db.query(Habit).filter(Habit.id == habit_id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    db.delete(habit); db.commit()
    return {"ok": True}

@api.get("/goals")
def list_goals(db: Session = Depends(get_db)):
    return [goal_dict(g) for g in db.query(Goal).order_by(Goal.id.desc()).all()]

@api.post("/goals")
def create_goal(payload: GoalCreate, db: Session = Depends(get_db)):
    goal = Goal(title=payload.title.strip(), category=payload.category.strip() or "Personal", target_date=payload.target_date)
    db.add(goal); db.commit(); db.refresh(goal)
    return goal_dict(goal)

@api.patch("/goals/{goal_id}")
def update_goal(goal_id: int, payload: GoalProgress, db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    goal.progress = payload.progress
    db.commit(); db.refresh(goal)
    return goal_dict(goal)

@api.delete("/goals/{goal_id}")
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal); db.commit()
    return {"ok": True}

@api.post("/coach")
def coach(payload: CoachRequest, db: Session = Depends(get_db)):
    habits = db.query(Habit).all()
    goals = db.query(Goal).all()
    user_message = payload.message.strip()
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            context = (
                f"User habits: {[{'name': h.name, 'done_today': h.completed_today, 'streak': h.streak} for h in habits]}. "
                f"User goals: {[{'title': g.title, 'progress': g.progress, 'category': g.category} for g in goals]}. "
                "Act as a supportive personal growth coach. Give practical, specific, non-medical advice. "
                "Use concise headings and a 3-step action plan."
            )
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=f"{context}\nUser request: {user_message}"
            )
            return {"reply": response.text or "Try choosing one small action and completing it today.", "mode": "Gemini AI"}
        except Exception:
            pass

    completed = sum(1 for h in habits if h.completed_today)
    total = len(habits)
    goal_avg = round(sum(g.progress for g in goals) / len(goals)) if goals else 0
    lower = user_message.lower()
    if any(w in lower for w in ["study", "exam", "college", "learn"]):
        plan = "1. Choose one subject and study for 25 minutes.\n2. Take a 5-minute break, then solve 3 practice questions.\n3. Before sleeping, write down the next topic to revise."
    elif any(w in lower for w in ["gym", "fitness", "exercise", "workout"]):
        plan = "1. Schedule a realistic 30-minute workout or walk.\n2. Prepare your clothes and water bottle in advance.\n3. Track consistency first; increase intensity gradually."
    elif any(w in lower for w in ["time", "productive", "focus", "procrastinat"]):
        plan = "1. Pick your top 3 priorities for tomorrow.\n2. Put your phone away for one 25-minute focus block.\n3. Review what worked at the end of the day."
    else:
        plan = "1. Select one meaningful goal for this week.\n2. Break it into a task that takes 15–30 minutes.\n3. Complete it today and record the result."
    reply = (
        "Your Personal Growth Action Plan\n\n"
        f"Current snapshot: {completed}/{total} habits completed today; average goal progress: {goal_avg}%.\n\n"
        f"{plan}\n\n"
        "Tip: keep the plan small enough to repeat. Consistency over time matters more than one perfect day."
    )
    return {"reply": reply, "mode": "Built-in coach (offline fallback)"}

@api.post("/journal")
def add_journal(payload: dict, db: Session = Depends(get_db)):
    mood = str(payload.get("mood", "Good"))[:40]
    note = str(payload.get("note", ""))[:2000]
    entry = JournalEntry(mood=mood, note=note)
    db.add(entry); db.commit(); db.refresh(entry)
    return {"id": entry.id, "mood": entry.mood, "note": entry.note, "created_at": entry.created_at.isoformat()}

@api.get("/journal")
def list_journal(db: Session = Depends(get_db)):
    entries = db.query(JournalEntry).order_by(JournalEntry.id.desc()).limit(20).all()
    return [{"id": e.id, "mood": e.mood, "note": e.note, "created_at": e.created_at.isoformat()} for e in entries]

app.include_router(api)
