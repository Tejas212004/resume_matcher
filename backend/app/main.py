# backend/app/main.py
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import fitz  # PyMuPDF
import docx2txt
import tempfile
import os
import re
import logging
from sentence_transformers import SentenceTransformer, util

# ✅ Import the interview router (already has prefix="/interview" inside interview.py)
from app.interview import router as interview_router

# ----------------- Logging -----------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("resume_matcher")

# ----------------- App init -----------------
app = FastAPI(title="AI-Powered Resume & Interview Assistant")

# ----------------- CORS -----------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change to ["http://localhost:5173"] for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Load model once -----------------
logger.info("🔹 Loading SentenceTransformer model...")
model = SentenceTransformer("all-MiniLM-L6-v2")
logger.info("✅ Model loaded successfully!")

# ----------------- Utility functions -----------------
def extract_text(file: UploadFile) -> str:
    """Extract text from PDF, DOCX, or TXT files."""
    suffix = os.path.splitext(file.filename)[1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name

    text = ""
    try:
        if suffix == ".pdf":
            with fitz.open(tmp_path) as doc:
                for page in doc:
                    text += page.get_text("text")
        elif suffix == ".docx":
            text = docx2txt.process(tmp_path)
        elif suffix == ".txt":
            with open(tmp_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF, DOCX, or TXT.")
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass

    return text.strip()


def extract_skills(text: str) -> list[str]:
    """Extract skills from text using a predefined list."""
    skills = [
        # Core technical
        "python", "java", "javascript", "c++", "sql", "html", "css",
        "react", "node", "django", "flask", "fastapi", "git", "docker",
        "aws", "azure", "gcp", "tensorflow", "pytorch", "machine learning",
        "deep learning", "nlp", "data analysis", "pandas", "numpy",
        # Soft
        "communication", "leadership", "teamwork", "problem solving",
        "project management", "creativity",
    ]
    text = (text or "").lower()
    found = {skill for skill in skills if re.search(rf"\b{re.escape(skill)}\b", text)}
    return list(found)


def semantic_skill_match(resume_skills: list[str], jd_skills: list[str], threshold: float = 0.6):
    """Find semantically similar skills between resume and JD using embeddings."""
    if not resume_skills or not jd_skills:
        return [], 0.0

    resume_embeddings = model.encode(resume_skills, convert_to_tensor=True)
    jd_embeddings = model.encode(jd_skills, convert_to_tensor=True)
    cosine_scores = util.cos_sim(resume_embeddings, jd_embeddings)

    matched = {
        jd_skills[j]
        for i, _ in enumerate(resume_skills)
        for j, _ in enumerate(jd_skills)
        if float(cosine_scores[i][j]) >= threshold
    }

    score = round((len(matched) / len(jd_skills)) * 100, 2) if jd_skills else 0.0
    return list(matched), score


# ----------------- Routes -----------------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/match")
async def match_files(
    resume: UploadFile = File(...),
    jd: UploadFile | None = File(None),
    jd_text: str | None = Form(None),
):
    """
    Compare resume and job description for skill match using semantic similarity.
    Accepts either resume + jd file OR resume + jd_text form field.
    """
    try:
        resume_text = extract_text(resume)

        if jd:
            jd_text_final = extract_text(jd)
        elif jd_text:
            jd_text_final = jd_text.strip()
        else:
            raise HTTPException(status_code=400, detail="Please upload or paste a job description.")

        resume_skills = extract_skills(resume_text)
        jd_skills = extract_skills(jd_text_final)

        matched_skills, match_score = semantic_skill_match(resume_skills, jd_skills)

        return {
            "match_score": match_score,
            "resume_skills": resume_skills,
            "jd_skills": jd_skills,
            "matched_skills": matched_skills,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error in /match")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------- ✅ Include interview router correctly -----------------
# The router already declares prefix="/interview" inside app/interview.py,
# so include it directly (do NOT add another prefix here)
app.include_router(interview_router)

# ----------------- End -----------------
